// Tutti i numeri degli attacchi di un'arma o di uno stratagemma, come nella sezione
// "Detailed Weapon Statistics" della wiki (moduli Getdata-Attacks e Attack-Setup: stessi
// campi e stesse regole, etichette in italiano). Una scheda con i dati generali e una per
// ogni attacco (proiettile, esplosione, raggio, arco, getto, colpo, effetto), con danno,
// perforazione per angolo, effetti e forze. Vanno nei testi della wiki: l'app li carica
// solo quando si apre l'oggetto.
//
// Righe di una scheda:
//   [etichetta, testo]            valore già scritto in italiano
//   [etichetta, numero, "ap"]     grado di perforazione o di corazza (l'app lo colora)
//   [etichetta, nome, "rif"]      un altro attacco della stessa pagina (l'app lo collega)
//   { s: "titolo" }               sottotitolo dentro la scheda

const TIPI = { weapons: "arma", stratagems: "stratagemma", projectile: "proiettile", explosion: "esplosione", beam: "raggio", arc: "arco", spray: "getto", damage: "colpo", status: "effetto" };
const ELEMENTI = { electricity: "elettrico", fire: "fuoco", gas: "gas" };
const SOTTOTIPI = { beam: "raggio", ballistic: "balistico", explosion: "esplosivo", melee: "corpo a corpo" };
const RUMORI = {
  none: "nessun rumore",
  weapon_small: "piccolo (~33 m)",
  weapon_medium: "medio (~48 m)",
  weapon_large: "grande (~58 m)",
  weapon_huge: "enorme (~68 m)",
  medium_explosion_vehicle: "medio (~48 m)",
  supressor_small: "silenziato (~13 m)",
  small_explosion_frag: "medio (~48 m)",
  huge_explosion_hellbomb: "Hellbomb (~58 m)",
  toot: "clacson (~58 m)",
  engine: "motore (~58 m)",
  large_explosion_orbital: "grande (~58 m)",
};
const MODALITA = { automatic: "automatica", single: "colpo singolo", burst: "raffica", charge_with_safety_on: "carica con sicura", charge_with_safety_off: "carica senza sicura", all_barrels: "tutte le canne", count: "a conteggio" };
const ZONE = { head: "Testa", chest: "Petto", l_hand: "Braccio sinistro", r_hand: "Braccio destro", l_knee: "Gamba sinistra", r_knee: "Gamba destra" };
const TAGLIE = { small: "piccola", medium: "media", large: "grande", huge: "enorme" };

const finito = (v) => typeof v === "number" && Number.isFinite(v);

// Numero all'italiana (virgola, punti per le migliaia da 10.000), senza dipendere dalla
// lingua del sistema del container
function num(v, cifre = 2) {
  if (!finito(v)) return String(v ?? "");
  const f = 10 ** cifre;
  const r = Math.round(v * f) / f;
  // Zeri finali via solo dopo la virgola: 30 resta 30, 0,50 diventa 0,5
  const [intera, decimali] = Math.abs(r).toFixed(cifre).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "").split(".");
  const migliaia = intera.length > 4 ? intera.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : intera;
  return `${r < 0 ? "-" : ""}${migliaia}${decimali ? `,${decimali}` : ""}`;
}
const unita = (u, cifre) => (v) => `${num(v, cifre)} ${u}`;
// Come la wiki: arrotondato a due decimali, poi in percentuale
const percento = (v) => `${num(Math.round(v * 100) / 100 * 100, 0)}%`;
const massa = (v) => (v >= 1000 ? `${num(v / 1000)} kg` : `${num(v)} g`);
const xy = (v) => `↔ ${num(v?.x ?? 0)} · ↕ ${num(v?.y ?? 0)}`;
const intervallo = (v) => (Array.isArray(v) ? `da ${num(v[0])} a ${num(v[1])}` : num(v));
const senzaFine = (v) => (v > 1000 ? "∞" : num(v));
const meta = (v) => num(Math.max(1, Math.floor(v * 0.5)), 0);
const nonZero = (v) => finito(v) && v !== 0;
const piuDi = (n) => (v) => finito(v) && v > n;

