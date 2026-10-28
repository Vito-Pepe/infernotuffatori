// Costruisce il catalogo dell'app dal materiale grezzo della wiki (vedi sorgenti.js):
// armi, granate, stratagemmi, passive delle armature, potenziamenti e nemici, con le
// statistiche estratte dal gioco. Funzione pura: niente rete, niente file.
const W = require("./wikitesto");
const { costruisciArmature, fattoriArmatura, testo: testoCargo } = require("./armature");
const { enciclopedia, indice, fontiDemolizione, parteAnatomia, PAGINE_MECCANICHE } = require("./enciclopedia");
const { schede, schedeVecchie } = require("./datiattacchi");

// Dati del gioco da cui viene ogni oggetto: servono per le schede complete degli attacchi
// (nei testi della wiki), senza appesantire il catalogo
const SORGENTI = new WeakMap();

// 2: nemici con descrizione e immagine, armature, elmi, mantelli, meccaniche e testi della wiki
// 3: fonti della demolizione, strutture di Super Terra, immagini di elmi e mantelli (e quelle
//    delle armature cambiate: il catalogo del volume di prima non vale più)
const VERSIONE = 4;

// Stratagemmi degli eventi (fuochi d'artificio, sorvoli): non servono in battaglia
const ESCLUSI = new Set(["Eagle Fly By", "Orbital Confetti"]);

// Nemici che non si combattono come gli altri (navi, boss di eventi): nella Wiki sì, nei punteggi no
const NAVI_E_BOSS = new Map([["Dropship", "nave"], ["Warp Ship", "nave"], ["Illuminate Overship", "nave"], ["Leviathan", "nave"], ["Hive Lord", "boss"]]);
const FAZIONI = { terminidi: "Terminids", automi: "Automatons", illuminati: "Illuminate" };

const TIPI_STRATAGEMMA = {
  "support weapon": "arma",
  eagle: "aquila",
  orbital: "orbitale",
  sentry: "torretta",
  emplacement: "postazione",
  backpack: "zaino",
  vehicle: "veicolo",
};

// Icone degli stratagemmi che nella raccolta hanno un nome diverso dalla wiki
const ALIAS_ICONE = {
  "AX/AR-23 Guard Dog": "Guard Dog",
  "AX/LAS-5 Rover": "Guard Dog Rover",
  "AX/ARC-3 K-9": "Guard Dog K-9",
  "AX/FLAM-75 Hot Dog": "Guard Dog Hot Dog",
  "AX/TX-13 Dog Breath": "Guard Dog Breath",
  "MD-8 Gas Mines": "Gas Mine",
  "B-100 Portable Hellbomb": "Hellbomb Portable",
  "CQC-20 Breaching Hammer": "CQC-20",
  "EAT-411 Leveller": "EAT-411",
  "GL-28 Belt-Fed Grenade Launcher": "GL-28",
  "M-102 Gunner FRV": "Fast Recon Vehicle",
  "Eagle Gas Airstrike": "Eagle Gas Strike",
};

// --- Nomi ---

