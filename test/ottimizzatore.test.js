const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../app/comune/metriche.js");
const O = require("../app/comune/ottimizzatore.js");
const catalogo = require("../app/dati/catalogo.json");

const FAZIONI = ["terminidi", "automi", "illuminati"];
const trova = (id) => catalogo.oggetti.find((x) => x.id === id);
const ids = (slot) => catalogo.oggetti.filter((o) => o.slot === slot).map((o) => o.id);

// Build a caso ma sempre le stesse
function generatore(seme) {
  let s = seme;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const uno = (lista, vuoto = 0.15) => (rnd() < vuoto ? null : lista[Math.floor(rnd() * lista.length)]);
  return (fazione) => ({
    fazione,
    primaria: uno(ids("primaria")),
    secondaria: uno(ids("secondaria")),
    granata: uno(ids("granata")),
    stratagemmi: [0, 1, 2, 3].map(() => uno(ids("stratagemma"))),
    armatura: { passiva: uno(ids("armatura")), peso: ["leggera", "media", "pesante"][Math.floor(rnd() * 3)] },
    potenziamento: uno(ids("potenziamento")),
  });
}

function controllaVincoli(b) {
  const strat = b.stratagemmi.map(trova);
  assert.ok(strat.every(Boolean), "quattro stratagemmi");
  assert.equal(new Set(b.stratagemmi).size, 4, "tutti diversi");
  const zaini = strat.filter((o) => o.tipo === "zaino" || (o.tratti || []).includes("Backpack"));
  assert.ok(zaini.length <= 1, `zaini: ${zaini.map((o) => o.nome)}`);
  assert.ok(strat.filter((o) => o.tipo === "arma").length <= 1, "un'arma di supporto");
  assert.ok(strat.filter((o) => o.tipo === "veicolo").length <= 1, "un veicolo");
  for (const posto of ["primaria", "secondaria", "granata", "potenziamento"]) assert.equal(trova(b[posto])?.slot, posto, posto);
  assert.equal(trova(b.armatura.passiva)?.slot, "armatura");
  assert.ok(catalogo.armature.some((a) => a.passivaId === b.armatura.passiva && a.peso === b.armatura.peso), "passiva e peso di un'armatura vera");
}

test("punteggio veloce: lo stesso totale di analizza", () => {
  const nuova = generatore(7);
  for (const fazione of FAZIONI) {
    for (let i = 0; i < 400; i++) {
      const b = nuova(fazione);
      assert.equal(Math.round(M.punteggio(b, catalogo) * 10) / 10, M.analizza(b, catalogo).potenza.totale, JSON.stringify(b));
    }
  }
  assert.equal(M.punteggio({ fazione: "automi" }, catalogo), M.analizza({ fazione: "automi" }, catalogo).potenza.totale);
});

test("build migliore: completa, possibile e che nessun cambio migliora", () => {
  for (const fazione of FAZIONI) {
    const r = O.ottimizza(catalogo, fazione);
    controllaVincoli(r.build);
    assert.equal(r.build.fazione, fazione);
    assert.equal(r.punteggio, M.punteggio(r.build, catalogo));
    assert.ok(r.armature.length > 0, "con il nome di un'armatura");
    assert.deepEqual(O.consigli(r.build, catalogo).mosse, [], `${fazione}: nessun consiglio sulla build migliore`);
    // Nessuna build a caso fa di meglio
    const nuova = generatore(11);
    for (let i = 0; i < 200; i++) assert.ok(M.punteggio(nuova(fazione), catalogo) <= r.punteggio);
  }
});

test("build migliore: sempre la stessa, e più partenze non trovano di meglio", () => {
  const a = O.ottimizza(catalogo, "automi");
  assert.deepEqual(O.ottimizza(catalogo, "automi").build, a.build);
  const b = O.ottimizza(catalogo, "automi", { partenze: 60, seme: 99 });
  assert.ok(b.punteggio <= a.punteggio + 1e-9, `${b.punteggio} > ${a.punteggio}`);
});

test("pezzi fissi: restano al loro posto, il resto si riempie", () => {
  const fissi = { fazione: "terminidi", nome: "Mia", note: "x", primaria: "ar-23-liberator", secondaria: null, granata: null, stratagemmi: [null, "eagle-500kg-bomb", null, null], armatura: { passiva: null, peso: "pesante" }, potenziamento: null };
  const r = O.ottimizza(catalogo, "terminidi", { fissi });
  assert.equal(r.build.primaria, "ar-23-liberator");
  assert.equal(r.build.stratagemmi[1], "eagle-500kg-bomb");
  assert.equal(r.build.nome, "Mia");
  controllaVincoli(r.build);
  // Con la passiva scelta, passiva e peso restano quelli
  const conPassiva = O.ottimizza(catalogo, "terminidi", { fissi: { ...fissi, armatura: { passiva: "fortified", peso: "leggera" } } });
  assert.deepEqual(conPassiva.build.armatura, { passiva: "fortified", peso: "leggera" });
  assert.ok(r.punteggio <= O.ottimizza(catalogo, "terminidi").punteggio);
});

