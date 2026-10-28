const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Una wiki finta: pagine dei file con la licenza e miniature PNG
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const ARROWHEAD = "==Licensing==\n{{License/Arrowhead}}";
// Ci ha dato il permesso, a patto di citarlo
const CON_PERMESSO = "{{FileAuthor|user=YourOnlyNavigator}}\n==Licensing==\n{{License/CC-BY-NC-SA}}";
// Chiede di usarle solo sulla wiki e non ci ha dato il permesso
const SENZA_PERMESSO = "{{FileAuthor|user=Antonio-chips}}\n==Licensing==\n{{License/Fairuse}}";
const FILE = {
  "A-1 Armor Render.png": CON_PERMESSO,
  "A-1 Armor Set Image.png": ARROWHEAD,
  "B-2 Armor Render.png": SENZA_PERMESSO,
  "B-2 Armor Set Image.png": ARROWHEAD,
  "B-2 Helmet Render.png": SENZA_PERMESSO,
  "C Cape Render.png": SENZA_PERMESSO,
  "X Render.png": SENZA_PERMESSO,
  "Y Render.png": ARROWHEAD,
};

async function wikiFinta() {
  const scaricate = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api.php") {
      const pages = url.searchParams
        .get("titles")
        .split("|")
        .map((t) => {
          const nome = t.replace(/^File:/, "");
          if (!(nome in FILE)) return { title: t, missing: true };
          return { title: t, imageinfo: [{ url: `/img/${encodeURIComponent(nome)}`, thumburl: `http://${req.headers.host}/img/${encodeURIComponent(nome)}`, mime: "image/png", sha1: "x" }], revisions: [{ slots: { main: { content: FILE[nome] } } }] };
        });
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ query: { pages } }));
    }
    if (url.pathname.startsWith("/img/")) {
      scaricate.push(decodeURIComponent(url.pathname.slice(5)));
      res.writeHead(200, { "Content-Type": "image/png" });
      return res.end(PNG);
    }
    res.writeHead(404).end();
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return { server, scaricate, url: `http://127.0.0.1:${server.address().port}` };
}

const candidati = (...file) => ({ tipo: "wiki", candidati: file.map((f) => (typeof f === "string" ? { file: f } : f)), larghezza: 160 });
const catalogo = () => ({
  oggetti: [
    { id: "x", nome: "X", icona: { tipo: "wiki", file: "X Render.png" } },
    { id: "y", nome: "Y", icona: { tipo: "wiki", file: "Y Render.png" } },
  ],
  nemici: [],
  armature: [
    { id: "a-1", nome: "A-1", icona: candidati("A-1 Armor Render.png", { file: "A-1 Armor Set Image.png", vista: "set" }) },
    { id: "b-2", nome: "B-2", icona: candidati("B-2 Armor Render.png", { file: "B-2 Armor Set Image.png", vista: "set" }) },
  ],
  elmi: [{ id: "b-2", nome: "B-2", icona: candidati("B-2 Helmet Render.png", "B-2 Helmet Icon.png", { file: "B-2 Armor Set Image.png", vista: "set" }) }],
  mantelli: [{ id: "c", nome: "C", icona: candidati("C Cape Render.png", "C Cape Icon.png") }],
});

