const test = require("node:test");
const assert = require("node:assert/strict");
const { fontiDemolizione, indice } = require("../server/wiki/enciclopedia");
const { costruisci } = require("../server/wiki/catalogo");
const { schede, schedeVecchie } = require("../server/wiki/datiattacchi");
const T = require("../server/wiki/testi");
const M = require("../app/comune/metriche.js");

// Come la pagina Demolition della wiki: tabelle delle fonti (righe con rowspan, celle su più
// righe, "All Exosuits", oggetti fuori dal catalogo) e tabella delle strutture
const DEMOLITION = `=== Demolition Force Sources ===
{| class="wikitable sortable"
|+Primary and Secondary Weapons
|'''Weapon'''
|'''Attack'''
|'''Demo Force'''
|'''Explosive?'''
|-
| rowspan="2" |[[R-36 Eruptor]] || Projectile || 30 || No
|-
| Explosion || 20 || Yes
|-
|[[P-34 Breacher]]
|Explosion
|30
|Yes
|}
{| class="wikitable sortable"
|+Other
|'''Weapon'''
|'''Attack'''
|'''Demo Force'''
|'''Explosive?'''
|-
| rowspan="2" | All [[Exosuit]]s || Stomp || 30 || No
|-
| Destruction Explosion || 30 || Yes
|-
| [[NUX-223 Hellbomb]] || Explosion || 60 || Yes
|}
=== Demolition Force vs. Structures ===
{| class="wikitable sortable"
! Faction !! Structure !! BaDR !! Demo Force
|-
! rowspan="2" | {{Super Earth Federation|text}}
| [[Colonies|Colony]] Wall || No || 40
|-
| [[Evacuate High-Value Assets#Defense Gate|Defense Gate]] || No || 40
|-
! rowspan="2" | {{Terminids|text}}
| [[Bug Hole]] (Inner) || Yes || 20
|-
| [[Bug Hole]] (Outer) || No || 40
|}`;

const oggetto = (nome) => ({ id: nome.toLowerCase().replace(/[^a-z0-9]+/g, "-"), nome, pagina: nome });

test("fonti della demolizione: righe con rowspan, esoscheletri e oggetti fuori dal catalogo", () => {
  const oggetti = [oggetto("R-36 Eruptor"), oggetto("P-34 Breacher"), oggetto("EXO-45 Patriot Exosuit"), oggetto("EXO-49 Emancipator Exosuit")];
  const collega = indice({ oggetti, nemici: [], armature: [], senzaSigla: (x) => x });
  const f = fontiDemolizione(DEMOLITION, collega, oggetti);
  const riga = (id, attacco) => f.find((x) => x.id === id && x.attacco === attacco);
  assert.deepEqual(riga("r-36-eruptor", "Projectile"), { id: "r-36-eruptor", nome: "R-36 Eruptor", attacco: "Projectile", forza: 30, esplosiva: false, situazionale: false });
  assert.deepEqual(riga("r-36-eruptor", "Explosion"), { id: "r-36-eruptor", nome: "R-36 Eruptor", attacco: "Explosion", forza: 20, esplosiva: true, situazionale: false }, "la riga dopo il rowspan è della stessa arma");
  assert.equal(riga("p-34-breacher", "Explosion").forza, 30, "celle una per riga");
  // "All Exosuits" vale per ogni esoscheletro; l'esplosione quando vengono distrutti è un caso particolare
  for (const id of ["exo-45-patriot-exosuit", "exo-49-emancipator-exosuit"]) {
    assert.equal(riga(id, "Stomp").forza, 30);
    assert.equal(riga(id, "Destruction Explosion").situazionale, true);
  }
  assert.deepEqual(f.find((x) => x.nome === "NUX-223 Hellbomb"), { id: null, nome: "NUX-223 Hellbomb", attacco: "Explosion", forza: 60, esplosiva: true, situazionale: false });
  assert.equal(f.length, 8);
  assert.deepEqual(fontiDemolizione("niente tabelle", collega, oggetti), []);
});

test("catalogo: strutture di Super Terra e fonti della demolizione", () => {
  const c = costruisci({
    scaricato: "2026-10-27T10:00:00.000Z",
    categorie: {},
    pagine: { Demolition: { titolo: "Demolition", testo: DEMOLITION, categorie: [], immagine: null } },
    moduli: {},
    iconeStratagemmi: [],
  });
  assert.deepEqual(c.strutture, [
    { fazione: "superterra", nome: "Colony Wall", balistica: false, forza: 40 },
    { fazione: "superterra", nome: "Defense Gate", balistica: false, forza: 40 },
    { fazione: "terminidi", nome: "Bug Hole (Inner)", balistica: true, forza: 20 },
    { fazione: "terminidi", nome: "Bug Hole (Outer)", balistica: false, forza: 40 },
  ]);
  // Senza oggetti nel catalogo le fonti restano, senza collegamento
  assert.equal(c.demolizioni.length, 4);
  assert.ok(c.demolizioni.every((d) => d.id === null));
});