function slug(nome) {
  return String(nome)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Nome come chiave dei dati estratti: maiuscolo, senza virgolette
function chiaveDati(nome) {
  return String(nome).replace(/[“”"']/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

// Toglie la sigla iniziale ("A/MG-43 Machine Gun Sentry" → "Machine Gun Sentry")
function senzaSigla(nome) {
  const pezzi = String(nome).trim().split(/\s+/);
  return pezzi.length > 1 && /[\d/]/.test(pezzi[0]) ? pezzi.slice(1).join(" ") : String(nome).trim();
}

// Per confronti tolleranti: grafia inglese e americana, niente punteggiatura
function normalizza(nome) {
  return chiaveDati(nome)
    .replace(/ARMOUR/g, "ARMOR")
    .replace(/ISATION/g, "IZATION")
    .replace(/ISER\b/g, "IZER")
    .replace(/SABRE/g, "SABER")
    .replace(/([A-Z])LLER\b/g, "$1LER")
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]/g, "");
}

// --- Dati estratti dal gioco ---

function tabelle(modulo) {
  return {
    damage: modulo?.damage || {},
    projectile: modulo?.projectile || {},
    explosion: modulo?.explosion || {},
    beam: modulo?.beam || {},
    arc: modulo?.arc || {},
    spray: modulo?.spray || {},
    weapons: modulo?.weapons || {},
  };
}

const arrotonda = (x, cifre = 2) => (x == null || !Number.isFinite(Number(x)) ? null : Math.round(Number(x) * 10 ** cifre) / 10 ** cifre);

function danno(rec) {
  if (!rec) return null;
  return {
    danno: arrotonda(rec.dmg) ?? 0,
    durevole: arrotonda(rec.dmg2) ?? 0,
    ap: rec.ap1 ?? 0,
    apAngolo: [rec.ap2 ?? 0, rec.ap3 ?? 0, rec.ap4 ?? 0],
    demolizione: rec.demo ?? 0,
    stordimento: rec.stun ?? 0,
    spinta: rec.push ?? 0,
    elemento: rec.element_name && rec.element_name !== "none" ? rec.element_name : null,
    sottotipo: rec.element_name_sub || null,
  };
}

// Stato (fuoco, gas, elettricità, ...) con il suo danno nel tempo
function stato(nome, stati) {
  const s = stati?.status?.[nome];
  if (!s) return { nome };
  const d = s.damage_id ? stati.damage?.[s.damage_id] : null;
  return {
    nome,
    durata: arrotonda(s.duration),
    forza: arrotonda(s.strength),
    dps: d ? arrotonda(d.dmg) : null,
    ap: d ? d.ap1 ?? 0 : null,
  };
}

// Risolve gli attacchi di un'arma: proiettili, esplosioni, raggi, archi, spruzzi, stati
function colpi(attacchi, t, altre, stati, profondita = 0) {
  const out = [];
  for (const a of attacchi || []) {
    const cerca = (tab) => t[tab][a.name] || altre[tab][a.name];
    const prima = out.length;
    if (a.type === "projectile") {
      const p = cerca("projectile");
      const d = p && (t.damage[p.damage_id] || altre.damage[p.damage_id]);
      if (d) out.push({ tipo: "proiettile", ...danno(d), proiettili: p.pellets || 1, velocita: p.velocity ?? null, calibro: p.caliber ?? null, massa: p.mass ?? null, attrito: arrotonda(p.drag) });
    } else if (a.type === "explosion") {
      const e = cerca("explosion");
      const d = e && (t.damage[e.damage_id] || altre.damage[e.damage_id]);
      // Il ritorno di fiamma dei lanciarazzi e l'autodistruzione colpiscono chi spara, non il bersaglio
      const retro = /backblast|overcharge|destruct/i.test(a.name);
      if (d) out.push({ tipo: "esplosione", ...danno(d), raggi: [e.r1 ?? 0, e.r2 ?? 0, e.r3 ?? 0], durataArea: e.aoe_duration || 0, rumore: e.noise || null, ...(retro ? { retro: true } : {}) });
    } else if (a.type === "beam") {
      const b = cerca("beam");
      const d = b && (t.damage[b.damage_id] || altre.damage[b.damage_id]);
      if (d) out.push({ tipo: "raggio", ...danno(d), gittata: b.range ?? null });
    } else if (a.type === "arc") {
      const b = cerca("arc");
      const d = b && (t.damage[b.damage_id] || altre.damage[b.damage_id]);
      if (d) out.push({ tipo: "arco", ...danno(d), gittata: b.range ?? null, catena: b.chain_length ?? 1 });
    } else if (a.type === "spray") {
      const b = cerca("spray");
      const d = b && (t.damage[b.damage_id] || altre.damage[b.damage_id]);
      if (d) out.push({ tipo: "spruzzo", ...danno(d) });
    } else if (a.type === "damage") {
      // Colpo diretto senza proiettile: armi da mischia, coltelli da lancio
      const d = t.damage[a.name] || altre.damage[a.name];
      if (d) out.push({ tipo: "mischia", ...danno(d) });
    } else if (a.type === "status") {
      out.push({ tipo: "stato", ...stato(a.name, stati) });
    } else if (a.type === "weapons" && profondita < 2) {
      // Torrette, mezzi ed esoscheletri usano armi descritte a parte
      const w = t.weapons[a.name] || altre.weapons[a.name];
      if (w) out.push({ tipo: "arma", nome: a.name, ...statArma(w), colpi: colpi(w.attacks, t, altre, stati, profondita + 1) });
      continue;
    }
    // Nome dell'attacco e da cosa parte: un proiettile e le sue esplosioni sono una modalità
    // di fuoco; due proiettili di primo livello sono due modalità diverse (es. munizioni)
    for (const x of out.slice(prima)) {
      x.attacco = a.name;
      x.padre = a.parent || null;
    }
  }
  return out;
}

// Dati nel formato precedente della wiki ("damageid", armi per nome intero): solo per gli
// oggetti che nei dati nuovi non hanno attacchi
const ALIAS_VECCHI = { "B-100 Portable Hellbomb": "NUX-223 Hellbomb", "CQC-73 Entrenchment Tool": "CQC-73 Entrenchment Tool" };

function colpiVecchi(titolo, dati) {
  const cercati = [ALIAS_VECCHI[titolo], titolo, senzaSigla(titolo)].filter(Boolean).map(normalizza);
  for (const M of [dati.nuoviOggetti, dati.vecchi].filter(Boolean)) {
    const voce = Object.entries(M.weapon || {}).find(([k, v]) => cercati.includes(normalizza(k)) || cercati.includes(normalizza(v?.name || "")));
    if (!voce) continue;
    const w = voce[1];
    const out = [];
    for (const a of w.attacks || []) {
      const tabella = { projectile: M.projectile, explosion: M.explosion, arc: M.arc, beam: M.beam }[a.type];
      const rec = tabella?.[a.name];
      const d = M.damage?.[rec ? rec.damageid : a.name];
      if (!d) continue;
      const comune = danno(d);
      if (a.type === "projectile") out.push({ tipo: "proiettile", ...comune, proiettili: rec.pellets || 1, velocita: rec.velocity ?? null, calibro: rec.caliber ?? null, massa: rec.mass ?? null, attrito: arrotonda(rec.drag) });
      else if (a.type === "explosion") out.push({ tipo: "esplosione", ...comune, raggi: [rec.r1 ?? 0, rec.r2 ?? 0, rec.r3 ?? 0], durataArea: 0, rumore: null });
      else if (a.type === "arc") out.push({ tipo: "arco", ...comune, gittata: rec.range ?? null, catena: rec.splits ?? 1 });
      else if (a.type === "beam") out.push({ tipo: "raggio", ...comune, gittata: rec.range ?? null });
      else out.push({ tipo: "mischia", ...comune });
      if (d.status_name) out.push({ tipo: "stato", ...stato(d.status_name, dati.stati) });
    }
    if (!out.length) continue;
    return {
      sorgente: { vecchio: true, modulo: M, arma: w, nome: voce[0] },
      colpi: out,
      stat: numeri({ cadenza: w.rounds_per_minute ?? null, caricatore: w.magazine_capacity ?? null, riserva: w.magazines_refill ?? null, ergonomia: w.ergonomics ?? null }),
    };
  }
  return null;
}

// Pulizie dei dati di combattimento: cadenze non numeriche, armi annidate senza colpi
// (i droni: i colpi stanno fuori, cadenza e caricatore dentro)
function sistemaArmi(c) {
  const numeroValido = (v) => {
    if (v && typeof v === "object") v = Object.values(v).find((x) => Number.isFinite(x));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  for (const k of ["cadenza", "caricatore", "riserva", "iniziali"]) {
    if (k in c) {
      const v = numeroValido(c[k]);
      if (v === undefined) delete c[k];
      else c[k] = v;
    }
  }
  const vuote = (c.colpi || []).filter((x) => x.tipo === "arma" && !x.colpi?.length);
  for (const v of vuote) {
    for (const k of ["cadenza", "caricatore", "riserva", "rumore", "dispersione"]) {
      const val = k === "rumore" ? v[k] : numeroValido(v[k]);
      if (c[k] == null && val != null) c[k] = val;
    }
  }
  c.colpi = (c.colpi || []).filter((x) => !(x.tipo === "arma" && !x.colpi?.length));
  for (const x of c.colpi) if (x.tipo === "arma") sistemaArmi(x);
}

function statArma(w) {
  return {
    cadenza: w.rpm ?? null,
    caricatore: w.cap ?? w.rounds ?? null,
    riserva: w.mags ?? w.roundsupply ?? null,
    iniziali: w.magstart ?? w.roundsstart ?? null,
    munizioni: w.roundtype || null,
    rumore: w.noise || null,
    ergonomia: w.ergonomics ?? null,
    dispersione: w.spread ? arrotonda((w.spread.x + w.spread.y) / 2) : null,
    canne: w.barrels ?? null,
    carica: w.charge ?? null,
  };
}

// --- Pagine della wiki ---

function citazione(testo) {
  for (const t of W.templates(testo)) {
    if (t.nome === "quote") {
      const { posizionali } = W.parametri(t.corpo);
      if (posizionali[0]) return W.pulisci(posizionali[0]);
    }
  }
  return "";
}

function statStratagemma(testo) {
  const t = W.trova(testo, ["Stratagem Stats Table"]);
  return t ? t.nominati : {};
}

function versione(testo) {
  const t = W.trova(testo, ["Last Updated"]);
  return t ? W.pulisci(t.posizionali[0]) : null;
}

function base(pagina, slot, extra = {}) {
  return {
    id: slug(pagina.titolo),
    nome: pagina.titolo,
    slot,
    pagina: pagina.titolo,
    aggiornata: versione(pagina.testo),
    ...extra,
  };
}

// Nomi scritti in modo diverso su qualche pagina della wiki
const FONTI = { Hanger: "Hangar", "Helldivers Mobilize": "Helldivers Mobilize!" };

function fonte(v) {
  // "[[… Warbond|Ironclad Democracy]]<small>{{Tooltip|P3|Page 3}}</small>": la pagina del warbond non serve
  const t = W.pulisci(String(v ?? "").replace(/<small>[\s\S]*?<\/small>/gi, "")).replace(/\s*\bP\d+\b\s*$/, "").trim();
  const nome = FONTI[t] || t;
  return nome && !/^(n\/a|none|-)$/i.test(nome) ? nome : null;
}

function numeri(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0)));
}

