const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../app/comune/metriche.js");
const catalogo = require("../app/dati/catalogo.json");

const trova = (id) => {
  const o = catalogo.oggetti.find((x) => x.id === id);
  assert.ok(o, `manca ${id} nel catalogo`);
  return o;
};
const potenza = (id, fazione = "terminidi") => M.potenza(trova(id), catalogo, fazione);

test("regola della perforazione: 100% sopra, 65% uguale, niente sotto", () => {
  assert.equal(M.moltiplicatore(5, 4), 1);
  assert.equal(M.moltiplicatore(4, 4), 0.65);
  assert.equal(M.moltiplicatore(3, 4), 0);
});

test("contro i pesanti un'arma anticarro vale più di un fucile d'assalto", () => {
  for (const fazione of ["terminidi", "automi", "illuminati"]) {
    const ar = potenza("ar-23-liberator", fazione).pesante;
    for (const at of ["eat-17-expendable-anti-tank", "gr-8-recoilless-rifle", "las-99-quasar-cannon", "faf-14-spear"]) {
      assert.ok(potenza(at, fazione).pesante > ar + 2, `${at} contro ${fazione}: ${potenza(at, fazione).pesante} vs Liberator ${ar}`);
    }
  }
});

test("contro le orde un fucile o un lanciafiamme vale più di un anticarro", () => {
  const eat = potenza("eat-17-expendable-anti-tank").leggero;
  assert.ok(potenza("ar-23-liberator").leggero > eat + 3);
  assert.ok(potenza("flam-40-flamethrower").leggero > eat + 3);
});

test("il Quasar abbatte un Charger in uno o due colpi perforando la corazza; il Liberator non la perfora", () => {
  const charger = catalogo.nemici.find((n) => n.id === "charger");
  const quasar = trova("las-99-quasar-cannon").combattimento.colpi.filter((x) => x.tipo !== "arma");
  const k = M.colpiPerUccidere(quasar, charger);
  assert.ok(k.colpi <= 2, `colpi: ${k.colpi}`);
  assert.equal(k.perfora, true);
  const lib = trova("ar-23-liberator").combattimento.colpi;
  assert.equal(M.colpiPerUccidere(lib, charger).perfora, false);
});

test("build vuota: niente fuoco e l'avviso di cosa manca", () => {
  const a = M.analizza({ fazione: "automi" }, catalogo);
  assert.equal(a.potenza.fuoco, 0);
  assert.ok(a.avvisi.some((x) => x.testo.startsWith("Da scegliere")));
});

const fuoco = {
  fazione: "terminidi",
  primaria: "ar-2-coyote",
  secondaria: "gp-31-grenade-pistol",
  granata: "g-10-incendiary",
  stratagemmi: ["orbital-napalm-barrage", "a-flam-40-flame-sentry", "flam-40-flamethrower", "ax-flam-75-hot-dog"],
  armatura: { passiva: "inflammable", peso: "pesante" },
  potenziamento: "vitality-enhancement",
};

test("build completa: voci da 0 a 10, totale e profilo coerenti", () => {
  const a = M.analizza(fuoco, catalogo);
  for (const [k, v] of Object.entries(a.voci)) assert.ok(v >= 0 && v <= 10, `${k} = ${v}`);
  const somma = Object.values(a.voci).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(a.potenza.totale - somma) < 0.3);
  assert.ok(a.voci.leggeri > a.voci.pesanti, "build del fuoco: meglio contro i leggeri");
  assert.ok(a.profilo.pericolo > 30, "fuoco ed esplosioni sono pericolosi per la squadra");
  assert.equal(a.gittata.punti.length, 31);
  assert.ok(a.gittata.corta > a.gittata.lunga, "lanciafiamme: rende da vicino");
  // Granate incendiarie e pistola lanciagranate chiudono i nidi
  assert.ok(a.obiettivi.find((s) => s.nome === "Bug Hole").copertura > 0.9);
});

test("avvisi: due zaini e due armi di supporto", () => {
  const a = M.analizza({ ...fuoco, stratagemmi: ["gr-8-recoilless-rifle", "faf-14-spear", "b-1-supply-pack", "eagle-500kg-bomb"] }, catalogo);
  assert.ok(a.avvisi.some((x) => /zaino/.test(x.testo)));
  assert.ok(a.avvisi.some((x) => /armi di supporto/.test(x.testo)));
});

test("le armi in mano non si sommano: una seconda arma conta un quarto", () => {
  const una = M.analizza({ fazione: "automi", primaria: "ar-23-liberator" }, catalogo);
  const due = M.analizza({ fazione: "automi", primaria: "ar-23-liberator", secondaria: "p-2-peacemaker" }, catalogo);
  assert.ok(due.uccisioni.leggero < una.uccisioni.leggero * 1.3);
  assert.ok(due.uccisioni.leggero >= una.uccisioni.leggero);
});

test("peso dell'armatura: la pesante protegge di più e rallenta", () => {
  const leggera = M.analizza({ fazione: "automi", armatura: { passiva: "extra-padding", peso: "leggera" } }, catalogo);
  const pesante = M.analizza({ fazione: "automi", armatura: { passiva: "extra-padding", peso: "pesante" } }, catalogo);
  assert.ok(pesante.voci.sopravvivenza > leggera.voci.sopravvivenza);
  assert.ok(pesante.profilo.ritmo < leggera.profilo.ritmo);
});

test("gittata: fucile di precisione meglio da lontano, fucile a pompa da vicino", () => {
  const precisione = M.analizza({ fazione: "automi", primaria: "r-63-diligence" }, catalogo).gittata;
  const pompa = M.analizza({ fazione: "automi", primaria: "sg-225-breaker" }, catalogo).gittata;
  assert.ok(precisione.lunga > pompa.lunga);
  assert.ok(pompa.corta >= precisione.corta);
});
