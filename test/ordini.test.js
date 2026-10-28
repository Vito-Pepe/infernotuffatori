const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { leggiOrdini, leggiDispacci, giocatori, pulisci } = require("../server/ordini/guerra");
const { Ordini } = require("../server/ordini/ordini");

// Dati nel formato delle risposte del gioco (come li descrive la community:
// github.com/helldivers-2/api, modelli ArrowHead; tipi da github.com/helldivers-2/json)
const ORA = Date.parse("2026-10-28T10:00:00Z");
const stato = {
  time: 100000,
  planetStatus: [
    { index: 123, owner: 3, health: 600000, regenPerSecond: 1.5, players: 15000 },
    { index: 64, owner: 1, health: 1000000, regenPerSecond: 0, players: 2000 },
    { index: 200, owner: 1, health: 1000000, regenPerSecond: 0, players: 3000 },
  ],
  planetEvents: [{ id: 1, planetIndex: 200, eventType: 1, race: 2, health: 250000, maxHealth: 1000000, startTime: 90000, expireTime: 103600 }],
};
const info = { planetInfos: [{ index: 123, maxHealth: 1000000 }, { index: 64, maxHealth: 1000000 }, { index: 200, maxHealth: 1000000 }] };
const pianeti = { 123: { name: "Malevelon Creek", sector: "Severin" }, 64: { name: "Meridia", sector: "Umlaut" }, 200: { name: "Hellmire", sector: "Hydra" } };
const oggetti = { 16338515: { name: "G-13 Incendiary Impact" } };
const ctx = { ora: ORA, stato, info, pianeti, oggetti };

const mo = (progress, tasks, extra = {}) => ({
  id32: 4242,
  progress,
  expiresIn: 3 * 24 * 3600,
  setting: {
    type: 4,
    overrideTitle: "ORDINE PRIORITARIO",
    overrideBrief: "Gli Automi minacciano <i=1>Malevelon Creek</i>.",
    taskDescription: "Liberate Malevelon Creek ed eliminate i Terminidi.",
    tasks,
    reward: { type: 1, id32: 897894480, amount: 45 },
    rewards: [{ type: 1, id32: 897894480, amount: 45 }],
    flags: 1,
    ...extra,
  },
});

test("ordini: compiti di ogni tipo in italiano, con fatto, obiettivo e quanto manca", () => {
  const [o] = leggiOrdini(
    [
      mo(
        [0, 1234567, 4, 0, 7, 1],
        [
          { type: 11, values: [1, 1, 123], valueTypes: [3, 11, 12] },
          { type: 3, values: [2, 0, 2500000, 0, 0], valueTypes: [1, 2, 3, 4, 5] },
          { type: 12, values: [10, 3, 0, 0], valueTypes: [3, 1, 11, 12] },
          { type: 12, values: [1, 2, 1, 200], valueTypes: [3, 1, 11, 12] },
          { type: 3, values: [3, 100, 16338515, 7], valueTypes: [1, 3, 5, 9] },
          { type: 99, values: [5], valueTypes: [3] },
        ],
      ),
    ],
    "maggiore",
    ctx,
  );
  assert.equal(o.titolo, "ORDINE PRIORITARIO");
  assert.equal(o.briefing, "Gli Automi minacciano Malevelon Creek.", "marcatori di colore tolti");
  assert.equal(o.scadenza, "2026-10-31T10:00:00.000Z");
  assert.deepEqual(o.ricompense, [{ tipo: 1, nome: "Medaglie", quantita: 45 }], "la stessa ricompensa una volta sola");
  const [libera, elimina, difesa, difesaPianeta, conArma, ignoto] = o.compiti;
  assert.equal(libera.testo, "Libera Malevelon Creek");
  assert.equal(libera.pianeta.proprietario, "automi");
  assert.equal(libera.pianeta.giocatori, 15000);
  assert.equal(Math.round(libera.percento), 40, "il pianeta è liberato al 40%");
  assert.equal(libera.completato, false);
  assert.equal(elimina.testo, "Elimina 2.500.000 Terminidi");
  assert.deepEqual([elimina.fatto, elimina.obiettivo, elimina.manca, Math.round(elimina.percento * 10) / 10], [1234567, 2500000, 1265433, 49.4]);
  assert.equal(difesa.testo, "Difendi 10 pianeti dagli Automi");
  assert.equal(difesa.percento, 40);
  assert.equal(difesaPianeta.testo, "Difendi Hellmire dai Terminidi");
  assert.equal(difesaPianeta.percento, 75, "difesa in corso al 75%");
  assert.equal(difesaPianeta.pianeta.difesa.fine, "2026-10-28T11:00:00.000Z", "dal tempo del gioco alla data vera");
  assert.equal(conArma.testo, "Elimina 100 Automi usando G-13 Incendiary Impact a difficoltà 7 (Suicide Mission) o più");
  assert.equal(conArma.manca, 93);
  assert.equal(ignoto.testo, "Obiettivo (tipo 99 nei dati del gioco) traguardo 5");
  assert.equal(ignoto.completato, false);
  assert.equal(o.completato, false);
});