function arma(pagina, slot, dati) {
  const ib = W.trova(pagina.testo, ["Infobox Weapon", "Weapon"]);
  if (!ib) return null;
  const p = ib.nominati;
  const w = cercaArma(pagina.titolo, dati);
  const c = w ? colpi(w.arma.attacks, w.t, w.altre, dati.stati) : [];
  const vecchi = c.length ? null : colpiVecchi(pagina.titolo, dati);
  return conSorgenti(vecchi ? [vecchi.sorgente] : w ? [{ voce: w.arma, t: w.t, altre: w.altre }] : [], base(pagina, slot, {
    tipo: W.pulisci(p.weapon_type) || null,
    fonte: fonte(p.source),
    descrizione: citazione(pagina.testo),
    tratti: W.elenco(p.weapon_traits),
    immagine: W.pulisci(p.image) || null,
    scheda: numeri({
      danno: W.danni(p.damage).map((d) => d.testo).join(" + ") || W.pulisci(p.damage),
      perforazione: W.numero(p.penetration),
      caricatore: W.numero(p.capacity),
      riserva: W.numero(p.spare_mags ?? p.spare_rounds ?? p.spare_shells),
      ricarica: W.numero(p.reload_time),
      cadenza: W.numero(p.fire_rate),
      rinculo: W.numero(p.recoil),
      dps: W.numero(p.dps),
      modalita: W.elenco(p.firing_modes),
    }),
    combattimento: vecchi ? { ...vecchi.stat, colpi: vecchi.colpi } : w ? { ...numeri(statArma(w.arma)), colpi: c } : null,
  }));
}

function conSorgenti(sorgenti, oggetto) {
  if (oggetto && sorgenti.length) SORGENTI.set(oggetto, sorgenti);
  return oggetto;
}

// Arma nei dati estratti: per nome intero, poi con tolleranza sulla grafia
function cercaArma(titolo, dati) {
  const tA = tabelle(dati.armi);
  const tS = tabelle(dati.stratagemmi);
  const chiave = chiaveDati(titolo);
  for (const [t, altre] of [[tA, tS], [tS, tA]]) {
    if (t.weapons[chiave]) return { arma: t.weapons[chiave], t, altre };
  }
  const n = normalizza(titolo);
  for (const [t, altre] of [[tA, tS], [tS, tA]]) {
    for (const [k, v] of Object.entries(t.weapons)) {
      if (normalizza(k) === n) return { arma: v, t, altre };
    }
  }
  return null;
}