// Definizione di una riga: [etichetta, chiave nei dati, formato?, filtro?]. Il formato è una
// funzione (valore, record) → testo, oppure "ap" / "rif".
function righe(definizioni, rec) {
  const out = [];
  for (const d of definizioni) {
    if (d.s) {
      out.push({ s: d.s });
      continue;
    }
    const [etichetta, chiave, formato, filtro] = d;
    const v = typeof chiave === "function" ? chiave(rec) : rec?.[chiave];
    if (v == null || v === "" || (filtro && !filtro(v, rec))) continue;
    if (formato === "ap" || formato === "rif") {
      out.push([etichetta, v, formato]);
      continue;
    }
    const testo = typeof formato === "function" ? formato(v, rec) : finito(v) ? num(v) : String(v);
    if (testo != null && testo !== "") out.push([etichetta, testo]);
  }
  // Niente sottotitoli vuoti (seguiti da un altro sottotitolo o in fondo)
  return out.filter((r, i) => !(r.s && (i === out.length - 1 || out[i + 1].s)));
}

// Tipo di danno come lo scrive la wiki: l'elemento, se c'è, altrimenti il sottotipo
function tipoDanno(rec, predefinito) {
  return ELEMENTI[rec.element_name] || SOTTOTIPI[rec.element_name_sub] || predefinito;
}
// Colpi al secondo (raggi, getti): la wiki mostra il danno moltiplicato
const valoreDanno = (v, rec) => (rec.hits_per_second ? v * rec.hits_per_second : v);
const danno = (predefinito) => (v, rec) => [num(valoreDanno(v, rec)), tipoDanno(rec, predefinito), rec.hits_per_second ? "al secondo" : null].filter(Boolean).join(" ");

// Effetti del danno: nei dati nuovi Status_Name_N / Status_Value_N
function effetti(rec) {
  const out = [];
  for (let i = 1; i <= 4; i++) {
    const nome = rec[`Status_Name_${i}`] ?? rec[i === 1 ? "status_name" : `status_name${i}`];
    if (!nome) continue;
    const forza = rec[`Status_Value_${i}`] ?? rec[`param${i}`];
    out.push([i === 1 ? "Effetto" : `Effetto ${i}`, nonZero(forza) ? `${String(nome).replace(/_/g, " ")} (forza ${num(forza)})` : String(nome).replace(/_/g, " ")]);
  }
  return out;
}

function righeDanno(rec, esplosione) {
  if (!rec) return [];
  const base = esplosione
    ? [
        { s: "Danno" },
        ["Elemento", (r) => ELEMENTI[r.element_name] || null],
        ["Nel raggio interno", "dmg", danno("esplosivo")],
        ["Durevole, nel raggio interno", "dmg2", danno("esplosivo")],
        // La wiki: nel raggio esterno il danno cala fino a zero
        ["Nel raggio esterno", "dmg", (v) => `da ${num(v - 1)} a 0`, piuDi(1)],
        ["Durevole, nel raggio esterno", "dmg2", (v) => `da ${num(v - 1)} a 0`, piuDi(1)],
        { s: "Perforazione" },
        ["Nel raggio interno", "ap1", "ap"],
        ["Nel raggio esterno", (r) => (finito(r.ap1) ? Math.max(2, r.ap1 - 1) : null), "ap"],
        ["Nell'onda d'urto", "ap1", "ap"],
      ]
    : [
        { s: "Danno" },
        ["Elemento", (r) => ELEMENTI[r.element_name] || null],
        ["Normale", "dmg", danno(null)],
        ["Contro le parti durevoli", "dmg2", danno(null)],
        { s: "Perforazione" },
        ["Diretta", "ap1", "ap"],
        ["Angolo leggero", "ap2", "ap"],
        ["Angolo ampio", "ap3", "ap"],
        ["Angolo estremo", "ap4", "ap"],
      ];
  const fine = [
    ["Forza di demolizione", "demo"],
    ["Forza di stordimento", "stun"],
    ["Forza di spinta", "push"],
  ];
  const e = effetti(rec);
  return [...righe(base, rec), ...(e.length || fine.some(([, k]) => rec[k] != null) ? [{ s: "Effetti" }] : []), ...e, ...righe(fine, rec)];
}

