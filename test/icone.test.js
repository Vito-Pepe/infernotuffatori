const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Una wiki finta: pagine dei file con la licenza e miniature PNG
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const ARROWHEAD = "==Licensing==\n{{License/Arrowhead}}";
const AUTORE = "{{FileAuthor|user=YourOnlyNavigator}}\n==Licensing==\n{{License/CC-BY-NC-SA}}";
const FILE = {
  "A-1 Armor Set Image.png": ARROWHEAD,
  "A-1 Armor Render.png": AUTORE,
  "A-1 Helmet Render.png": AUTORE,
  "C Cape Render.png": AUTORE,
  "X Render.png": AUTORE,
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

const catalogo = () => ({
  oggetti: [
    { id: "x", nome: "X", icona: { tipo: "wiki", file: "X Render.png" } },
    { id: "y", nome: "Y", icona: { tipo: "wiki", file: "Y Render.png" } },
  ],
  nemici: [],
  armature: [{ id: "a-1", nome: "A-1", icona: { tipo: "wiki", candidati: [{ file: "A-1 Armor Set Image.png", vista: "set" }, { file: "A-1 Armor Render.png" }], larghezza: 160 } }],
  elmi: [{ id: "a-1", nome: "A-1", icona: { tipo: "wiki", candidati: [{ file: "A-1 Helmet Icon.png" }, { file: "A-1 Helmet Render.png" }, { file: "A-1 Armor Set Image.png", vista: "set" }], larghezza: 160 } }],
  mantelli: [{ id: "c", nome: "C", icona: { tipo: "wiki", candidati: [{ file: "C Cape Icon.png" }, { file: "C Cape Render.png" }], larghezza: 160 } }],
});

test("immagini: prima quelle permesse, set condiviso fra elmo e armatura, licenze ricontrollate", async () => {
  const wiki = await wikiFinta();
  process.env.WIKI_URL = wiki.url;
  process.env.WIKI_PAUSA_MS = "0";
  const { prepara, togliNonUsate, nomeLocale } = require("../server/wiki/icone");
  const cartella = fs.mkdtempSync(path.join(os.tmpdir(), "icone-"));
  try {
    // Un'icona scaricata in passato, prima che si controllasse la condizione dell'autore
    fs.writeFileSync(path.join(cartella, "x.png"), PNG);
    const c = catalogo();
    const avvisi = await prepara(c, { cartella });
    const set = nomeLocale("A-1 Armor Set Image.png", 160);
    assert.equal(c.armature[0].icona, set, "il set ufficiale invece del disegno dell'utente");
    assert.equal(c.armature[0].vista, "set");
    assert.equal(c.elmi[0].icona, set, "l'elmo usa lo stesso file");
    assert.equal(c.elmi[0].vista, "set");
    assert.deepEqual(wiki.scaricate.sort(), ["A-1 Armor Set Image.png", "Y Render.png"], "il set si scarica una volta sola");
    assert.equal(c.mantelli[0].icona, null);
    assert.equal(c.mantelli[0].immagineVietata, true);
    assert.equal(c.oggetti[0].icona, null, "anche se il file c'era già");
    assert.equal(c.oggetti[1].icona, "y.png");
    assert.ok(avvisi.some((a) => /^mantelli: 1 senza immagine \(l'autore chiede di usarla solo sulla wiki\): C$/.test(a)), avvisi.join("\n"));
    assert.ok(avvisi.some((a) => /^oggetti: 1 senza immagine/.test(a)));

    // Dopo un aggiornamento riuscito si tolgono i file che il catalogo non usa più
    assert.equal(togliNonUsate(cartella, c), 1);
    assert.ok(!fs.existsSync(path.join(cartella, "x.png")));
    assert.ok(fs.existsSync(path.join(cartella, set)));

    // Il giorno dopo non si riscarica niente
    const d = catalogo();
    await prepara(d, { cartella });
    assert.equal(wiki.scaricate.length, 2);
    assert.equal(d.elmi[0].icona, set);
  } finally {
    wiki.server.close();
    fs.rmSync(cartella, { recursive: true, force: true });
  }
});

// Dopo il test con la wiki finta: sorgenti.js legge l'indirizzo della wiki quando si carica
test("licenze: condizioni degli autori e nomi dei file", () => {
  const { motivoVieta, licenzaVieta, nomeLocale } = require("../server/wiki/icone");
  assert.equal(motivoVieta(AUTORE), "l'autore chiede di usarla solo sulla wiki");
  assert.equal(motivoVieta("{{ FileAuthor }}"), "l'autore chiede di usarla solo sulla wiki");
  assert.equal(motivoVieta(ARROWHEAD), null);
  assert.equal(licenzaVieta("Use of these icons is permitted exclusively for free and publicly accessible content."), true);
  const nome = nomeLocale("Dissident's Nightmare Cape Icon.png", 160);
  assert.match(nome, /^dissident-s-nightmare-cape-icon-[0-9a-f]{6}\.png$/);
  assert.match(nomeLocale(`${"Molto lungo ".repeat(12)}.png`, 160), /^[a-z0-9-]{1,80}\.png$/, "valido per il server");
  assert.notEqual(nomeLocale("A.png", 160), nomeLocale("A.png", 256), "larghezze diverse, file diversi");
});