test("ordini: pianeta già liberato, dispacci, giocatori, testi del gioco", () => {
  const [o] = leggiOrdini([mo([1], [{ type: 11, values: [1, 1, 64], valueTypes: [3, 11, 12] }])], "maggiore", ctx);
  assert.equal(o.compiti[0].completato, true);
  assert.equal(o.compiti[0].percento, 100);
  assert.equal(o.completato, true);
  const d = leggiDispacci([{ id: 1, published: 96400, message: "<i=3>NUOVO ORDINE</i>\nDifendete Hellmire." }, { id: 2, published: 99000, message: "Rinforzi in arrivo." }, { id: 3, published: 98000, message: "" }], ctx);
  assert.deepEqual(d.map((x) => [x.id, x.data]), [["2", "2026-10-28T09:43:20.000Z"], ["1", "2026-10-28T09:00:00.000Z"]], "dal più recente, vuoti esclusi");
  assert.equal(d[1].testo, "NUOVO ORDINE\nDifendete Hellmire.");
  assert.equal(giocatori(stato), 20000);
  assert.equal(pulisci("<i=1>A</i> e <b>B</b>"), "A e B");
  assert.deepEqual(leggiOrdini(null, "maggiore", ctx), []);
});

test("ordini: aggiornamento, ritmo, scadenza e fonti che non rispondono", async () => {
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), "ordini-"));
  let adesso = ORA;
  let fatto = 1000000;
  let personaleRotto = false;
  const fonti = {
    statiche: async () => ({ guerra: 801, info, pianeti, oggetti }),
    correnti: async () => {
      const ok = (value) => ({ status: "fulfilled", value });
      return {
        maggiori: ok([mo([fatto], [{ type: 3, values: [2, 2000000], valueTypes: [1, 3] }], {})]),
        stato: ok({ ...stato, time: stato.time + (adesso - ORA) / 1000 }),
        dispacci: ok([{ id: 9, published: 99999, message: "Avanti!" }]),
        personale: personaleRotto ? { status: "rejected", reason: new Error("api.diveharder.com non risponde") } : ok([{ id32: 7, progress: [3], expiresIn: 3600, setting: { overrideTitle: "ORDINE PERSONALE", tasks: [{ type: 3, values: [3, 10], valueTypes: [1, 3] }], reward: { type: 1, amount: 5 } } }]),
      };
    },
  };
  try {
    const o = new Ordini({ cartellaDati: cartella, fonti, log: () => {}, adesso: () => adesso });
    let d = await o.aggiorna("prova");
    assert.equal(d.guerra, 801);
    assert.equal(d.maggiori.length, 1);
    assert.equal(d.maggiori[0].compiti[0].ritmo, null, "con un solo dato niente ritmo");
    assert.equal(d.personali[0].titolo, "ORDINE PERSONALE");
    assert.equal(d.personali[0].compiti[0].testo, "Elimina 10 Automi");
    assert.equal(d.giocatori, 20000);
    assert.deepEqual(d.errori, {});

    // Un'ora dopo: +100.000, il personale non risponde (e quello di prima è scaduto)
    adesso += 3600 * 1000;
    fatto += 100000;
    personaleRotto = true;
    d = await o.aggiorna("prova");
    const r = d.maggiori[0].compiti[0].ritmo;
    assert.equal(Math.round(r.perOra), 100000);
    assert.equal(r.misura, "numero");
    assert.equal(Math.round(r.oreAllaFine), 9, "mancano 900.000 a 100.000 all'ora");
    assert.equal(r.inTempo, true);
    assert.equal(d.errori.personale, "api.diveharder.com non risponde");
    assert.deepEqual(d.personali, [], "il personale di ieri è scaduto: non si mostra");
    assert.equal(d.ultimoSuccesso, new Date(adesso).toISOString());

    // Dopo un riavvio i dati restano
    const dopo = new Ordini({ cartellaDati: cartella, fonti, log: () => {}, adesso: () => adesso });
    assert.equal(dopo.dati().maggiori[0].compiti[0].ritmo.oreAllaFine > 8, true);
  } finally {
    fs.rmSync(cartella, { recursive: true, force: true });
  }
});

test("ordini: senza la guerra in corso si dice perché", async () => {
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), "ordini-"));
  try {
    const o = new Ordini({
      cartellaDati: cartella,
      log: () => {},
      fonti: {
        statiche: async () => {
          throw new Error("api.live.prod.thehelldiversgame.com non risponde");
        },
        correnti: async () => assert.fail("senza guerra non si chiede altro"),
      },
    });
    const d = await o.aggiorna();
    assert.equal(d.errori.guerra, "api.live.prod.thehelldiversgame.com non risponde");
    assert.deepEqual(d.maggiori, []);
    assert.equal(d.ultimoSuccesso, null);
  } finally {
    fs.rmSync(cartella, { recursive: true, force: true });
  }
});