const PROIETTILE = [
  { s: "Proiettile" },
  ["Pallini", "pellets", (v) => `× ${num(v)}`, piuDi(1)],
  ["Calibro", "caliber", unita("mm")],
  ["Massa", "mass", massa],
  ["Velocità iniziale", "velocity", unita("m/s")],
  ["Resistenza dell'aria", "drag", percento],
  ["Gravità", "gravity", percento],
  ["Durata del volo", "lifetime", unita("s"), nonZero],
  ["Variazione della durata", "life_time_randomness", unita("s"), nonZero],
  ["Rallentamento quando perfora", "pen_slow", percento],
  ["Esplode all'impatto", "explode_on_impact_id", "rif"],
  ["Esplode dopo il volo", "explode_id", "rif"],
  ["Esplode in prossimità", "explode_proximity", unita("m"), nonZero],
  ["Ritardo dell'esplosione", "explosion_delay", unita("s"), nonZero],
  // La wiki nasconde le distanze assurde (il Breacher ha 5000 m)
  ["Distanza di innesco", "arming_distance", unita("m"), (v) => v > 0 && v < 50],
];

const ESPLOSIONE = [
  { s: "Area" },
  ["Raggio interno", "r1", unita("m")],
  ["Raggio esterno", "r2", unita("m")],
  ["Raggio dell'onda d'urto", "r3", unita("m")],
  ["Durata dell'area", "aoe_duration", unita("s"), nonZero],
  ["Schegge", "shrapnel_count", (v) => num(v, 0), nonZero],
  ["Proiettile delle schegge", "shrapnel", "rif"],
  ["Apertura delle schegge", "cone_angle", unita("°"), nonZero],
  ["Arco elettrico", "arc", "rif"],
  ["Rumore", "noise", (v) => RUMORI[v] || v],
];

const RAGGIO = [
  { s: "Raggio" },
  ["Gittata", "range", unita("m")],
  ["Calo massimo del danno", "falloff", (v) => `× ${num(v)}`, (v) => v < 1],
  ["Larghezza", "radius", unita("m"), nonZero],
];

const ARCO = [
  { s: "Arco elettrico" },
  ["Gittata", "range", unita("m")],
  ["Velocità", "velocity", unita("m/s")],
  ["Angolo di mira", "aim_angle", unita("°")],
  ["Apertura", "spread_range", unita("°")],
  ["Apertura della catena", "chain_angle", unita("°")],
  ["Salti della catena", "chain_length"],
  ["Diramazioni massime", "splits"],
  ["Forza di demolizione dell'arco", "demo_strength", null, nonZero],
];

const EFFETTO = [
  { s: "Effetto" },
  ["Forza", "strength", null, nonZero],
  ["Durata", "duration", (v) => (v >= 9999 ? "finché non si cura" : `${num(v)} s`), nonZero],
  ["Ignora la corazza", "damage_ignore_armor", (v) => (v ? "sì" : null)],
];

const SCUDO = [
  ["Scudo", "shield"],
  ["Rigenerazione dello scudo", "shieldregen", unita("al secondo")],
  ["Attesa prima di rigenerarsi", "shielddelay", unita("s")],
  ["Attesa dopo che si rompe", "shieldbreakdelay", unita("s")],
  ["Raggio dello scudo", "shieldradius", unita("m")],
];

