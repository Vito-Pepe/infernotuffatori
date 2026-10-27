// Confronto tra due cataloghi: oggetti, nemici e strutture aggiunti, tolti e cambiati (con i
// valori prima e dopo). È il contenuto della pagina "Novità".

// Valori confrontati, con il nome mostrato nell'app
const CAMPI_SCHEDA = {
  perforazione: "Perforazione",
  caricatore: "Caricatore",
  riserva: "Riserva",
  ricarica: "Ricarica (s)",
  cadenza: "Cadenza (colpi/min)",
  raggio: "Raggio (m)",
  quantita: "Quantità",
  chiamata: "Chiamata (s)",
  attesa: "Attesa (s)",
  usi: "Usi",
  riarmo: "Riarmo (s)",
};

const CAMPI_COLPO = {
  danno: "danno",
  durevole: "danno durevole",
  ap: "perforazione",
  demolizione: "demolizione",
  proiettili: "proiettili",
};

const NOMI_COLPO = { proiettile: "Proiettile", esplosione: "Esplosione", raggio: "Raggio", arco: "Arco", spruzzo: "Getto", mischia: "Colpo", stato: "Effetto" };

function colpiPiatti(c, prefisso = "") {
  const out = [];
  for (const x of c?.colpi || []) {
    if (x.tipo === "arma") out.push(...colpiPiatti(x, `${x.nome} · `));
    else out.push({ ...x, etichetta: `${prefisso}${NOMI_COLPO[x.tipo] || x.tipo}${x.nome ? ` ${x.nome}` : ""}` });
  }
  // Etichette uniche (due esplosioni diventano "Esplosione" ed "Esplosione 2")
  const visti = {};
  for (const x of out) {
    visti[x.etichetta] = (visti[x.etichetta] || 0) + 1;
    if (visti[x.etichetta] > 1) x.etichetta += ` ${visti[x.etichetta]}`;
  }
  return out;
}

function modifiche(a, b) {
  const out = [];
  const sa = a.scheda || {};
  const sb = b.scheda || {};
  for (const [k, nome] of Object.entries(CAMPI_SCHEDA)) {
    if ((sa[k] ?? null) !== (sb[k] ?? null) && (sa[k] != null || sb[k] != null)) out.push({ campo: nome, prima: sa[k] ?? null, dopo: sb[k] ?? null });
  }
  const ca = colpiPiatti(a.combattimento);
  const cb = colpiPiatti(b.combattimento);
  for (const x of cb) {
    const y = ca.find((z) => z.etichetta === x.etichetta);
    if (!y) continue;
    for (const [k, nome] of Object.entries(CAMPI_COLPO)) {
      if (x[k] != null && y[k] != null && x[k] !== y[k]) out.push({ campo: `${x.etichetta}: ${nome}`, prima: y[k], dopo: x[k] });
    }
    const ra = (y.raggi || []).join("/");
    const rb = (x.raggi || []).join("/");
    if (ra && rb && ra !== rb) out.push({ campo: `${x.etichetta}: raggio (m)`, prima: ra, dopo: rb });
  }
  const etA = new Set(ca.map((x) => x.etichetta));
  const etB = new Set(cb.map((x) => x.etichetta));
  for (const e of etB) if (!etA.has(e)) out.push({ campo: e, prima: null, dopo: "nuovo" });
  for (const e of etA) if (!etB.has(e)) out.push({ campo: e, prima: "c'era", dopo: null });
  return out;
}

// Parti dei nemici: le frazioni (0-1) si mostrano in percentuale
const CAMPI_PARTE = {
  salute: ["salute", 1],
  av: ["corazza", 1],
  durevole: ["durevolezza (%)", 100],
  resistenzaEsplosioni: ["resistenza alle esplosioni (%)", 100],
  versoMain: ["danno passato al corpo (%)", 100],
};

function valoreParte(v, scala) {
  return typeof v === "number" ? Math.round(v * scala * 100) / 100 : (v ?? null);
}

// Parti con nome unico ("Legs (2)" due volte diventa "Legs (2)" e "Legs (2) 2")
function partiPerNome(n) {
  const out = new Map();
  for (const p of n.parti || []) {
    let nome = p.main ? "Corpo" : p.nome;
    for (let i = 2; out.has(nome); i++) nome = `${p.main ? "Corpo" : p.nome} ${i}`;
    out.set(nome, p);
  }
  return out;
}

function modificheNemico(a, b) {
  const out = [];
  if (a.salute !== b.salute) out.push({ campo: "Salute", prima: a.salute ?? null, dopo: b.salute ?? null });
  if (a.classe !== b.classe) out.push({ campo: "Classe", prima: a.classe ?? null, dopo: b.classe ?? null });
  const pa = partiPerNome(a);
  const pb = partiPerNome(b);
  for (const [nome, y] of pb) {
    const x = pa.get(nome);
    if (!x) {
      out.push({ campo: nome, prima: null, dopo: "nuova" });
      continue;
    }
    for (const [k, [etichetta, scala]] of Object.entries(CAMPI_PARTE)) {
      // La salute del corpo è già la salute del nemico
      if (k === "salute" && y.main) continue;
      const va = valoreParte(x[k], scala);
      const vb = valoreParte(y[k], scala);
      if (va !== vb) out.push({ campo: `${nome}: ${etichetta}`, prima: va, dopo: vb });
    }
  }
  for (const nome of pa.keys()) if (!pb.has(nome)) out.push({ campo: nome, prima: "c'era", dopo: null });
  return out;
}

