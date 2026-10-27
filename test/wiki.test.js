const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("../server/wiki/wikitesto");
const { costruisci, controlla, slug, normalizza } = require("../server/wiki/catalogo");
const { confronta } = require("../server/wiki/differenze");
const { pulisciSvg, licenzaVieta } = require("../server/wiki/icone");

test("template annidati, parametri e pulizia dei valori", () => {
  const testo = `{{Last Updated|1.004.000}}
{{Weapon
| title = {{PAGENAME}}
| damage = {{Damage|Ballistic|75}}
| penetration = {{armor|3|ap}}
| capacity = 45
| reload_time = 3s
| fire_rate = 600 rpm
| dps = 1,170
| weapon_traits = Incendiary {{*}} Medium Armor Penetrating
| source = [[Dust Devils Premium Warbond|Dust Devils]] <small>{{Tooltip|P1|Page 1}}</small>
}}`;
  const t = W.trova(testo, ["Infobox Weapon", "Weapon"]);
  assert.equal(t.nome, "weapon");
  assert.equal(W.numero(t.nominati.penetration), 3);
  assert.equal(W.numero(t.nominati.reload_time), 3);
  assert.equal(W.numero(t.nominati.dps), 1170);
  assert.deepEqual(W.elenco(t.nominati.weapon_traits), ["Incendiary", "Medium Armor Penetrating"]);
  assert.deepEqual(W.danni(t.nominati.damage), [{ tipo: "ballistic", valore: 75, testo: "75" }]);
  assert.equal(W.pulisci(t.nominati.source), "Dust Devils P1");
  assert.deepEqual(W.codice("{{Stratagem code|right|right|down|left}}"), ["right", "right", "down", "left"]);
  assert.equal(W.numero("Unlimited"), null);
});

test("nomi: slug e confronto tra grafie", () => {
  assert.equal(slug("SG-225SP Breaker Spray&Pray"), "sg-225sp-breaker-spray-and-pray");
  assert.equal(slug("AX/AR-23 Guard Dog"), "ax-ar-23-guard-dog");
  assert.equal(normalizza("AR-61 TENDERISER"), normalizza("AR-61 Tenderizer"));
  assert.equal(normalizza("SMG-72 PUMMELLER"), normalizza("SMG-72 Pummeler"));
  assert.equal(normalizza("CQC-2 SABRE"), normalizza("CQC-2 Saber"));
});