const ARMA = [
  ["Salute", "health"],
  ["Corazza", "armor", "ap"],
  ["Cadenza", "rpm", (v) => `${typeof v === "object" ? Object.values(v).filter((x) => finito(x) && x > 0).map((x) => num(x)).join(" · ") : num(v)} colpi/min`, (v) => (typeof v === "object" ? Object.values(v).some((x) => finito(x) && x > 0) : v > 0)],
  ["Modalità di fuoco", "fire_modes", (v) => (Array.isArray(v) ? v.filter((x) => x !== "none").map((x) => MODALITA[x] || x).join(", ") : null)],
  ["Rinculo (deriva)", "drift", xy],
  ["Rinculo (salita)", "climb", xy],
  ["Dispersione", (r) => (r.spread ? { x: r.spread.x * (r.spread_mods?.x ?? 1), y: r.spread.y * (r.spread_mods?.y ?? 1) } : null), xy],
  ["Oscillazione", "sway", (v) => num(Array.isArray(v) ? v[0] : v, 1)],
  ["Ergonomia", "ergonomics", (v) => num(v, 1)],
  ["Rumore dello sparo", "noise", (v) => RUMORI[v] || v],
  ["Costo in stamina", "stamina_cost", percento],
  ["Salve", "salvos"],
  ["Caricatore", "cap"],
  ["Colpo in canna", "capplus", (v) => `+${num(v)}`, nonZero],
  ["Limite di fuoco", "limit", unita("s")],
  ["Caricatori di riserva", "mags"],
  ["Caricatori iniziali", "magstart"],
  ["Caricatori dai rifornimenti", "supply"],
  ["Caricatori da una scatola di munizioni", "supply", meta],
  ["Granate dai rifornimenti", "supplythrowable"],
  ["Colpi di riserva", "rounds"],
  ["Colpi iniziali", "roundsstart"],
  ["Colpi massimi", "max"],
  ["Colpi all'inizio", "start"],
  ["Colpi dai rifornimenti", (r) => r.roundsupply ?? r.roundssupply],
  ["Colpi da una scatola di munizioni", (r) => r.roundsupply ?? r.roundssupply, meta],
  ["Rotazione della torretta", (r) => (finito(r.turn_speed_vertical) ? r : null), (r) => `↔ ${num(r.turn_speed_horizontal)}°/s · ↕ ${num(r.turn_speed_vertical)}°/s`],
  ["Elevazione", (r) => (finito(r.vertical_limit_min) ? r : null), (r) => `da ${num(r.vertical_limit_min)}° a ${num(r.vertical_limit_max)}°`],
  ["Brandeggio", (r) => (finito(r.horizontal_limit_min) ? r : null), (r) => `da ${num(r.horizontal_limit_min)}° a ${num(r.horizontal_limit_max)}°`],
  ["Avvio", "wind_up_time", unita("s")],
  ["Arresto", "wind_down_time", unita("s")],
  // Zaino di teletrasporto
  ["Spinta verso l'alto", "upward_bias", unita("m", 1)],
  ["Spinta verso il basso", "downward_bias", unita("m")],
  ["Taglia massima che sopravvive", "max_killable_unit_size", (v) => TAGLIE[v] || v],
  ["Distanza del teletrasporto", "teleport_distance", unita("m")],
  ["Calore sicuro fino a", "safe_threshold", unita("%")],
  ["Calore pericoloso da", "unsafe_threshold", unita("%")],
  ["Calore per uso", "heat_per_use", unita("% per uso")],
  ["Raffreddamento", "heat_decay", unita("% al secondo")],
  ...SCUDO,
  ["Cadenza del raggio", "beam_fire_rate", unita("colpi/min"), piuDi(1)],
  ["Canne", "barrels", (v) => `× ${num(v)}`, piuDi(1)],
  ["Raggi", "beams", (v) => `× ${num(v)}`, piuDi(1)],
];

// Attesa, chiamata e usi sono nella scheda dell'oggetto (dalla pagina della wiki, più
// affidabile dei dati estratti): qui solo il resto
const STRATAGEMMA = [
  ["Durata", "duration", unita("s")],
  ["Ricarica", "recharge_time", unita("s")],
  ["Raggio di ricerca", "search_radius", unita("m")],
  ["Velocità", "movement_speed", unita("m/s")],
  ["Salute", "health"],
  ...SCUDO,
  ["Corazza", "armor", "ap"],
  ["Cadenza", "rpm", unita("colpi/min"), (v) => v > 0],
  ["Rotazione orizzontale", "turn_hori", unita("°/s")],
  ["Rotazione verticale", "turn_vert", unita("°/s")],
  ["Limiti verticali", "vertical_range", (v) => `${intervallo(v)}°`],
  ["Dura in campo", "lifetime", unita("s")],
  ["Bombe", "num_bombs"],
  ["Salve", "num_salvos"],
  ["Area del bombardamento", "area_size", unita("m")],
  ["Altezza di fuoco", "fire_height", unita("m")],
  ["Ritardo del lancio", "throw_delay", unita("s")],
  ["Durata del lancio", "throw_duration", unita("s")],
  ["Innesco", "arming_time", unita("s")],
  ["Pannelli", "panel_count"],
  ["Oggetti lanciati", "throwable_count"],
];

