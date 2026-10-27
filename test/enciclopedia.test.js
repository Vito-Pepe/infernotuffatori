const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../server/wiki/testi");
const { costruisciArmature, fattoriArmatura, costo } = require("../server/wiki/armature");
const { slug } = require("../server/wiki/catalogo");
const { confronta } = require("../server/wiki/differenze");

const collega = (t) => ({ "eat-17 expendable anti-tank": { v: "oggetto", id: "eat-17-expendable-anti-tank" }, charger: { v: "nemico", id: "charger" } })[t.toLowerCase()] || null;
const testo = (s) => s.map((p) => (typeof p === "string" ? p : `[${p.t}→${p.v}/${p.id}]`)).join("");

test("testi: elenchi, collegamenti, template e titoli in italiano", () => {
  const pagina = `{{Infobox Enemy|faction=Terminids}}
'''{{PAGENAME}}''' is a [[Terminids|Terminid]].<ref>fonte</ref>

== Behavior ==
The {{PAGENAME}} charges at [[Helldiver|Helldivers]]. Armor reduced from {{Armor|5|AV}} to {{Armor|4|AV}}.<br>Appears from {{Difficulty|4}}.

== Tactical Information ==
* Shoot it with an [[EAT-17 Expendable Anti-Tank|EAT]].
** Aim at the head, ''not'' the butt.
* Code: {{Stratagem code|down|right|up}} {{Cite web|url=x}}

== Variants ==
<gallery>
Spore Charger Icon.png|[[Spore Charger]]
</gallery>

== Media ==
Niente da mostrare.`;
  const s = T.sezioni(pagina, { titolo: "Charger", collega, v: "nemico", id: "charger" });
  assert.deepEqual(s.map((x) => x.titolo), ["Comportamento", "Consigli tattici", "Varianti"], "sezioni tradotte, Media scartata");
  const comportamento = s[0].blocchi.map((b) => testo(b.s));
  assert.equal(comportamento[0], "The Charger charges at Helldivers. Armor reduced from AV 5 to AV 4.");
  assert.equal(comportamento[1], "Appears from Difficulty 4 (Challenging).");
  const consigli = s[1].blocchi;
  assert.deepEqual(consigli.map((b) => [b.t, b.l]), [["li", 1], ["li", 2], ["li", 1]]);
  assert.equal(testo(consigli[0].s), "Shoot it with an [EAT→oggetto/eat-17-expendable-anti-tank].");
  assert.equal(testo(consigli[1].s), "Aim at the head, not the butt.");
  assert.equal(testo(consigli[2].s), "Code: ↓ → ↑");
  assert.equal(testo(s[2].blocchi[0].s), "Spore Charger", "la galleria diventa un elenco");
});

test("testi: tabelle, modifiche nelle patch e attacchi", () => {
  const b = T.blocchi(`{| class="wikitable"
! scope="col" | Armor Value !! Weapons
|-
| {{Armor|2|AV}} || [[AR-23 Liberator|Liberator]]{{*}}Punisher
|-
| {{Armor|4|AV}}
| [[Charger]]
|}`, { collega });
  assert.equal(b.length, 1);
  assert.equal(b[0].t, "tab");
  assert.deepEqual(b[0].testa.map(testo), ["Armor Value", "Weapons"]);
  assert.deepEqual(b[0].righe.map((r) => r.map(testo)), [["AV 2", "Liberator · Punisher"], ["AV 4", "[Charger→nemico/charger]"]]);

  const m = T.modifiche(`{{Change History Head}}
{{Change History Update|1.001.100|changes=
Changes
* Armor reduced from {{Armor|5|AV}} to {{Armor|4|AV}}.
Fix
* No more flying corpses.
}}`, {});
  assert.equal(m.length, 1);
  assert.equal(m[0].versione, "1.001.100");
  assert.deepEqual(m[0].blocchi.map((x) => [x.t, testo(x.s)]), [["h", "Modifiche"], ["li", "Armor reduced from AV 5 to AV 4."], ["h", "Correzioni"], ["li", "No more flying corpses."]]);

  const a = T.attacchi(`{{Enemy Loadout Box
| title = Heavy Ram
| description = Tramples foes.
| damage = 90 Melee Damage
| damage durable = 135 Durable Damage
| ap = 7/0/0/0
| demo = 20 (Impact) <br> 40 (Concuss)
}}`, {});
  assert.deepEqual(a, [{ nome: "Heavy Ram", descrizione: "Tramples foes.", danno: "90 Melee Damage", durevole: "135 Durable Damage", ap: "7/0/0/0", demolizione: "20 (Impact) / 40 (Concuss)" }]);

  assert.equal(T.nomeGrado(2), "Light");
  assert.equal(T.nomeGrado(6), "Anti-Tank II");
  assert.equal(T.nomeGrado(6, "AV"), "Tank II");
  assert.equal(T.nomeGrado(11), "Indestructible");
});