test("consigli: ogni cambio alza il punteggio di quanto dice", () => {
  const nuova = generatore(5);
  for (const fazione of FAZIONI) {
    const b = nuova(fazione);
    const c = O.consigli(b, catalogo);
    assert.ok(c.mosse.length > 0);
    assert.equal(c.punteggio, M.punteggio(b, catalogo));
    for (const m of c.mosse) {
      const dopo = structuredClone(b);
      if (m.posto === "stratagemma") dopo.stratagemmi[m.indice] = m.a;
      else if (m.posto === "armatura") dopo.armatura = { passiva: m.a, peso: m.peso };
      else dopo[m.posto] = m.a;
      assert.ok(m.guadagno >= O.MINIMO);
      assert.ok(Math.abs(M.punteggio(dopo, catalogo) - c.punteggio - m.guadagno) < 1e-9, JSON.stringify(m));
    }
    // Uno stratagemma consigliato una volta sola, e mai un secondo zaino
    const strat = c.mosse.filter((m) => m.posto === "stratagemma");
    assert.equal(new Set(strat.map((m) => m.a)).size, strat.length);
    assert.equal(new Set(strat.map((m) => m.indice)).size, strat.length);
  }
  // Su una build vuota si consiglia qualcosa per ogni posto, e seguendo tutti i consigli si
  // ha una build che si può portare
  for (const fazione of FAZIONI) {
    const vuota = { fazione, stratagemmi: [null, null, null, null], armatura: { passiva: null, peso: "media" } };
    const c = O.consigli(vuota, catalogo);
    assert.deepEqual([...new Set(c.mosse.map((m) => m.posto))].sort(), ["armatura", "granata", "potenziamento", "primaria", "secondaria", "stratagemma"]);
    const piena = structuredClone(vuota);
    for (const m of c.mosse) {
      if (m.posto === "stratagemma") piena.stratagemmi[m.indice] = m.a;
      else if (m.posto === "armatura") piena.armatura = { passiva: m.a, peso: m.peso };
      else piena[m.posto] = m.a;
    }
    controllaVincoli(piena);
  }
});

test("prova: il punteggio della build con ogni oggetto di un posto", () => {
  const b = generatore(3)("automi");
  const p = O.prova(b, catalogo, "primaria");
  assert.equal(p.base, M.punteggio(b, catalogo));
  assert.equal(p.senza, M.punteggio({ ...b, primaria: null }, catalogo));
  for (const id of ids("primaria").slice(0, 10)) assert.ok(Math.abs(p.punteggi.get(id) - M.punteggio({ ...b, primaria: id }, catalogo)) < 1e-9);
  const s = O.prova(b, catalogo, "stratagemma", 2);
  for (const id of ids("stratagemma").slice(0, 10)) {
    const dopo = structuredClone(b);
    dopo.stratagemmi[2] = id;
    assert.ok(Math.abs(s.punteggi.get(id) - M.punteggio(dopo, catalogo)) < 1e-9);
  }
  const a = O.prova(b, catalogo, "armatura");
  assert.ok(Math.abs(a.punteggi.get("fortified") - M.punteggio({ ...b, armatura: { ...b.armatura, passiva: "fortified" } }, catalogo)) < 1e-9);
});

test("armi a colpi: la riserva della wiki è in colpi (Punisher: 16 nel tubo e 60 di riserva)", () => {
  const nemici = catalogo.nemici.filter((n) => n.fazione === "terminidi" && n.parti?.length);
  const punisher = trova("sg-8-punisher");
  assert.equal(punisher.combattimento.munizioni, "rounds");
  // Come un'arma a caricatori con 60/16 caricatori di riserva: 76 colpi in tutto
  const comeCaricatori = structuredClone(punisher);
  Object.assign(comeCaricatori.combattimento, { munizioni: "mags", riserva: 60 / 16 });
  assert.deepEqual(M.analizzaOggetto(punisher, nemici).kpm, M.analizzaOggetto(comeCaricatori, nemici).kpm);
  // Contare 60 caricatori (976 colpi) la farebbe rendere di più contro le orde
  const sbagliata = structuredClone(punisher);
  Object.assign(sbagliata.combattimento, { munizioni: "mags", riserva: 60 });
  assert.ok(M.analizzaOggetto(sbagliata, nemici).kpm.leggero > M.analizzaOggetto(punisher, nemici).kpm.leggero);
});

test("avvisi: due veicoli", () => {
  const veicoli = catalogo.oggetti.filter((o) => o.tipo === "veicolo").slice(0, 2).map((o) => o.id);
  const a = M.analizza({ fazione: "automi", stratagemmi: [...veicoli, null, null] }, catalogo);
  assert.ok(a.avvisi.some((x) => /2 veicoli/.test(x.testo)));
});