function granata(pagina, dati) {
  const ib = W.trova(pagina.testo, ["Infobox Throwable"]);
  if (!ib) return null;
  const p = ib.nominati;
  const w = cercaArma(pagina.titolo, dati);
  return conSorgenti(w ? [{ voce: w.arma, t: w.t, altre: w.altre }] : [], base(pagina, "granata", {
    tipo: W.pulisci(p.weapon_type) || null,
    fonte: fonte(p.source),
    descrizione: citazione(pagina.testo),
    tratti: W.elenco(p.throwable_traits),
    immagine: W.pulisci(p.image) || null,
    scheda: numeri({
      danno: W.danni(p.damage).map((d) => d.testo).join(" + ") || W.pulisci(p.damage),
      perforazione: W.numero(p.penetration),
      raggio: W.numero(p.radius),
      miccia: W.numero(p.fuse),
      quantita: W.numero(p.capacity),
    }),
    combattimento: w
      ? { ...numeri({ iniziali: w.arma.start ?? null, massimo: w.arma.max ?? null }), colpi: colpi(w.arma.attacks, w.t, w.altre, dati.stati) }
      : null,
  }));
}

function stratagemma(pagina, dati) {
  const ib = W.trova(pagina.testo, ["Infobox Stratagem", "Infobox Support Weapon"]);
  if (!ib) return null;
  const p = ib.nominati;
  const tipoWiki = W.pulisci(p.stratagem_type).toLowerCase();
  const tipo = TIPI_STRATAGEMMA[tipoWiki];
  const permesso = W.pulisci(p.permit_type).toLowerCase();
  if (!tipo || !/^(offensive|offense|supply|defensive)$/.test(permesso)) return null;
  if (ESCLUSI.has(pagina.titolo) || pagina.categorie.includes("Mission Stratagems")) return null;

  const tab = statStratagemma(pagina.testo);
  const tS = tabelle(dati.stratagemmi);
  const tA = tabelle(dati.armi);
  const chiave = chiaveDati(senzaSigla(pagina.titolo));
  const s = tS.stratagems?.[chiave] || dati.stratagemmi?.stratagems?.[chiave] || Object.entries(dati.stratagemmi?.stratagems || {}).find(([k]) => normalizza(k) === normalizza(senzaSigla(pagina.titolo)))?.[1];
  const usiDati = s?.uses == null || s.uses >= 4294967295 ? null : s.uses;
  const usiWiki = W.numero(tab.uses ?? p.uses);

  // Armi di supporto: le statistiche dell'arma stanno con le altre armi. Zaini con droni
  // e armi da mischia: l'arma è indicata dallo stratagemma (loadout_wep).
  let w = tipo === "arma" ? cercaArma(pagina.titolo, dati) : null;
  let colpiStratagemma = w ? colpi(w.arma.attacks, w.t, w.altre, dati.stati) : s ? colpi(s.attacks, tS, tA, dati.stati) : [];
  if (!colpiStratagemma.length && s?.loadout_wep) {
    const w2 = cercaArma(s.loadout_wep, dati);
    const c2 = w2 ? colpi(w2.arma.attacks, w2.t, w2.altre, dati.stati) : [];
    if (c2.length) {
      w = w2;
      colpiStratagemma = c2;
    }
  }
  const vecchi = colpiStratagemma.length ? null : colpiVecchi(pagina.titolo, dati);
  if (vecchi) colpiStratagemma = vecchi.colpi;
  // Come la wiki: le armi di supporto con i dati dell'arma, gli altri con quelli dello
  // stratagemma (che comprendono le armi di torrette, mezzi ed esoscheletri)
  const sorgenti = vecchi ? [vecchi.sorgente] : [];
  if (!vecchi) {
    if (s && (tipo !== "arma" || !w)) sorgenti.push({ voce: s, tipo: "stratagems", t: tS, altre: tA });
    if (w && (tipo === "arma" || !s?.attacks?.length)) sorgenti.push({ voce: w.arma, t: w.t, altre: w.altre });
  }

  return conSorgenti(sorgenti, base(pagina, "stratagemma", {
    tipo,
    tipoWiki: W.pulisci(p.stratagem_type),
    permesso: W.pulisci(p.permit_type),
    fonte: fonte(p.source),
    descrizione: citazione(pagina.testo),
    tratti: W.elenco(p.traits),
    codice: W.codice(p.stratagem_code),
    immagine: W.pulisci(p.weapon_image || p.image || p.stratagem_image) || null,
    scheda: numeri({
      danno: W.danni(p.damage).map((d) => d.testo).join(" + ") || null,
      perforazione: W.numero(p.penetration),
      caricatore: W.numero(p.capacity),
      riserva: W.numero(p.spare_mags ?? p.spare_rounds ?? p.spare_shells),
      ricarica: W.numero(p.reload_time),
      cadenza: W.numero(p.fire_rate),
      chiamata: W.numero(tab.call_time ?? p.call_time),
      // Ricarica di base (senza i moduli della nave): quella della pagina, aggiornata dagli
      // editori dopo le patch; i dati del gioco solo se la pagina non la dice (in qualche
      // caso sono sbagliati: MG-43 600 invece di 480, Rocket Sentry 45 invece di 150)
      attesa: W.numero(tab.cooldown ?? p.cooldown ?? p.base_cooldown) ?? s?.cooldown ?? null,
      usi: usiDati ?? (/(unlimited|inf)/i.test(String(tab.uses ?? p.uses ?? "")) ? null : usiWiki),
      riarmo: W.numero(tab.rearm_time),
      munizioniTorretta: W.numero(tab.sentry_ammo),
      saluteTorretta: W.numero(tab.sentry_health),
      rotazioneTorretta: W.numero(tab.sentry_turn_rate),
      livello: W.numero(p.unlock_level),
    }),
    combattimento: {
      ...numeri({
        bombe: s?.num_bombs ?? null,
        salve: s?.num_salvos ?? null,
        area: s?.area_size ?? null,
        durata: s?.lifetime ?? s?.duration ?? null,
        salute: s?.health ?? null,
        armatura: s?.armor ?? null,
        scudo: s?.shield ?? null,
        ...(w ? statArma(w.arma) : {}),
        ...(vecchi ? vecchi.stat : {}),
      }),
      colpi: colpiStratagemma,
    },
    moduli: moduliNave(tipoWiki, tab, W.numero(tab.cooldown ?? p.cooldown ?? p.base_cooldown) ?? s?.cooldown ?? null),
  }));
}

