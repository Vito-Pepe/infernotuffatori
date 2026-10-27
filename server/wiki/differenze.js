// Confronto tra due cataloghi: oggetti aggiunti, tolti e cambiati (con i valori prima e
// dopo). È il contenuto della pagina "Novità".

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
  const nemiciPrima = new Map((vecchio?.nemici || []).map((n) => [n.id, n]));
  const nemici = [];
  for (const n of nuovo?.nemici || []) {
    const v = nemiciPrima.get(n.id);
    if (!v) nemici.push({ id: n.id, nome: n.nome, fazione: n.fazione, modifiche: [{ campo: "Nemico", prima: null, dopo: "nuovo" }] });
    else if (v.salute !== n.salute) nemici.push({ id: n.id, nome: n.nome, fazione: n.fazione, modifiche: [{ campo: "Salute", prima: v.salute, dopo: n.salute }] });
  }
  return { aggiunti, rimossi, cambiati, nemici, vuoto: !aggiunti.length && !rimossi.length && !cambiati.length && !nemici.length };
}

module.exports = { confronta };
