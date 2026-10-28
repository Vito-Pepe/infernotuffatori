// Armature degli Helldiver dalle tabelle Cargo della wiki: corpo (leggere, medie, pesanti),
// elmi e mantelli, con protezione, velocità, stamina, passiva, fonte e costo. E i numeri del
// danno che l'armatura para, letti dal template "Armor Ratings" della wiki.
const W = require("./wikitesto");

const PESI = { light: "leggera", medium: "media", heavy: "pesante" };

// Le tabelle Cargo arrivano con le entità HTML ("Federation&#39;s Blade")
const ENTITA = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
function testo(v) {
  return String(v ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITA[n.toLowerCase()] ?? m);
}

function riga(r) {
  return Object.fromEntries(Object.entries(r || {}).map(([k, v]) => [k, testo(v)]));
}

// Costo dalla cella della tabella Cargo (HTML con l'icona della valuta e il numero)
function costo(html) {
  const t = String(html || "");
  if (!t.trim()) return null;
  if (/exclusive|❌/i.test(t)) return { esclusiva: true };
  const pulito = t.replace(/\[\[File:[^\]]*alt=([^\]|]*)\]\]/gi, " $1 ").replace(/<[^>]+>/g, " ");
  const quantita = W.numero(pulito);
  let valuta = null;
  if (/medal/i.test(t)) valuta = "Medaglie";
  else if (/super credit|\bSC\b/i.test(t)) valuta = "Super Crediti";
  else if (/requisition/i.test(t)) valuta = "Requisizioni";
  else if (/USD|💲/.test(t)) valuta = "USD";
  if (quantita == null && !valuta) return null;
  return { valuta, quantita };
}

// Fonte (warbond, Superstore...) come nel resto del catalogo
function fonte(v) {
  const t = W.pulisci(String(v ?? "").replace(/<small>[\s\S]*?<\/small>/gi, "")).replace(/\s*\bP\d+\b\s*$/, "").trim();
  return t && !/^(n\/a|none|-)$/i.test(t) ? t : null;
}

const numero = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : null;
};

// Righe Cargo → { armature, elmi, mantelli }. `slug` dà l'identificativo, `citazione` la
// descrizione dell'armeria dalla pagina dell'armatura (se c'è)
function costruisciArmature(tabelle, pagine, { slug, citazione }) {
  const armature = [];
  const elmi = [];
  const visti = new Set();
  for (const grezza of tabelle?.armature || []) {
    const r = riga(grezza);
    const tipo = String(r.type || "").toLowerCase();
    const nome = W.pulisci(r.title);
    if (!nome) continue;
    if (tipo === "helmet") {
      const id = slug(nome);
      if (!elmi.some((x) => x.id === id)) elmi.push({ id, nome, fonte: fonte(r.source), costo: costo(r.cost), ordine: numero(r.displayorder), immagine: W.pulisci(r.image) || null });
      continue;
    }
    if (!PESI[tipo]) continue;
    const id = slug(nome);
    if (visti.has(id)) continue;
    visti.add(id);
    const protezione = numero(r.armor);
    const velocita = numero(r.speed);
    const passiva = W.pulisci(r.passive) || null;
    // La velocità dipende solo dalla protezione di base (600 − protezione): la differenza è
    // quella che aggiunge la passiva (Extra Padding, Blunt-Force Mitigation...)
    const base = velocita != null ? 600 - velocita : null;
    const pagina = pagine?.[nome];
    const descrizioneCargo = W.pulisci(r.description);
    armature.push({
      id,
      nome,
      pagina: nome,
      peso: PESI[tipo],
      protezione,
      base: base != null && base >= 50 && base <= 200 && protezione != null && protezione >= base ? base : null,
      velocita,
      stamina: numero(r.stam_regen ?? r["stam regen"]),
      passiva,
      fonte: fonte(r.source),
      costo: costo(r.cost),
      descrizione: (descrizioneCargo && !/^none$/i.test(descrizioneCargo) ? descrizioneCargo : null) || (pagina ? citazione(pagina.testo) : "") || null,
      ordine: numero(r.displayorder),
      immagine: W.pulisci(r.image) || null,
    });
  }
  const mantelli = [];
  for (const grezza of tabelle?.mantelli || []) {
    const r = riga(grezza);
    const nome = W.pulisci(r.title);
    const id = slug(nome);
    if (!nome || mantelli.some((x) => x.id === id)) continue;
    mantelli.push({ id, nome, fonte: fonte(r.source), costo: costo(r.cost), tipoFonte: W.pulisci(r.source_type ?? r["source type"]) || null, ordine: numero(r.displayorder), immagine: W.pulisci(r.image) || null });
  }
  const perNome = (a, b) => a.nome.localeCompare(b.nome);
  armature.sort((a, b) => ["leggera", "media", "pesante"].indexOf(a.peso) - ["leggera", "media", "pesante"].indexOf(b.peso) || (a.protezione ?? 0) - (b.protezione ?? 0) || perNome(a, b));
  elmi.sort(perNome);
  mantelli.sort(perNome);
  return { armature, elmi, mantelli };
}