// Valori con i moduli della nave, come nella tabella "Stratagem Stats Table" della wiki:
// quelli scritti sulla pagina, altrimenti le stesse regole del modello (pagina Ship Modules:
// Morale Augmentation −5% all'attesa di tutti gli stratagemmi, più il modulo del tipo)
const MODULI_ATTESA = {
  eagle: { nome: "Liquid-Ventilated Cockpit", effetto: "−50% all'attesa delle Aquile", fattore: 0.45 },
  orbital: { nome: "Zero-G Breech Loading", effetto: "−10% all'attesa degli orbitali", fattore: 0.855 },
  backpack: { nome: "Hand Carts", effetto: "−10% all'attesa degli zaini", fattore: 0.855 },
  "support weapon": { nome: "Streamlined Request Process", effetto: "−10% all'attesa delle armi di supporto", fattore: 0.855 },
  emplacement: { nome: "Synthetic Supplementation", effetto: "−10% all'attesa di postazioni, torrette e rifornimenti", fattore: 0.855 },
  sentry: { nome: "Synthetic Supplementation", effetto: "−10% all'attesa di postazioni, torrette e rifornimenti", fattore: 0.855 },
};
const MODULI_CHIAMATA = {
  orbital: { nome: "Targeting Software Upgrade", effetto: "−1 s alla chiamata degli orbitali" },
  "support weapon": { nome: "Streamlined Launch Process", effetto: "le armi di supporto partono subito" },
  sentry: { nome: "Dynamic Tracking", effetto: "le torrette partono subito" },
  emplacement: { nome: "Rapid Launch System", effetto: "le postazioni partono subito" },
};
const MORALE = { nome: "Morale Augmentation", effetto: "−5% all'attesa di tutti gli stratagemmi" };

function moduliNave(tipoWiki, tab, attesa) {
  const numero = (v) => W.numero(v);
  const valori = {};
  const moduli = [];
  const aggiungi = (m) => {
    if (m && !moduli.some((x) => x.nome === m.nome)) moduli.push({ nome: m.nome, effetto: m.effetto });
  };
  const chiamata = numero(tab.call_time_upgraded);
  if (chiamata != null && chiamata !== numero(tab.call_time)) {
    valori.chiamata = chiamata;
    aggiungi(MODULI_CHIAMATA[tipoWiki]);
  }
  if (attesa != null && attesa > 0) {
    const tipo = MODULI_ATTESA[tipoWiki];
    const scritto = numero(tab.cooldown_upgraded_all);
    valori.attesa = Math.round((scritto ?? attesa * (tipo?.fattore ?? 0.95)) * 100) / 100;
    aggiungi(MORALE);
    aggiungi(tipo);
  }
  const usi = numero(tab.uses_upgraded);
  if (usi != null && usi !== numero(tab.uses)) {
    valori.usi = usi;
    aggiungi({ nome: "Expanded Weapons Bay", effetto: "+1 uso delle Aquile per riarmo" });
  }
  const riarmo = numero(tab.rearm_time);
  if (riarmo != null) {
    valori.riarmo = numero(tab.rearm_time_upgraded_pchp) ?? Math.round(riarmo * 0.8 * 100) / 100;
    valori.riarmoPresto = numero(tab.rearm_time_upgraded_act) ?? Math.round(riarmo * 0.8 * 0.9 * 100) / 100;
    aggiungi({ nome: "Pit Crew Hazard Pay", effetto: "−20% al riarmo delle Aquile" });
    aggiungi({ nome: "Advanced Crew Training", effetto: "un altro −10% se chiami il riarmo con usi rimasti" });
  }
  const munizioni = numero(tab.sentry_ammo);
  if (munizioni != null) {
    valori.munizioniTorretta = numero(tab.sentry_ammo_upgraded) ?? Math.round(munizioni * 1.5);
    aggiungi({ nome: "Shock Absorption Gel", effetto: "+50% di munizioni alle torrette" });
  }
  const salute = numero(tab.sentry_health_upgraded);
  if (salute != null) {
    valori.saluteTorretta = salute;
    aggiungi({ nome: "Advanced Construction", effetto: "+50% di salute alle torrette" });
  }
  const rotazione = numero(tab.sentry_turn_rate_upgraded);
  if (rotazione != null) {
    valori.rotazioneTorretta = rotazione;
    aggiungi({ nome: "High-Quality Lubricant", effetto: "le torrette si girano più in fretta" });
  }
  return Object.keys(valori).length ? { ...valori, moduli } : null;
}

function passiva(pagina) {
  const ib = W.trova(pagina.testo, ["Infobox Armor Passive"]);
  if (!ib) return null;
  return base(pagina, "armatura", {
    descrizione: W.pulisci(ib.nominati.description),
    ordine: W.numero(ib.nominati.order),
  });
}

function potenziamento(pagina) {
  const ib = W.trova(pagina.testo, ["Infobox Booster"]);
  if (!ib) return null;
  return base(pagina, "potenziamento", {
    descrizione: W.pulisci(ib.nominati.description),
    fonte: fonte(ib.nominati.source),
  });
}