test("demolizione: forza, esplosione se serve, casi particolari e tabella della wiki", () => {
  const nido = { nome: "Bug Hole (Inner)", forza: 20, balistica: true };
  const torre = { nome: "Illegal Broadcast Tower", forza: 30, balistica: false };
  const nave = { nome: "Grounded Warp Ship (Shield)", forza: 50, balistica: true };
  const fucile = { id: "fucile", combattimento: { colpi: [{ tipo: "proiettile", demolizione: 30 }, { tipo: "esplosione", demolizione: 20, retro: true }] } };
  // La torre non vuole esplosioni: basta la forza del proiettile
  assert.deepEqual(M.demolizione(fucile, torre, {}), { forza: 30, esplosiva: false, tipo: "proiettile", arma: null, situazionale: false });
  // Il nido vuole un'esplosione: c'è solo quella del contraccolpo, un caso particolare
  assert.equal(M.demolizione(fucile, nido, {}).situazionale, true);
  // Il laser ha forza 20 ma non è un'esplosione: il nido resta
  const laser = { id: "laser", combattimento: { colpi: [{ tipo: "raggio", demolizione: 20 }] } };
  assert.equal(M.demolizione(laser, nido, {}), null);
  assert.ok(M.demolizione(laser, { forza: 20, balistica: false }, {}), "dove non serve l'esplosione basta la forza");
  // Le armi annidate (torrette, esoscheletri) contano
  const torretta = { id: "torretta", combattimento: { colpi: [{ tipo: "arma", nome: "CANNONE", colpi: [{ tipo: "esplosione", demolizione: 50 }] }] } };
  assert.deepEqual(M.demolizione(torretta, nave, {}), { forza: 50, esplosiva: true, tipo: "esplosione", arma: "CANNONE", situazionale: false });
  // La tabella della wiki si aggiunge ai dati del gioco
  const catalogo = { demolizioni: [{ id: "laser", nome: "Laser", attacco: "Overheat Explosion", forza: 50, esplosiva: true, situazionale: true }, { id: "fucile", nome: "Fucile", attacco: "Explosion", forza: 50, esplosiva: true, situazionale: false }] };
  assert.equal(M.demolizione(fucile, nave, catalogo).wiki, true);
  assert.equal(M.demolizione(laser, nave, catalogo).situazionale, true);
  assert.equal(M.fontiDemolizione(fucile, catalogo).length, 3);
  // Se basta l'esplosione conta quella, anche se il proiettile ha più forza
  const bomba = { id: "bomba", combattimento: { colpi: [{ tipo: "proiettile", demolizione: 50 }, { tipo: "esplosione", demolizione: 40 }] } };
  assert.equal(M.demolizione(bomba, torre, {}).esplosiva, true);
  assert.equal(M.demolizione(bomba, { forza: 50, balistica: false }, {}).esplosiva, false, "per 50 serve il colpo diretto");
});