// Parti speciali della scheda di un'arma (la wiki le aggiunge a mano)
function righeSpeciali(w) {
  const out = [];
  const carica = w.charge?.charge;
  if (Array.isArray(carica) && carica.length) {
    const tempi = carica.map((c) => c.charge_time).filter(finito);
    const minimo = Math.min(...tempi);
    const massimo = Math.max(...tempi);
    const m = w.charge.proj_multipliers || {};
    const [d1, d2] = m.damage_mod || [1, 1];
    out.push({ s: "Carica" });
    for (const c of carica) {
      const quota = massimo > minimo ? (c.charge_time - minimo) / (massimo - minimo) : 0;
      out.push([`Dopo ${num(c.charge_time)} s`, `${num(d1 + (d2 - d1) * quota)}× il danno`]);
    }
    if (m.speed_mod) out.push(["Velocità (moltiplicatore)", intervallo(m.speed_mod)]);
    if (m.distance_mult) out.push(["Distanza (moltiplicatore)", intervallo(m.distance_mult)]);
    if (m.damage_mod) out.push(["Danno (moltiplicatore)", intervallo(m.damage_mod)]);
  }
  const c = w.heatdata;
  if (c) {
    const tre = (normale, freddo, caldo) => `${num(normale, 0)} (freddo ${num(freddo ?? normale, 0)}, caldo ${num(caldo ?? normale, 0)}) °C al secondo`;
    out.push({ s: "Calore" });
    out.push(
      ...righe(
        [
          ["Si surriscalda a", "overheat_temp", unita("°C")],
          ["Riscaldamento", "charge_time", unita("s")],
          ["Calore per colpo", "heat_per_shot", unita("°C"), nonZero],
          ["Calore al secondo", "heat_per_second", unita("°C"), nonZero],
          ["Raffreddamento", "heat_loss_per_second", (v, r) => tre(v, r.heat_loss_per_second_cold, r.heat_loss_per_second_hot)],
          ["Dopo il surriscaldamento", (r) => (r.needs_reload === 1 ? "serve ricaricare" : r.heat_loss_overheat), (v, r) => (typeof v === "string" ? v : tre(v, r.heat_loss_overheat_cold, r.heat_loss_overheat_hot))],
        ],
        c,
      ),
    );
  }
  if (Array.isArray(w.warppack_selfdamage) && w.warppack_selfdamage.length) {
    out.push({ s: "Uso pericoloso: cosa ti fa" });
    for (const z of w.warppack_selfdamage) {
      const pezzi = [z.damage > 0 ? `${num(z.damage)} danni` : null, z.status ? `effetto ${z.status}` : null].filter(Boolean);
      if (pezzi.length) out.push([ZONE[z.zone] || z.zone, pezzi.join(", ")]);
    }
  }
  return out;
}

// Schede di un'arma (dati "weapons") o di uno stratagemma (dati "stratagems").
// `t` e `altre` sono le tabelle dei dati (armi e stratagemmi, in un ordine o nell'altro),
// `stati` i dati degli effetti.
function schede({ voce, tipo = "weapons", t, altre, stati, livello = 0, visti = new Set() }) {
  const out = [];
  if (!voce) return out;
  const cerca = (tab, nome) => t?.[tab]?.[nome] || altre?.[tab]?.[nome] || null;
  out.push({
    id: voce.name,
    titolo: voce.fullname || voce.name,
    tipo: TIPI[tipo],
    livello,
    righe: tipo === "stratagems" ? righe(STRATAGEMMA, voce) : [...righe(ARMA, voce), ...righeSpeciali(voce)],
  });
  const attacchi = voce.attacks || [];
  const figli = new Map();
  for (const a of attacchi) {
    const padre = a.parent || voce.name;
    figli.set(padre, [...(figli.get(padre) || []), a]);
  }
  const visita = (padre, profondita) => {
    for (const a of figli.get(padre) || []) {
      const chiave = `${a.type}:${a.name}`;
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      const scheda = schedaAttacco(a, cerca, stati, livello + profondita);
      if (scheda?.annidata) out.push(...schede({ voce: scheda.annidata, t, altre, stati, livello: livello + profondita, visti }));
      else if (scheda) out.push(scheda);
      visita(a.name, profondita + 1);
    }
  };
  visita(voce.name, 1);
  // Attacchi con un padre che non torna: in fondo, al primo livello
  for (const a of attacchi) {
    if (visti.has(`${a.type}:${a.name}`)) continue;
    visti.add(`${a.type}:${a.name}`);
    const scheda = schedaAttacco(a, cerca, stati, livello + 1);
    if (scheda && !scheda.annidata) out.push(scheda);
  }
  return out;
}