// --- Nemici ---

// Le parti che usa il modello (l'anatomia completa sta nei testi della wiki)
function parte(r) {
  const { nome, salute, av, durevole, versoMain, fatale, resistenzaEsplosioni } = parteAnatomia(r);
  return { nome, salute, av, durevole, versoMain, fatale, resistenzaEsplosioni };
}

// Classe del nemico dalla corazza e dalla salute del corpo: pesanti i corazzati grandi
// (Charger, Hulk, carri) e i giganti; medi quelli con corazza media o tanta salute;
// leggeri gli altri (Scavenger, Trooper, Voteless...)
function classeNemico(av, salute) {
  if ((av >= 4 && salute >= 1000) || salute >= 3000) return "pesante";
  if (av >= 2 || salute >= 450) return "medio";
  return "leggero";
}

// La fazione scritta nella scheda è quella della categoria (anche al singolare, "Automaton")
// oppure una sua sotto-fazione: Cyborg Legion, Jet Brigade, Predator Strain, Vote Snatchers...
// Le schede con un'altra delle tre fazioni no: quei nemici stanno nella loro categoria.
function nemico(pagina, fazione) {
  const ib = W.trova(pagina.testo, ["Infobox Enemy"]);
  if (!ib) return null;
  const p = ib.nominati;
  const scritta = W.pulisci(p.faction);
  const base = (f) => f.toLowerCase().replace(/s$/, "");
  const principale = Boolean(scritta) && base(scritta) === base(FAZIONI[fazione]);
  const altra = !principale && Object.values(FAZIONI).some((f) => base(f) === base(scritta || ""));
  if (!scritta || altra) return null;
  const tabella = W.templates(pagina.testo).find((t) => t.nome === "anatomy table");
  const parti = tabella ? W.interni(tabella.corpo, "Anatomy Row").map(parte) : [];
  const main = parti.find((x) => /main/i.test(x.nome) && typeof x.salute === "number");
  // Qualche scheda non ha la taglia (gli Appropriators): serve solo a ordinare
  const taglia = W.numero(p.size);
  const salute = main?.salute ?? W.numero(p.health);
  if (!salute || !main) return null;
  const id = slug(pagina.titolo);
  const immagine = W.pulisci(p.image) || null;
  return {
    id,
    nome: pagina.titolo,
    fazione,
    ...(principale ? {} : { sottofazione: scritta }),
    ...(NAVI_E_BOSS.has(pagina.titolo) ? { speciale: NAVI_E_BOSS.get(pagina.titolo) } : {}),
    taglia,
    classe: classeNemico(main.av, salute),
    salute,
    fuoco: W.numero(p.fire_mult) ?? 1,
    ...(W.numero(p.arc_mult) != null ? { arco: W.numero(p.arc_mult) } : {}),
    difficolta: W.numero(p.min_difficulty),
    ...(W.numero(p.max_difficulty) != null ? { difficoltaMassima: W.numero(p.max_difficulty) } : {}),
    rango: W.numero(p.rank),
    stordimento: W.numero(p.stagger_req),
    descrizione: W.pulisci(p.description) || null,
    icona: immagine ? { tipo: "wiki", file: immagine, nome: `nemico-${id}.png` } : null,
    parti: parti.filter((x) => x.fatale || x === main).map((x) => (x === main ? { ...x, main: true } : x)),
  };
}

// --- Strutture (nidi, fabbriche, torri): forza di demolizione che serve ---

// "Super Earth Federation": strutture alleate (mura delle colonie, cancelli, megacittà)
const FAZIONI_STRUTTURE = { neutral: "tutte", "super earth federation": "superterra", terminids: "terminidi", automatons: "automi", illuminate: "illuminati" };

// Legge la tabella "Demolition Force vs. Structures" della pagina Demolition
function strutture(pagina) {
  if (!pagina) return [];
  const testo = pagina.testo;
  const inizio = testo.search(/Demolition Force vs\.? Structures/i);
  if (inizio < 0) return [];
  const tabella = testo.slice(testo.indexOf("{|", inizio), testo.indexOf("|}", inizio));
  const out = [];
  let fazione = null;
  for (const riga of tabella.split(/\n\|-/).slice(1)) {
    let corpo = riga;
    const intestazione = corpo.match(/^\s*!\s*(?:rowspan="?\d+"?\s*\|)?\s*([^\n]*)/);
    if (intestazione) {
      const nome = W.pulisci(intestazione[1].replace(/\{\{([^|}]+)\|text\}\}/g, "$1")).toLowerCase();
      if (!/^structure\b/.test(nome)) fazione = FAZIONI_STRUTTURE[nome] ?? null;
      corpo = corpo.slice(intestazione[0].length);
    }
    const celle = corpo
      .split(/\n\||\|\|/)
      .map((c) => W.pulisci(c))
      .filter((c) => c !== "");
    if (celle.length < 3 || !fazione) continue;
    const forza = W.numero(celle[celle.length - 1]);
    if (forza == null) continue;
    out.push({ fazione, nome: celle[0], balistica: /^yes/i.test(celle[celle.length - 2]), forza });
  }
  return out;
}

// --- Icone ---

function iconaStratagemma(titolo, icone) {
  const nomi = icone.map((i) => ({ ...i, nome: i.percorso.split("/").pop().replace(/\.svg$/i, "") }));
  const cercati = [ALIAS_ICONE[titolo], titolo, senzaSigla(titolo)].filter(Boolean).map(normalizza);
  for (const c of cercati) {
    const trovata = nomi.find((i) => normalizza(i.nome) === c);
    if (trovata) return trovata.percorso;
  }
  return null;
}