test("dati completi: schede di arma, proiettile, esplosione ed effetto come nella wiki", () => {
  const t = {
    damage: {
      P_dm: { dmg: 300, dmg2: 150, hits_per_second: 0, ap1: 3, ap2: 3, ap3: 2, ap4: 0, demo: 10, stun: 10, push: 20, element_name: "none", element_name_sub: "ballistic", Status_Name_1: "Fire_Panic", Status_Value_1: 4 },
      E_dm: { dmg: 500, dmg2: 500, hits_per_second: 0, ap1: 4, ap2: 4, ap3: 4, ap4: 4, demo: 30, stun: 30, push: 40, element_name: "fire" },
    },
    projectile: { P: { damage_id: "P_dm", caliber: 110, pellets: 1, velocity: 400, mass: 5000, gravity: 1, lifetime: 0, drag: 0.3, pen_slow: 0.25, explode_on_impact_id: "E", arming_distance: 5000, name: "P" } },
    explosion: { E: { damage_id: "E_dm", r1: 2, r2: 5, r3: 8, aoe_duration: 0, name: "E" } },
    beam: {},
    arc: {},
    spray: {},
    weapons: {},
  };
  const voce = {
    name: "PROVA",
    rpm: 600,
    cap: 30,
    mags: 5,
    magstart: 3,
    supply: 5,
    spread: { x: 0.5, y: 1 },
    spread_mods: { x: 2, y: 1 },
    attacks: [
      { type: "projectile", name: "P", parent: "PROVA", level: 1 },
      { type: "explosion", name: "E", parent: "P", level: 2 },
      { type: "status", name: "Fire_Panic", parent: "E", level: 3 },
    ],
  };
  const stati = { status: { Fire_Panic: { strength: 1, duration: 3, name: "Fire_Panic" } }, damage: {} };
  const s = schede({ voce, t, altre: {}, stati });
  assert.deepEqual(s.map((x) => [x.tipo, x.livello]), [["arma", 0], ["proiettile", 1], ["esplosione", 2], ["effetto", 3]]);
  const ha = (scheda, riga) => assert.ok(scheda.righe.some((r) => JSON.stringify(r) === JSON.stringify(riga)), `${scheda.titolo}: manca ${JSON.stringify(riga)}`);
  ha(s[0], ["Cadenza", "600 colpi/min"]);
  ha(s[0], ["Caricatori da una scatola di munizioni", "2"]);
  ha(s[0], ["Dispersione", "↔ 1 · ↕ 1"]);
  ha(s[1], ["Calibro", "110 mm"]);
  ha(s[1], ["Massa", "5 kg"]);
  ha(s[1], ["Velocità iniziale", "400 m/s"]);
  ha(s[1], ["Resistenza dell'aria", "30%"]);
  ha(s[1], ["Esplode all'impatto", "E", "rif"]);
  ha(s[1], ["Normale", "300 balistico"]);
  ha(s[1], ["Contro le parti durevoli", "150 balistico"]);
  ha(s[1], ["Angolo ampio", 2, "ap"]);
  ha(s[1], ["Effetto", "Fire Panic (forza 4)"]);
  assert.ok(!s[1].righe.some((r) => r[0] === "Distanza di innesco"), "distanza di innesco assurda nascosta");
  assert.ok(!s[1].righe.some((r) => r[0] === "Durata del volo"), "zero nascosto");
  ha(s[2], ["Nel raggio interno", "500 fuoco"]);
  ha(s[2], ["Nel raggio esterno", "da 499 a 0"]);
  ha(s[2], ["Nel raggio esterno", 3, "ap"]);
  ha(s[2], ["Forza di demolizione", "30"]);
  ha(s[3], ["Durata", "3 s"]);
});

test("dati completi: numeri all'italiana senza dipendere dalla lingua del sistema", () => {
  const { num } = require("../server/wiki/datiattacchi");
  assert.deepEqual([30, 0.95, 0.5, 2500, 12500, 100, 0, -1, 1.03, 7.5].map((v) => num(v)), ["30", "0,95", "0,5", "2500", "12.500", "100", "0", "-1", "1,03", "7,5"]);
  assert.equal(num(210.00000000000003, 0), "210");
  assert.equal(num("testo"), "testo");
});

test("dati completi: formato vecchio della wiki (postazioni, torre Tesla)", () => {
  const modulo = {
    weapon: {},
    projectile: { X: { caliber: 12.5, pellets: 1, velocity: 880, mass: 52, drag: 0.3, gravity: 1, penslow: 0.25, ximpactid: "Y", damageid: "X_dm", name: "Proiettile" } },
    explosion: { Y: { r1: 1, r2: 3, r3: 4, damageid: "Y_dm", name: "Esplosione" } },
    damage: { X_dm: { dmg: 200, dmg2: 40, ap1: 4, ap2: 4, ap3: 4, ap4: 0, demo: 20, stun: 25, push: 15 }, Y_dm: { dmg: 100, dmg2: 100, ap1: 3, demo: 10 } },
  };
  const arma = { health: 1000, armor: 2, rounds_per_minute: 450, magazine_capacity: 300, chambered: 1, attacks: [{ type: "projectile", name: "X" }, { type: "explosion", name: "Y" }] };
  const s = schedeVecchie({ modulo, arma, nome: "E/MG-101 HMG Emplacement", stati: {} });
  assert.deepEqual(s.map((x) => x.tipo), ["arma", "proiettile", "esplosione"]);
  assert.deepEqual(s[0].righe, [["Salute", "1000"], ["Corazza", 2, "ap"], ["Cadenza", "450 colpi/min"], ["Caricatore", "300"], ["Colpo in canna", "+1"]]);
  assert.ok(s[1].righe.some((r) => r[0] === "Rallentamento quando perfora" && r[1] === "25%"));
  assert.ok(s[1].righe.some((r) => r[0] === "Esplode all'impatto" && r[1] === "Y" && r[2] === "rif"));
});