// Materiale grezzo minimo, come lo restituisce sorgenti.scaricaTutto
function grezzo() {
  const pagina = (titolo, testo, categorie = []) => ({ titolo, testo, categorie, immagine: null });
  return {
    scaricato: "2026-10-27T10:00:00.000Z",
    categorie: {
      primarie: ["AR-23 Liberator"],
      secondarie: [],
      granate: ["G-12 High Explosive"],
      stratagemmi: ["Orbital Precision Strike", "Eagle Fly By", "Reinforce", "B-1 Supply Pack"],
      stratagemmiMissione: ["Reinforce"],
      passive: ["Fortified"],
      potenziamenti: ["Vitality Enhancement"],
      terminidi: ["Charger", "Bug Hole"],
      automi: [],
      illuminati: [],
    },
    pagine: {
      "AR-23 Liberator": pagina("AR-23 Liberator", `{{Infobox Weapon
|title={{PAGENAME}}
|image={{PAGENAME}} Primary Render.png
|damage={{Damage|Ballistic|60}}
|penetration={{Armor|2|AP}}
|capacity=45
|reload_time=2.2s
|fire_rate=640 rpm
|weapon_type=Assault Rifles
|weapon_traits=Light Armor Penetrating
|source=[[Ironclad Democracy Premium Warbond|Ironclad Democracy]]<small>{{Tooltip|P3|Page 3}}</small>
}}
{{Quote|Democracy's standard issue assault rifle.|Armory}}`),
      "G-12 High Explosive": pagina("G-12 High Explosive", `{{Infobox Throwable
|image=G-12 Render.png
|damage={{Damage|Explosion|800}}
|penetration={{Armor|4|AP}}
|radius=7
|capacity=5
}}`),
      "Orbital Precision Strike": pagina("Orbital Precision Strike", `{{Infobox Stratagem
| image = Orbital Precision Strike Stratagem Icon Background.svg
| permit_type = Offensive
| traits = Explosive {{*}} Orbital
| stratagem_code = {{Stratagem code|right|right|up}}
| stratagem_type = Orbital
| base_cooldown = 80s
}}
{{Stratagem Stats Table
| call_time = 4.45
| uses = Unlimited
| cooldown = 80
}}`),
      "Eagle Fly By": pagina("Eagle Fly By", "{{Infobox Stratagem\n| permit_type = Offensive\n| stratagem_type = Eagle\n}}"),
      Reinforce: pagina("Reinforce", "{{Infobox Stratagem\n| stratagem_type = Ship\n}}", ["Mission Stratagems"]),
      "B-1 Supply Pack": pagina("B-1 Supply Pack", "{{Infobox Stratagem\n| permit_type = Supply\n| stratagem_type = Backpack\n| traits = Hellpod {{*}} Backpack\n}}"),
      Fortified: pagina("Fortified", "{{Infobox Armor Passive\n|description=Provides '''50%''' resistance to explosive damage.\n|order=3\n}}"),
      "Vitality Enhancement": pagina("Vitality Enhancement", "{{Infobox Booster\n| description= Provides minor damage reduction.\n}}"),
      Charger: pagina("Charger", `{{Infobox Enemy
| faction = Terminids
| size = 2
| health = 2,400
| fire_mult = 1.5
}}
{{Anatomy Table|
  {{Anatomy Row | part_name = Main | health = 2,400 | av = 4 | durability = 100% | percent_to_main = - | fatal = Yes | exdr = 25% }}
  {{Anatomy Row | part_name = Head | health = 1,200 | av = 4 | durability = 75% | percent_to_main = 70% | fatal = Yes | exdr = 25% }}
  {{Anatomy Row | part_name = Claws (2) | health = 500 | av = 4 | durability = 70% | percent_to_main = 70% | fatal = No | exdr = 100% }}
}}`),
      Demolition: pagina("Demolition", `=== Demolition Force vs. Structures ===
{| class="wikitable sortable"
! Faction !! Structure !! BaDR !! Demo Force
|-
! rowspan="2" | {{Terminids|text}}
| [[Bug Hole]] (Inner) || Yes || 20
|-
| [[Bug Hole]] (Outer) || No || 40
|}`),
    },
    moduli: {
      armi: {
        wep_version: "1.007.201",
        damage: { "AR-23_P_dm": { dmg: 60, dmg2: 6, ap1: 2, ap2: 2, ap3: 2, ap4: 0, demo: 10, stun: 10, push: 10, statuses: [] }, "G-12_E_dm": { dmg: 800, dmg2: 800, ap1: 4, demo: 30, stun: 30, push: 40 } },
        projectile: { "AR-23_P": { damage_id: "AR-23_P_dm", pellets: 1, velocity: 900, caliber: 5.5, mass: 4.5, drag: 0.3 } },
        explosion: { "G-12 HIGH EXPLOSIVE_E": { damage_id: "G-12_E_dm", r1: 2.5, r2: 7, r3: 9, noise: "small_explosion_frag" } },
        beam: {},
        arc: {},
        spray: {},
        weapons: {
          "AR-23 LIBERATOR": { cap: 45, mags: 7, rpm: 640, noise: "weapon_medium", attacks: [{ type: "projectile", name: "AR-23_P", parent: "AR-23 LIBERATOR", level: 1 }] },
          "G-12 HIGH EXPLOSIVE": { start: 4, max: 5, attacks: [{ type: "explosion", name: "G-12 HIGH EXPLOSIVE_E", parent: "G-12 HIGH EXPLOSIVE", level: 1 }] },
        },
      },
      stratagemmi: {
        strat_version: "01.007.201",
        damage: { P_dm: { dmg: 4000, dmg2: 4000, ap1: 8, demo: 50 }, P_IE_dm: { dmg: 1500, dmg2: 1500, ap1: 6, demo: 50 } },
        projectile: { P: { damage_id: "P_dm", pellets: 1 } },
        explosion: { P_IE: { damage_id: "P_IE_dm", r1: 4, r2: 12, r3: 18 } },
        beam: {},
        arc: {},
        spray: {},
        weapons: {},
        stratagems: {
          "ORBITAL PRECISION STRIKE": { name: "ORBITAL PRECISION STRIKE", cooldown: 80, uses: 4294967295, num_bombs: 1, num_salvos: 1, area_size: 1, attacks: [{ type: "projectile", name: "P", parent: "ORBITAL PRECISION STRIKE", level: 1 }, { type: "explosion", name: "P_IE", parent: "P", level: 2 }] },
          "SUPPLY PACK": { name: "SUPPLY PACK", cooldown: 480, uses: 4294967295, attacks: [] },
        },
      },
      stati: { damage: {}, status: {} },
    },
    iconeStratagemmi: [{ percorso: "Bridge/Orbital Precision Strike.svg" }, { percorso: "Engineering Bay/Supply Pack.svg" }],
  };
}