// Emblema (disegnato dall'app) per passive e potenziamenti, dalle parole del nome e della
// descrizione. Il primo che corrisponde vince.
const EMBLEMI = [
  ["fuoco", /inflammable|fire|flame|firebomb/],
  ["gas", /gas|filtration|toxic/],
  ["fulmine", /electric|conduit|\barc\b|shock/],
  ["esplosione", /explosi|fortified|concussive/],
  ["cuore", /adreno|defibrillat|vitality|health/],
  ["croce", /med-kit|stim|heal|infusion/],
  ["piede", /feet first|fall damage/],
  ["occhio", /scout|signature|shroud|stealth|concealed|detect/],
  ["granata", /grenade|engineering|explosives|servo/],
  ["caricatore", /reload|siege|epaulettes|resupply|ammo/],
  ["mirino", /recoil|gunslinger|physique|unflinching|rock solid|weapon handling/],
  ["corsa", /stamina|adrenaline|sprint|muscle|speed|oxygen/],
  ["sole", /acclimated|desert|temperature/],
  ["bandiera", /democracy/],
  ["rinforzi", /reinforcement/],
  ["capsula", /hellpod|pods/],
  ["campioni", /sample/],
  ["radar", /uav|radar|localization|confusion/],
  ["navetta", /extraction/],
  ["goccia", /extinguish/],
  ["razzo", /\beat\b|anti-tank/],
  ["scudo", /armor|padding|reinforced|ballistic|blunt|kinetic|grit|resist/],
];

function emblema(o) {
  const nome = o.nome.toLowerCase();
  const descrizione = String(o.descrizione || "").toLowerCase();
  return (EMBLEMI.find(([, re]) => re.test(nome)) || EMBLEMI.find(([, re]) => re.test(descrizione)) || ["stella"])[0];
}

// --- Catalogo ---

function costruisci(grezzo) {
  const { categorie, moduli } = grezzo;
  // {{PAGENAME}} nei testi vale il titolo della pagina (lo usano molte schede per l'immagine)
  const pagine = Object.fromEntries(
    Object.entries(grezzo.pagine || {}).map(([t, p]) => [t, { ...p, testo: String(p.testo || "").replace(/\{\{\s*PAGENAME\s*\}\}/g, p.titolo) }]),
  );
  const dati = moduli;
  const oggetti = [];
  const avvisi = [];
  const visti = new Set();
  const aggiungi = (o, origine) => {
    if (!o) return;
    if (visti.has(o.id)) return;
    visti.add(o.id);
    if (!o.combattimento && ["primaria", "secondaria", "granata"].includes(o.slot)) avvisi.push(`${o.nome}: niente dati estratti dal gioco`);
    oggetti.push(o);
  };
  const leggi = (chiave, fn) => {
    for (const titolo of categorie[chiave] || []) {
      const pagina = pagine[titolo];
      if (pagina) aggiungi(fn(pagina), chiave);
    }
  };
  leggi("primarie", (p) => arma(p, "primaria", dati));
  leggi("secondarie", (p) => arma(p, "secondaria", dati));
  leggi("granate", (p) => granata(p, dati));
  leggi("stratagemmi", (p) => stratagemma(p, dati));
  leggi("passive", passiva);
  leggi("potenziamenti", potenziamento);

  for (const o of oggetti) {
    if (o.slot === "armatura" || o.slot === "potenziamento") o.emblema = emblema(o);
    if (o.combattimento) sistemaArmi(o.combattimento);
    if (o.slot === "stratagemma") {
      const percorso = iconaStratagemma(o.nome, grezzo.iconeStratagemmi || []);
      if (percorso) o.icona = { tipo: "stratagemma", percorso };
      else avvisi.push(`${o.nome}: nessuna icona nella raccolta degli stratagemmi`);
    } else if (o.immagine) o.icona = { tipo: "wiki", file: o.immagine };
  }

  const nemici = [];
  for (const fazione of Object.keys(FAZIONI)) {
    for (const titolo of categorie[fazione] || []) {
      const pagina = pagine[titolo];
      const n = pagina && nemico(pagina, fazione);
      if (n && !nemici.some((x) => x.id === n.id)) nemici.push(n);
    }
  }

  // Armature dalle tabelle Cargo, con la passiva collegata all'oggetto del catalogo
  // ("Concussive Padding, Grenadier" → la passiva "Concussive Padding")
  const { armature, elmi, mantelli } = costruisciArmature(grezzo.tabelle, pagine, { slug, citazione });
  const passive = oggetti.filter((o) => o.slot === "armatura");
  const passivaDi = (nome) => {
    if (!nome) return null;
    const cercati = [nome, nome.split(",")[0]].map(normalizza);
    return passive.find((o) => cercati.includes(normalizza(o.nome))) || null;
  };
  for (const a of armature) {
    const pa = passivaDi(a.passiva);
    if (pa) a.passivaId = pa.id;
  }
  // Immagini: prima il disegno della tabella Cargo (quasi tutti di YourOnlyNavigator, che ci
  // ha dato il permesso a patto di citarlo), poi quelle ufficiali del gioco caricate sulla
  // wiki (il set indossato nell'armeria, le icone dell'armeria). Le condizioni degli autori
  // le controlla icone.js.
  const candidati = (...file) => [...new Map(file.filter((c) => c?.file).map((c) => [c.file, c])).values()];
  const iconaWiki = (...file) => ({ tipo: "wiki", candidati: candidati(...file), larghezza: 160 });
  const nomiArmature = new Set(armature.map((a) => a.nome));
  for (const a of armature) {
    a.icona = iconaWiki({ file: a.immagine }, { file: `${a.nome} Armor Set Image.png`, vista: "set" }, { file: `${a.nome} Body Icon.png` }, { file: `${a.nome} Body Armory.png` });
  }
  for (const e of elmi) {
    // Se non c'è un'immagine dell'elmo da solo, il set con l'armatura dello stesso nome
    const set = nomiArmature.has(e.nome) ? { file: `${e.nome} Armor Set Image.png`, vista: "set" } : null;
    e.icona = iconaWiki({ file: e.immagine }, { file: `${e.nome} Helmet Icon.png` }, { file: `${e.nome} Helmet Armory.png` }, set);
  }
  for (const m of mantelli) m.icona = iconaWiki({ file: m.immagine }, { file: `${m.nome} Cape Icon.png` }, { file: `${m.nome} Cape Armory.png` });
  // Effetto preciso di ogni passiva (con i numeri) dalla tabella Cargo
  for (const r of grezzo.tabelle?.passive || []) {
    const o = passivaDi(W.pulisci(testoCargo(r.title)));
    const effetto = W.pulisci(testoCargo(r.description));
    if (o && effetto) o.effetto = effetto;
  }

  const versioni = [dati.armi?.wep_version, dati.stratagemmi?.strat_version].filter(Boolean);
  oggetti.sort((a, b) => a.slot.localeCompare(b.slot) || a.nome.localeCompare(b.nome));
  nemici.sort((a, b) => a.fazione.localeCompare(b.fazione) || (a.taglia ?? 0) - (b.taglia ?? 0) || a.nome.localeCompare(b.nome));
  const collega = indice({ oggetti, nemici, armature, senzaSigla });
  const wiki = enciclopedia({ pagine, oggetti, nemici, armature, senzaSigla, collega });
  // Tutti i numeri degli attacchi, come nella sezione "Detailed Weapon Statistics" della wiki
  for (const o of oggetti) {
    const sorgenti = SORGENTI.get(o);
    if (!sorgenti) continue;
    const elenco = sorgenti.flatMap((x) => (x.vecchio ? schedeVecchie({ ...x, stati: dati.stati }) : schede({ ...x, stati: dati.stati })));
    if (elenco.length) {
      const versione = o.slot === "stratagemma" ? dati.stratagemmi?.strat_version || dati.armi?.wep_version : dati.armi?.wep_version;
      wiki.oggetti[o.id] = { ...(wiki.oggetti[o.id] || {}), dati: { versione: versione ? String(versione).replace(/^0+(?=\d)/, "") : null, schede: elenco } };
    }
  }
  return {
    versione: VERSIONE,
    generato: grezzo.scaricato || new Date().toISOString(),
    versioneGioco: versioni[0] ? String(versioni[0]).replace(/^0+(?=\d)/, "") : null,
    fonti: {
      dati: "Helldivers Wiki (helldivers.wiki.gg), licenza CC BY-NC-SA 4.0",
      iconeStratagemmi: "github.com/nvigneux/Helldivers-2-Stratagems-icons-svg",
    },
    oggetti,
    nemici,
    strutture: strutture(pagine.Demolition),
    // Attacchi con almeno 20 di forza di demolizione secondo la wiki (si aggiungono ai dati del gioco)
    demolizioni: fontiDemolizione(pagine.Demolition?.testo, collega, oggetti),
    armature,
    elmi,
    mantelli,
    meccaniche: {
      armatura: fattoriArmatura(grezzo.modelli?.armatura),
      pagine: Object.entries(PAGINE_MECCANICHE)
        .filter(([id]) => wiki.pagine[id])
        .map(([id, titolo]) => ({ id, titolo })),
    },
    wiki,
    avvisi: [...avvisi, ...(grezzo.avvisi || [])],
  };
}