test("stratagemmi: valori con i moduli della nave e ricarica della pagina", () => {
  const pagina = (titolo, testo) => ({ titolo, testo, categorie: [], immagine: null });
  const c = costruisci({
    scaricato: "2026-10-27T10:00:00.000Z",
    categorie: { stratagemmi: ["Eagle 500kg Bomb", "A/MG-43 Machine Gun Sentry", "MG-43 Machine Gun"] },
    pagine: {
      "Eagle 500kg Bomb": pagina("Eagle 500kg Bomb", "{{Infobox Stratagem\n| permit_type = Offense\n| stratagem_type = Eagle\n}}\n{{Stratagem Stats Table\n| call_time = 3.45\n| uses = 1\n| uses_upgraded = 2\n| cooldown = 15\n| rearm_time = 150\n| rearm_time_upgraded = 120\n}}"),
      "A/MG-43 Machine Gun Sentry": pagina("A/MG-43 Machine Gun Sentry", "{{Infobox Stratagem\n| permit_type = Defensive\n| stratagem_type = Sentry \n}}\n{{Stratagem Stats Table\n| call_time = 7.75\n| call_time_upgraded = 4.75\n| uses = Unlimited\n| cooldown = 90\n| sentry_ammo = 175\n| sentry_health = 400\n| sentry_health_upgraded = 600\n}}"),
      "MG-43 Machine Gun": pagina("MG-43 Machine Gun", "{{Infobox Support Weapon\n| permit_type = Supply\n| stratagem_type = Support Weapon\n| base_cooldown = 480s\n}}\n{{Stratagem Stats Table\n| call_time = 7.75\n| call_time_upgraded = 4.75\n| uses = Unlimited\n| cooldown = 480\n}}"),
    },
    // Nei dati del gioco la ricarica della MG-43 è sbagliata (600): vale quella della pagina
    moduli: { stratagemmi: { stratagems: { "MACHINE GUN": { name: "MACHINE GUN", cooldown: 600, attacks: [] } } } },
    iconeStratagemmi: [],
  });
  const per = (nome) => c.oggetti.find((o) => o.nome === nome);
  const aquila = per("Eagle 500kg Bomb");
  assert.deepEqual({ ...aquila.moduli, moduli: aquila.moduli.moduli.map((m) => m.nome) }, {
    attesa: 6.75,
    usi: 2,
    riarmo: 120,
    riarmoPresto: 108,
    moduli: ["Morale Augmentation", "Liquid-Ventilated Cockpit", "Expanded Weapons Bay", "Pit Crew Hazard Pay", "Advanced Crew Training"],
  });
  const torretta = per("A/MG-43 Machine Gun Sentry");
  assert.equal(torretta.moduli.chiamata, 4.75);
  assert.equal(torretta.moduli.attesa, 76.95, "90 × 0,95 × 0,9");
  assert.equal(torretta.moduli.munizioniTorretta, 263, "+50% come nel modello della wiki");
  assert.equal(torretta.moduli.saluteTorretta, 600);
  assert.equal(torretta.scheda.munizioniTorretta, 175);
  const mg = per("MG-43 Machine Gun");
  assert.equal(mg.scheda.attesa, 480);
  assert.equal(mg.moduli.attesa, 410.4);
  assert.ok(mg.moduli.moduli.some((m) => m.nome === "Streamlined Request Process"));
});

test("tabelle della wiki: le celle con rowspan valgono anche per le righe sotto", () => {
  const [tab] = T.blocchi(`{| class="wikitable"
!Department!!Ship Module!!Effect
|-
| rowspan="2" |Orbital / Cannons
|Zero-G Breech Loading
|Cooldown −10%.
|-
|High-Density Explosives
|Radius +10%.
|-
|Bridge || Targeting Software Upgrade || Call-in −1 s.
|}`, {}).filter((b) => b.t === "tab");
  assert.deepEqual(tab.testa.map(T.testoPezzi), ["Department", "Ship Module", "Effect"]);
  assert.deepEqual(tab.righe.map((r) => r.map(T.testoPezzi)), [
    ["Orbital / Cannons", "Zero-G Breech Loading", "Cooldown −10%."],
    ["Orbital / Cannons", "High-Density Explosives", "Radius +10%."],
    ["Bridge", "Targeting Software Upgrade", "Call-in −1 s."],
  ]);
});