test("armature: protezione di base, passiva, costi e danno parato", () => {
  const { armature, elmi, mantelli } = costruisciArmature(
    {
      armature: [
        { title: "B-01 Tactical", type: "Medium", armor: "150", speed: "500", "stam regen": "100", passive: "Extra Padding", source: "Starter Equipment", cost: "", description: "None", displayorder: "1", image: "B-01.png" },
        { title: "DS-42 Federation&#39;s Blade", type: "Light", armor: "64", speed: "536", "stam regen": "118", passive: "Scout", source: "[[Masters of Ceremony Premium Warbond|Masters of Ceremony]] <small>P2</small>", cost: '<span class="Medalicon">[[File:Medal.svg|link=Medal|alt=Medals]]</span> 55', displayorder: "5" },
        { title: "B-01 Tactical", type: "Helmet", source: "Starter Equipment" },
      ],
      mantelli: [{ title: "Against the Tyrant Cloud", type: "Cape", source: "[[Oshaune]]", cost: '<span title="Exclusive">❌</span>', "source type": "Special" }],
    },
    {},
    { slug, citazione: () => "" },
  );
  assert.equal(armature.length, 2);
  const tattica = armature.find((a) => a.id === "b-01-tactical");
  assert.deepEqual([tattica.peso, tattica.protezione, tattica.base, tattica.velocita, tattica.stamina], ["media", 150, 100, 500, 100], "150 = 100 di base + 50 di Extra Padding");
  const lama = armature.find((a) => a.nome === "DS-42 Federation's Blade");
  assert.ok(lama, "entità HTML tolte dal nome");
  assert.deepEqual([lama.peso, lama.protezione, lama.base, lama.fonte], ["leggera", 64, 64, "Masters of Ceremony"]);
  assert.deepEqual(lama.costo, { valuta: "Medaglie", quantita: 55 });
  assert.deepEqual(elmi.map((e) => e.nome), ["B-01 Tactical"]);
  assert.deepEqual(mantelli[0].costo, { esclusiva: true });
  assert.deepEqual(costo('[[File:Super Credit.svg|link=Super Credits|alt=Super Credits]] 150'), { valuta: "Super Crediti", quantita: 150 });

  const f = fattoriArmatura(`{{#vardefine:health|{{{health|125}}} }}
{{#vardefine:head|{{{head|1.5}}} }}{{#vardefine:leg|{{{leg|0.850000024}}} }}
{{#vardefine:armor_50|{{{armor_50|1.25}}} }}{{#vardefine:armor_100|{{{armor_100|1.0}}} }}
{{#vardefine:armor_150|{{{armor_150|0.75}}} }}{{#vardefine:armor_200|{{{armor_200|0.65}}} }}
{{#vardefine:armor_head_50|{{{armor_head_50|{{#var: armor_100}} }}} }}
{{#vardefine:armor_head_150|{{{armor_head_150|{{#var: armor_150}} }}} }}`);
  assert.equal(f.letti, true);
  assert.equal(f.salute, 125);
  assert.equal(f.parti.testa, 1.5);
  assert.equal(f.parti.gambe, 0.85);
  assert.deepEqual(f.fattori, { 50: 1.25, 100: 1, 150: 0.75, 200: 0.65 });
  assert.deepEqual(f.testa, { 50: 1, 150: 0.75 }, "sotto 100 la testa non ha protezione in più");
});

test("novità: armature nuove e cambiate, ma niente se prima non c'erano", () => {
  const prima = { oggetti: [], nemici: [], strutture: [], armature: [{ id: "b-01", nome: "B-01", peso: "media", protezione: 100, velocita: 500, stamina: 100, passiva: "Extra Padding" }] };
  const dopo = { ...prima, armature: [{ ...prima.armature[0], protezione: 150 }, { id: "x-1", nome: "X-1", peso: "pesante", protezione: 200 }] };
  const d = confronta(prima, dopo);
  assert.deepEqual(d.armature.find((x) => x.id === "b-01").modifiche, [{ campo: "Protezione", prima: 100, dopo: 150 }]);
  assert.equal(d.armature.find((x) => x.id === "x-1").modifiche[0].dopo, "nuova");
  assert.equal(confronta({ ...prima, armature: undefined }, dopo).armature.length, 0, "dalla versione senza armature non sono tutte nuove");
});