// Controlli prima di sostituire il catalogo in uso: se la wiki risponde a metà o cambia
// formato, meglio tenere quello di prima
function controlla(nuovo, vecchio) {
  const conta = (c) => {
    const n = {};
    for (const o of c?.oggetti || []) n[o.slot] = (n[o.slot] || 0) + 1;
    return n;
  };
  const minimi = { primaria: 30, secondaria: 12, granata: 12, stratagemma: 50, armatura: 15, potenziamento: 10 };
  const n = conta(nuovo);
  const v = conta(vecchio);
  const problemi = [];
  for (const [slot, minimo] of Object.entries(minimi)) {
    const quanti = n[slot] || 0;
    if (quanti < minimo) problemi.push(`solo ${quanti} oggetti in "${slot}"`);
    else if (v[slot] && quanti < v[slot] * 0.85) problemi.push(`"${slot}" passa da ${v[slot]} a ${quanti} oggetti`);
  }
  const conColpi = (nuovo.oggetti || []).filter((o) => o.combattimento?.colpi?.length).length;
  if (conColpi < 100) problemi.push(`statistiche di combattimento solo per ${conColpi} oggetti`);
  // Contano i nemici di sempre, quelli dei punteggi: sotto-fazioni, navi e boss non bastano
  for (const f of Object.keys(FAZIONI)) {
    if ((nuovo.nemici || []).filter((x) => x.fazione === f && !x.sottofazione && !x.speciale).length < 5) problemi.push(`pochi nemici per ${f}`);
  }
  if ((nuovo.strutture || []).length < 10) problemi.push("tabella delle strutture non letta");
  // Armature: se mancano del tutto l'aggiornatore tiene quelle di prima; se sono poche,
  // la tabella della wiki è stata letta a metà
  const armature = (nuovo.armature || []).length;
  const armaturePrima = (vecchio?.armature || []).length;
  if (armature && armaturePrima && armature < armaturePrima * 0.85) problemi.push(`le armature passano da ${armaturePrima} a ${armature}`);
  return problemi;
}

module.exports = { costruisci, controlla, slug, normalizza, senzaSigla, chiaveDati, FAZIONI, VERSIONE };
