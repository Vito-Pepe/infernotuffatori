const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../app/comune/democracy.js");
const catalogo = require("../app/dati/catalogo.json");

const codifica = (dati) => Buffer.from(JSON.stringify(dati)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

test("link di democracy-hub con il nome davanti", () => {
  const link =
    "fire: https://democracy-hub.net/builder/builder.php?v=WzAsIk5PUk1BTCIsIkFSLTIgQ09ZT1RFIiwiR1AtMzEgR1JFTkFERSBQSVNUT0wiLCJHLTEwIElOQ0VORElBUlkiLCJPUkJJVEFMIE5BUEFMTSBCQVJSQUdFIiwiQS9GTEFNLTQwIEZMQU1FIFNFTlRSWSIsIkZMQU0tNDAgRkxBTUVUSFJPV0VSIiwiQVgvRkxBTS03NSBIT1QgRE9HIiwiSU5GTEFNTUFCTEUgKEhFQVZZKSIsIlZJVEFMSVRZIEVOSEFOQ0VNRU5UIl0";
  const [voce] = D.estrai(link);
  assert.equal(voce.nome, "fire");
  const { build, mancanti } = D.aBuild(voce, catalogo);
  assert.deepEqual(mancanti, []);
  assert.deepEqual(build, {
    nome: "fire",
    fazione: "terminidi",
    variante: null,
    primaria: "ar-2-coyote",
    secondaria: "gp-31-grenade-pistol",
    granata: "g-10-incendiary",
    stratagemmi: ["orbital-napalm-barrage", "a-flam-40-flame-sentry", "flam-40-flamethrower", "ax-flam-75-hot-dog"],
    armatura: { passiva: "inflammable", peso: "pesante" },
    potenziamento: "vitality-enhancement",
    note: "",
  });
});

test("grafie inglesi, posti vuoti, varianti e armature con due passive", () => {
  const dati = [1, "JET BRIGADE", "AR-61 TENDERISER", "CQC-2 SABRE", "NO GRENADE", "MD-14 INCENDIARY MINES", null, "NO STRATAGEM", "EAT-411 LEVELLER", "CONCUSSIVE PADDING, GRENADIER (LIGHT)", "HELLPOD SPACE OPTIMISATION"];
  const [voce] = D.estrai(`https://democracy-hub.net/builder/builder.php?v=${codifica(dati)}`);
  const { build, mancanti } = D.aBuild(voce, catalogo);
  assert.deepEqual(mancanti, []);
  assert.equal(build.fazione, "automi");
  assert.equal(build.variante, "JET BRIGADE");
  assert.equal(build.nome, "Build importata");
  assert.equal(build.primaria, "ar-61-tenderizer");
  assert.equal(build.secondaria, "cqc-2-saber");
  assert.equal(build.granata, null);
  assert.deepEqual(build.stratagemmi, ["md-i4-incendiary-mines", null, null, "eat-411-leveller"]);
  assert.deepEqual(build.armatura, { passiva: "concussive-padding-grenadier", peso: "leggera" });
  assert.equal(build.potenziamento, "hellpod-space-optimization");
});

test("nomi sconosciuti e link rotti", () => {
  const [voce] = D.estrai(`x https://democracy-hub.net/builder/builder.php?v=${codifica([2, "NORMAL", "ARMA CHE NON ESISTE"])}`);
  assert.deepEqual(D.aBuild(voce, catalogo).mancanti, ["ARMA CHE NON ESISTE"]);
  assert.equal(D.estrai("https://democracy-hub.net/builder/builder.php?v=%%%")[0].errore, "link non valido");
  assert.deepEqual(D.estrai("nessun link qui"), []);
});
