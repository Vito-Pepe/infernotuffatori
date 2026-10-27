// Testi della sezione Wiki dell'app, dalle stesse pagine del catalogo: per ogni nemico,
// oggetto e armatura le sezioni in prosa, le modifiche nelle patch, gli attacchi e l'anatomia
// completa; più le pagine della wiki sulle meccaniche del gioco. Stanno nel catalogo sotto
// "wiki", ma il server li manda un pezzo alla volta, solo quando servono.
const W = require("./wikitesto");
const T = require("./testi");

// Pagine sulle meccaniche: identificativo nell'app → titolo sulla wiki
const PAGINE_MECCANICHE = { damage: "Damage", "status-effects": "Status Effects", armor: "Armor", difficulty: "Difficulty", demolition: "Demolition" };
// Collegamenti della wiki che portano a una sezione di quelle pagine
const ALIAS_PAGINE = {
  "armor penetration": "damage",
  "armor value": "damage",
  "damage types": "damage",
  "armor rating": "damage",
  "durable damage": "damage",
  stagger: "status-effects",
  "status effect": "status-effects",
  helmets: "armor",
  helmet: "armor",
};

function percento(v) {
  const n = W.numero(v);
  return n == null ? 0 : n / 100;
}

// Una riga dell'anatomia di un nemico (o di un mezzo), con tutti i campi della wiki
function parteAnatomia(r) {
  const salute = W.pulisci(r.health);
  const sanguina = W.pulisci(r.bleed);
  return {
    nome: W.pulisci(r.part_name),
    salute: /^main/i.test(salute) ? "main" : W.numero(salute),
    av: W.numero(r.av) ?? 0,
    durevole: percento(r.durability),
    versoMain: /^-|^$/.test(W.pulisci(r.percent_to_main)) ? null : percento(r.percent_to_main),
    fatale: /^yes/i.test(W.pulisci(r.fatal)),
    resistenzaEsplosioni: percento(r.exdr),
    limite: /^yes/i.test(W.pulisci(r.dmg_cap_main)) ? true : /^no/i.test(W.pulisci(r.dmg_cap_main)) ? false : null,
    sanguina: sanguina && !/^none$/i.test(sanguina) ? sanguina : null,
  };
}

function anatomia(testo) {
  const tabella = W.templates(testo).find((t) => t.nome === "anatomy table");
  return tabella ? W.interni(tabella.corpo, "Anatomy Row").map(parteAnatomia).filter((p) => p.nome) : [];
}

// Come si ottiene un oggetto: fonte, livello e costo dalla scheda della wiki
function ottenimento(testo) {
  const ib = W.trova(testo, ["Infobox Weapon", "Weapon", "Infobox Throwable", "Infobox Stratagem", "Infobox Support Weapon", "Infobox Booster"]);
  if (!ib) return null;
  const p = ib.nominati;
  const o = {
    fonte: W.pulisci(String(p.source || "").replace(/<small>[\s\S]*?<\/small>/gi, "")) || null,
    livello: W.numero(p.unlock_level),
    costo: W.pulisci(p.unlock_cost || p.cost) || null,
  };
  return o.fonte || o.livello != null || o.costo ? o : null;
}

// Attacchi della scheda del nemico: "{{Damage|Melee|350 Stomp|notext}} <hr> ..." → ["350 Stomp", ...]
function danniNemico(ib) {
  return String(ib?.nominati?.damage || "")
    .split(/<hr\s*\/?>|<br\s*\/?>/i)
    .map((x) => W.pulisci(x))
    .filter(Boolean);
}

// Dal titolo di una pagina della wiki alla pagina dell'app (se c'è)
function indice({ oggetti, nemici, armature, senzaSigla }) {
  const mappa = new Map();
  const metti = (chiave, valore) => {
    const k = String(chiave || "").toLowerCase().trim();
    if (k && !mappa.has(k)) mappa.set(k, valore);
  };
  for (const o of oggetti) metti(o.pagina, { v: "oggetto", id: o.id });
  for (const n of nemici) metti(n.nome, { v: "nemico", id: n.id });
  for (const a of armature) metti(a.nome, { v: "armatura", id: a.id });
  for (const [id, titolo] of Object.entries(PAGINE_MECCANICHE)) metti(titolo, { v: "pagina", id });
  for (const [alias, id] of Object.entries(ALIAS_PAGINE)) metti(alias, { v: "pagina", id });
  // Senza sigla ("Railgun" → "RS-422 Railgun"), solo quando non è ambiguo
  const senza = new Map();
  for (const o of oggetti) {
    const k = senzaSigla(o.pagina).toLowerCase();
    if (k !== o.pagina.toLowerCase()) senza.set(k, senza.has(k) ? null : { v: "oggetto", id: o.id });
  }
  for (const [k, v] of senza) if (v) metti(k, v);
  return (titolo) => {
    const k = String(titolo).replace(/_/g, " ").toLowerCase().trim();
    return mappa.get(k) || mappa.get(k.replace(/s$/, "")) || mappa.get(k.replace(/es$/, "")) || null;
  };
}

// Toglie le parti vuote
function compatta(voce) {
  return Object.fromEntries(Object.entries(voce).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)));
}

function enciclopedia({ pagine, oggetti, nemici, armature, senzaSigla }) {
  const collega = indice({ oggetti, nemici, armature, senzaSigla });
  const wiki = { oggetti: {}, nemici: {}, armature: {}, pagine: {} };

  for (const o of oggetti) {
    const p = pagine[o.pagina];
    if (!p) continue;
    const ctx = { titolo: o.pagina, collega, v: "oggetto", id: o.id };
    wiki.oggetti[o.id] = compatta({
      sezioni: T.sezioni(p.testo, ctx),
      modifiche: T.modifiche(p.testo, ctx),
      anatomia: anatomia(p.testo),
      ottenimento: ottenimento(p.testo),
    });
  }

  for (const n of nemici) {
    const p = pagine[n.nome];
    if (!p) continue;
    const ctx = { titolo: n.nome, collega, v: "nemico", id: n.id };
    const ib = W.trova(p.testo, ["Infobox Enemy"]);
    wiki.nemici[n.id] = compatta({
      danni: danniNemico(ib),
      tipoDanno: W.pulisci(ib?.nominati?.damage_type) || null,
      attacchi: T.attacchi(p.testo, ctx),
      anatomia: anatomia(p.testo),
      sezioni: T.sezioni(p.testo, ctx),
      modifiche: T.modifiche(p.testo, ctx),
    });
  }

  for (const a of armature) {
    const p = pagine[a.pagina];
    if (!p) continue;
    const ctx = { titolo: a.pagina, collega, v: "armatura", id: a.id };
    wiki.armature[a.id] = compatta({ sezioni: T.sezioni(p.testo, ctx), modifiche: T.modifiche(p.testo, ctx) });
  }

  for (const [id, titolo] of Object.entries(PAGINE_MECCANICHE)) {
    const p = pagine[titolo];
    if (!p) continue;
    const ctx = { titolo, collega, v: "pagina", id };
    const sezioni = T.sezioni(p.testo, ctx, { tutte: true });
    if (sezioni.length) wiki.pagine[id] = compatta({ titolo, sezioni, modifiche: T.modifiche(p.testo, ctx) });
  }
  return wiki;
}

module.exports = { enciclopedia, parteAnatomia, anatomia, PAGINE_MECCANICHE };