function confrontaNemici(vecchio, nuovo) {
  const prima = new Map((vecchio?.nemici || []).map((n) => [n.id, n]));
  const dopo = new Map((nuovo?.nemici || []).map((n) => [n.id, n]));
  const breve = (n) => ({ id: n.id, nome: n.nome, fazione: n.fazione });
  const out = [];
  for (const [id, n] of dopo) {
    const v = prima.get(id);
    if (!v) out.push({ ...breve(n), modifiche: [{ campo: "Nemico", prima: null, dopo: "nuovo" }] });
    else {
      const m = modificheNemico(v, n);
      if (m.length) out.push({ ...breve(n), modifiche: m });
    }
  }
  for (const [id, v] of prima) if (!dopo.has(id)) out.push({ ...breve(v), modifiche: [{ campo: "Nemico", prima: "c'era", dopo: null }] });
  return out;
}

// Strutture: forza di demolizione che serve e se ci vuole un'esplosione
function confrontaStrutture(vecchio, nuovo) {
  const chiave = (x) => `${x.fazione}|${x.nome}`;
  const prima = new Map((vecchio?.strutture || []).map((x) => [chiave(x), x]));
  const dopo = new Map((nuovo?.strutture || []).map((x) => [chiave(x), x]));
  const breve = (x) => ({ nome: x.nome, fazione: x.fazione });
  const out = [];
  for (const [k, x] of dopo) {
    const v = prima.get(k);
    if (!v) {
      out.push({ ...breve(x), modifiche: [{ campo: "Struttura", prima: null, dopo: "nuova" }] });
      continue;
    }
    const m = [];
    if (v.forza !== x.forza) m.push({ campo: "Forza di demolizione", prima: v.forza ?? null, dopo: x.forza ?? null });
    // balistica = resistenza ai proiettili (BaDR): serve un'esplosione
    if (Boolean(v.balistica) !== Boolean(x.balistica)) m.push({ campo: "Serve un'esplosione", prima: v.balistica ? "sì" : "no", dopo: x.balistica ? "sì" : "no" });
    if (m.length) out.push({ ...breve(x), modifiche: m });
  }
  for (const [k, v] of prima) if (!dopo.has(k)) out.push({ ...breve(v), modifiche: [{ campo: "Struttura", prima: "c'era", dopo: null }] });
  return out;
}

// Armature per il corpo: protezione, velocità, stamina e passiva
const CAMPI_ARMATURA = { protezione: "Protezione", velocita: "Velocità", stamina: "Rigenerazione stamina", passiva: "Passiva" };

function confrontaArmature(vecchio, nuovo) {
  // Un catalogo senza armature (versione vecchia) non vuol dire che sono tutte nuove
  if (!vecchio?.armature?.length) return [];
  const prima = new Map(vecchio.armature.map((a) => [a.id, a]));
  const dopo = new Map((nuovo?.armature || []).map((a) => [a.id, a]));
  const breve = (a) => ({ id: a.id, nome: a.nome, peso: a.peso });
  const out = [];
  for (const [id, a] of dopo) {
    const v = prima.get(id);
    if (!v) {
      out.push({ ...breve(a), modifiche: [{ campo: "Armatura", prima: null, dopo: "nuova" }] });
      continue;
    }
    const m = Object.entries(CAMPI_ARMATURA)
      .filter(([k]) => (v[k] ?? null) !== (a[k] ?? null))
      .map(([k, nome]) => ({ campo: nome, prima: v[k] ?? null, dopo: a[k] ?? null }));
    if (m.length) out.push({ ...breve(a), modifiche: m });
  }
  for (const [id, v] of prima) if (!dopo.has(id)) out.push({ ...breve(v), modifiche: [{ campo: "Armatura", prima: "c'era", dopo: null }] });
  return out;
}

function confronta(vecchio, nuovo) {
  const prima = new Map((vecchio?.oggetti || []).map((o) => [o.id, o]));
  const dopo = new Map((nuovo?.oggetti || []).map((o) => [o.id, o]));
  const breve = (o) => ({ id: o.id, nome: o.nome, slot: o.slot });
  const aggiunti = [...dopo.values()].filter((o) => !prima.has(o.id)).map(breve);
  const rimossi = [...prima.values()].filter((o) => !dopo.has(o.id)).map(breve);
  const cambiati = [];
  for (const [id, b] of dopo) {
    const a = prima.get(id);
    if (!a) continue;
    const m = modifiche(a, b);
    if (m.length) cambiati.push({ ...breve(b), modifiche: m });
  }
  const nemici = confrontaNemici(vecchio, nuovo);
  const strutture = confrontaStrutture(vecchio, nuovo);
  const armature = confrontaArmature(vecchio, nuovo);
  const totale = aggiunti.length + rimossi.length + cambiati.length + nemici.length + strutture.length + armature.length;
  return { aggiunti, rimossi, cambiati, nemici, strutture, armature, totale, vuoto: totale === 0 };
}

module.exports = { confronta };