test("catalogo dal materiale della wiki", () => {
  const c = costruisci(grezzo());
  const per = (id) => c.oggetti.find((o) => o.id === id);
  assert.equal(c.versioneGioco, "1.007.201");

  const lib = per("ar-23-liberator");
  assert.equal(lib.slot, "primaria");
  assert.equal(lib.scheda.perforazione, 2);
  assert.equal(lib.scheda.ricarica, 2.2);
  assert.equal(lib.descrizione, "Democracy's standard issue assault rifle.");
  assert.equal(lib.fonte, "Ironclad Democracy");
  assert.deepEqual(lib.icona, { tipo: "wiki", file: "AR-23 Liberator Primary Render.png" }, "{{PAGENAME}} sostituito");
  assert.deepEqual(lib.combattimento.colpi[0].danno, 60);
  assert.equal(lib.combattimento.colpi[0].attacco, "AR-23_P");

  const ops = per("orbital-precision-strike");
  assert.equal(ops.tipo, "orbitale");
  assert.equal(ops.scheda.chiamata, 4.45);
  assert.equal(ops.scheda.attesa, 80);
  assert.equal(ops.scheda.usi, undefined, "usi illimitati: nessun numero");
  assert.deepEqual(ops.codice, ["right", "right", "up"]);
  assert.deepEqual(ops.combattimento.colpi.map((x) => x.tipo), ["proiettile", "esplosione"]);
  assert.equal(ops.icona.percorso, "Bridge/Orbital Precision Strike.svg");

  assert.ok(!per("eagle-fly-by"), "stratagemma di un evento escluso");
  assert.ok(!per("reinforce"), "stratagemma di missione escluso");
  assert.equal(per("b-1-supply-pack").tipo, "zaino");
  assert.equal(per("fortified").emblema, "esplosione");
  assert.equal(per("vitality-enhancement").emblema, "cuore");

  const charger = c.nemici.find((n) => n.id === "charger");
  assert.equal(charger.classe, "pesante");
  assert.equal(charger.salute, 2400);
  assert.deepEqual(charger.parti.map((p) => p.nome), ["Main", "Head"], "solo parti fatali");
  assert.equal(charger.parti[1].durevole, 0.75);
  assert.deepEqual(c.strutture, [
    { fazione: "terminidi", nome: "Bug Hole (Inner)", balistica: true, forza: 20 },
    { fazione: "terminidi", nome: "Bug Hole (Outer)", balistica: false, forza: 40 },
  ]);
});

test("controlli: un catalogo a metà non sostituisce quello buono", () => {
  const piccolo = costruisci(grezzo());
  assert.ok(controlla(piccolo, null).length > 0);
});

test("novità: aggiunti, tolti e valori cambiati", () => {
  const prima = costruisci(grezzo());
  const g = grezzo();
  g.moduli.armi.damage["AR-23_P_dm"].dmg = 70;
  g.pagine["AR-23 Liberator"].testo = g.pagine["AR-23 Liberator"].testo.replace("capacity=45", "capacity=40");
  delete g.pagine["G-12 High Explosive"];
  const dopo = costruisci(g);
  const d = confronta(prima, dopo);
  assert.deepEqual(d.rimossi.map((x) => x.id), ["g-12-high-explosive"]);
  const lib = d.cambiati.find((x) => x.id === "ar-23-liberator");
  assert.deepEqual(lib.modifiche.find((m) => m.campo === "Caricatore"), { campo: "Caricatore", prima: 45, dopo: 40 });
  assert.deepEqual(lib.modifiche.find((m) => m.campo === "Proiettile: danno"), { campo: "Proiettile: danno", prima: 60, dopo: 70 });
  assert.equal(confronta(prima, prima).vuoto, true);
});

test("novità: corazza dei nemici e strutture", () => {
  const prima = costruisci(grezzo());
  const dopo = structuredClone(prima);
  const charger = dopo.nemici.find((n) => n.id === "charger");
  const parte = charger.parti.find((p) => !p.main);
  parte.av += 1;
  parte.durevole = 0.5;
  dopo.nemici = dopo.nemici.filter((n) => n.id === "charger");
  dopo.strutture[0].forza += 10;
  dopo.strutture.push({ fazione: "automi", nome: "Nuova torre", balistica: false, forza: 40 });
  const d = confronta(prima, dopo);
  const c = d.nemici.find((x) => x.id === "charger");
  assert.deepEqual(c.modifiche.find((m) => m.campo === `${parte.nome}: corazza`), { campo: `${parte.nome}: corazza`, prima: parte.av - 1, dopo: parte.av });
  assert.ok(c.modifiche.some((m) => m.campo === `${parte.nome}: durevolezza (%)` && m.dopo === 50));
  // I nemici spariti dalla wiki compaiono come tolti
  assert.equal(d.nemici.filter((x) => x.modifiche[0].campo === "Nemico" && x.modifiche[0].dopo === null).length, prima.nemici.length - 1);
  const s0 = prima.strutture[0];
  assert.deepEqual(d.strutture.find((x) => x.nome === s0.nome).modifiche, [{ campo: "Forza di demolizione", prima: s0.forza, dopo: s0.forza + 10 }]);
  assert.equal(d.strutture.find((x) => x.nome === "Nuova torre").modifiche[0].dopo, "nuova");
  assert.equal(d.vuoto, false);
  assert.equal(d.totale, d.nemici.length + d.strutture.length);
});

test("icone: SVG ripuliti e licenze rispettate", () => {
  const sporco = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><a href="https://x.y">x</a><path d="M0 0" fill="#fff"/></svg>';
  const pulito = pulisciSvg(sporco);
  assert.ok(!/script|onload|https:\/\/x\.y/.test(pulito));
  assert.ok(/<path d="M0 0"/.test(pulito));
  assert.equal(pulisciSvg("<html><script>1</script></html>"), null);
  assert.equal(licenzaVieta("Use of these icons is permitted exclusively for free and publicly accessible content."), true);
  assert.equal(licenzaVieta("{{License/CC-BY-NC-SA}}"), false);
});