// Numeri predefiniti del template, usati se la wiki cambia formato
const PREDEFINITI = {
  salute: 125,
  parti: { testa: 1.5, petto: 1, braccia: 0.85, gambe: 0.85 },
  esplosioni: 0.5,
  fortified: 0.5,
  vitality: 0.9,
};

// Danno subito con una data protezione (pagina "Armor" della wiki): fino a 150
// danno × (1,5 − protezione/200), sopra danno × (1,05 − protezione/500)
function fattoreFormula(protezione) {
  return protezione <= 150 ? 1.5 - protezione / 200 : 1.05 - protezione / 500;
}

// {{#vardefine:armor_150|{{{armor_150|0.75}}} }} → { armor_150: "0.75" }
function fattoriArmatura(testo) {
  const t = String(testo || "");
  const valori = {};
  // il valore predefinito può essere un numero o un rimando {{#var: armor_100}}
  for (const m of t.matchAll(/#vardefine:\s*(\w+)\s*\|\s*\{\{\{\s*\1\s*\|((?:\{\{[^{}]*\}\}|[^{}])*?)\s*\}\}\}/g)) valori[m[1]] = m[2].trim();
  const risolvi = (v, giri = 0) => {
    const rif = String(v ?? "").match(/\{\{#var:\s*(\w+)\s*\}?\}?/) || String(v ?? "").match(/#var:\s*(\w+)/);
    if (rif && giri < 5) return risolvi(valori[rif[1]], giri + 1);
    const n = Number(String(v ?? "").trim());
    return Number.isFinite(n) ? n : null;
  };
  const leggi = (k, predefinito) => risolvi(valori[k]) ?? predefinito;
  const fattori = {};
  const testa = {};
  for (const k of Object.keys(valori)) {
    const corpo = k.match(/^armor_(\d+)$/);
    const capo = k.match(/^armor_head_(\d+)$/);
    if (corpo) fattori[corpo[1]] = Math.round(leggi(k, fattoreFormula(Number(corpo[1]))) * 1000) / 1000;
    if (capo) testa[capo[1]] = Math.round(leggi(k, fattoreFormula(Math.max(100, Number(capo[1])))) * 1000) / 1000;
  }
  const letti = Object.keys(fattori).length > 3;
  return {
    letti,
    salute: leggi("health", PREDEFINITI.salute),
    parti: {
      testa: leggi("head", PREDEFINITI.parti.testa),
      petto: leggi("chest", PREDEFINITI.parti.petto),
      braccia: Math.round(leggi("arm", PREDEFINITI.parti.braccia) * 1000) / 1000,
      gambe: Math.round(leggi("leg", PREDEFINITI.parti.gambe) * 1000) / 1000,
    },
    esplosioni: leggi("explosion", PREDEFINITI.esplosioni),
    fortified: leggi("fortified", PREDEFINITI.fortified),
    vitality: leggi("vitality", PREDEFINITI.vitality),
    fattori,
    testa,
  };
}

module.exports = { costruisciArmature, fattoriArmatura, fattoreFormula, costo, testo, PESI };