test("immagini: disegni di chi ci ha dato il permesso, citati; per gli altri le ufficiali", async () => {
  const wiki = await wikiFinta();
  process.env.WIKI_URL = wiki.url;
  process.env.WIKI_PAUSA_MS = "0";
  process.env.WIKI_RIPROVA_MS = "0";
  const { prepara, togliNonUsate, nomeLocale, autoriCitati } = require("../server/wiki/icone");
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), "icone-"));
  try {
    // Un'icona scaricata in passato, prima che si controllasse la condizione dell'autore
    fs.writeFileSync(path.join(cartella, "x.png"), PNG);
    const c = catalogo();
    const avvisi = await prepara(c, { cartella });
    const disegno = nomeLocale("A-1 Armor Render.png", 160);
    const set = nomeLocale("B-2 Armor Set Image.png", 160);
    assert.equal(c.armature[0].icona, disegno, "il disegno di chi ci ha dato il permesso");
    assert.equal(c.armature[0].autoreImmagine, "YourOnlyNavigator", "da citare");
    assert.equal(c.armature[0].vista, undefined);
    assert.equal(c.armature[1].icona, set, "senza permesso: il set ufficiale");
    assert.equal(c.armature[1].vista, "set");
    assert.equal(c.armature[1].autoreImmagine, undefined);
    assert.equal(c.elmi[0].icona, set, "l'elmo usa lo stesso file del set");
    assert.equal(c.elmi[0].vista, "set");
    assert.deepEqual(wiki.scaricate.sort(), ["A-1 Armor Render.png", "B-2 Armor Set Image.png", "Y Render.png"], "il set si scarica una volta sola");
    assert.equal(c.mantelli[0].icona, null);
    assert.equal(c.mantelli[0].immagineVietata, true);
    assert.equal(c.oggetti[0].icona, null, "anche se il file c'era già");
    assert.equal(c.oggetti[1].icona, "y.png");
    assert.deepEqual(autoriCitati(c), ["YourOnlyNavigator"]);
    assert.ok(avvisi.some((a) => /^mantelli: 1 senza immagine \(l'autore chiede di usarla solo sulla wiki\): C$/.test(a)), avvisi.join("\n"));
    assert.ok(avvisi.some((a) => /^oggetti: 1 senza immagine/.test(a)));

    // Dopo un aggiornamento riuscito si tolgono i file che il catalogo non usa più
    assert.equal(togliNonUsate(cartella, c), 1);
    assert.ok(!fs.existsSync(path.join(cartella, "x.png")));
    assert.ok(fs.existsSync(path.join(cartella, set)));

    // Il giorno dopo non si riscarica niente
    const d = catalogo();
    await prepara(d, { cartella });
    assert.equal(wiki.scaricate.length, 3);
    assert.equal(d.elmi[0].icona, set);

    // Se la wiki non risponde restano le immagini già scaricate, con gli autori di prima
    await new Promise((ok) => wiki.server.close(ok));
    const e = catalogo();
    const avvisiSenzaRete = await prepara(e, { cartella, precedente: d });
    assert.equal(e.armature[0].icona, disegno);
    assert.equal(e.armature[0].autoreImmagine, "YourOnlyNavigator");
    assert.ok(avvisiSenzaRete.some((a) => /non controllate/.test(a)));
  } finally {
    wiki.server.close();
    fs.rmSync(cartella, { recursive: true, force: true });
  }
});

// Dopo il test con la wiki finta: sorgenti.js legge l'indirizzo della wiki quando si carica
test("licenze: condizioni degli autori, permessi e nomi dei file", () => {
  const { motivoVieta, licenzaVieta, autoreDi, nomeLocale } = require("../server/wiki/icone");
  assert.equal(motivoVieta(SENZA_PERMESSO), "l'autore chiede di usarla solo sulla wiki");
  assert.equal(motivoVieta("{{ FileAuthor }}"), "l'autore chiede di usarla solo sulla wiki");
  assert.equal(motivoVieta(CON_PERMESSO), null, "YourOnlyNavigator ci ha dato il permesso");
  assert.equal(motivoVieta("{{FileAuthor|user=youronlynavigator}}"), null, "maiuscole indifferenti");
  assert.equal(autoreDi(CON_PERMESSO), "YourOnlyNavigator");
  assert.equal(autoreDi(ARROWHEAD), null);
  assert.equal(motivoVieta(ARROWHEAD), null);
  assert.equal(licenzaVieta("Use of these icons is permitted exclusively for free and publicly accessible content."), true);
  const nome = nomeLocale("Dissident's Nightmare Cape Icon.png", 160);
  assert.match(nome, /^dissident-s-nightmare-cape-icon-[0-9a-f]{6}\.png$/);
  assert.match(nomeLocale(`${"Molto lungo ".repeat(12)}.png`, 160), /^[a-z0-9-]{1,80}\.png$/, "valido per il server");
  assert.notEqual(nomeLocale("A.png", 160), nomeLocale("A.png", 256), "larghezze diverse, file diversi");
});