function schedaAttacco(a, cerca, stati, livello) {
  const base = { id: a.name, tipo: TIPI[a.type] || a.type, livello };
  if (a.type === "weapons") {
    const w = cerca("weapons", a.name);
    return w ? { annidata: w } : null;
  }
  if (a.type === "status") {
    const s = stati?.status?.[a.name];
    if (!s) return null;
    const d = s.damage_id ? stati.damage?.[s.damage_id] : null;
    return { ...base, titolo: String(s.name || a.name).replace(/_/g, " "), righe: [...righe(EFFETTO, s), ...righeDanno(d, false)] };
  }
  if (a.type === "damage") {
    const d = cerca("damage", a.name);
    return d ? { ...base, titolo: d.name || a.name, righe: righeDanno(d, false) } : null;
  }
  const tabella = { projectile: "projectile", explosion: "explosion", beam: "beam", arc: "arc", spray: "spray" }[a.type];
  const rec = tabella && cerca(tabella, a.name);
  if (!rec) return null;
  const d = rec.damage_id ? cerca("damage", rec.damage_id) : null;
  const proprie = { projectile: PROIETTILE, explosion: ESPLOSIONE, beam: RAGGIO, arc: ARCO, spray: [] }[a.type];
  return { ...base, titolo: rec.fullname || rec.name || a.name, righe: [...righe(proprie, rec), ...righeDanno(d, a.type === "explosion")] };
}

// Dati nel formato precedente della wiki (pochi oggetti: postazioni, torre Tesla, Hellbomb,
// alcune armi da mischia): gli stessi campi con nomi diversi, riportati a quelli nuovi
function schedeVecchie({ modulo: M, arma: w, nome, stati }) {
  if (!M || !w) return [];
  const rinomina = (rec, nomi) => (rec ? Object.fromEntries(Object.entries(rec).map(([k, v]) => [nomi[k] || k, v])) : null);
  const tab = (nomeTab, nomi) => Object.fromEntries(Object.entries(M[nomeTab] || {}).map(([k, v]) => [k, rinomina(v, { damageid: "damage_id", ...nomi })]));
  const t = {
    damage: M.damage || {},
    projectile: tab("projectile", { penslow: "pen_slow", liferandom: "life_time_randomness", ximpactid: "explode_on_impact_id", xproximity: "explode_proximity", xdelay: "explosion_delay" }),
    explosion: tab("explosion", { shrapnelref: "shrapnel" }),
    arc: tab("arc", { spreadrange: "spread_range", chainangle: "chain_angle", aimangle: "aim_angle" }),
    beam: tab("beam", {}),
    spray: {},
    weapons: {},
  };
  const voce = {
    ...rinomina(w, { rounds_per_minute: "rpm", magazine_capacity: "cap", chambered: "capplus" }),
    name: nome,
    // Nel formato vecchio un attacco "damage" è il nome del danno stesso
    attacks: (w.attacks || []).map((a) => ({ type: a.type, name: a.name, parent: nome })),
  };
  for (const k of ["mags", "magstart", "supply", "rounds", "recoil", "spreadxy", "drift", "climb", "spread", "sway", "noise", "charge", "heatdata", "fire_modes", "roundsupply", "roundstart"]) delete voce[k];
  return schede({ voce, t, altre: {}, stati });
}

module.exports = { schede, schedeVecchie, righe, num };
