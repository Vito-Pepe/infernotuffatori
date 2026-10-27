const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const zlib = require("node:zlib");
const { spawn } = require("node:child_process");

const cartellaDati = fs.mkdtempSync(path.join(os.tmpdir(), "infernotuffatori-test-"));
let porta;
let processo;

function portaLibera() {
  return new Promise((ok) => {
    const s = net.createServer().listen(0, () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });
}

async function avvia() {
  porta = await portaLibera();
  // La wiki finta è una porta chiusa: l'aggiornamento a mano deve fallire e lasciare il catalogo com'è
  processo = spawn(process.execPath, [path.join(__dirname, "..", "server", "server.js")], {
    env: { ...process.env, PORT: String(porta), DATA_DIR: cartellaDati, AGGIORNA_WIKI: "0", AMMINISTRATORI: "capo@esempio.it", WIKI_URL: "http://127.0.0.1:9", WIKI_PAUSA_MS: "0", WIKI_RIPROVA_MS: "0", IDENTITA_PROVA: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((ok) => processo.stdout.on("data", (d) => String(d).includes("in ascolto") && ok()));
}

function ferma() {
  return new Promise((ok) => {
    processo.once("exit", ok);
    processo.kill("SIGTERM");
  });
}

const VITO = { "Tailscale-User-Login": "vito@esempio.it", "Tailscale-User-Name": "Vito" };
const AMICO = { "Tailscale-User-Login": "amico@esempio.it", "Tailscale-User-Name": "=?utf-8?q?Nicol=C3=B2?=" };
const CAPO = { "Tailscale-User-Login": "capo@esempio.it", "Tailscale-User-Name": "Capo" };

async function chiama(metodo, percorso, corpo, intestazioni = {}) {
  const r = await fetch(`http://127.0.0.1:${porta}${percorso}`, {
    method: metodo,
    headers: corpo !== undefined ? { "Content-Type": "application/json", ...intestazioni } : intestazioni,
    body: corpo !== undefined ? (typeof corpo === "string" ? corpo : JSON.stringify(corpo)) : undefined,
  });
  const testo = await r.text();
  let json = null;
  try {
    json = JSON.parse(testo);
  } catch {
    // non JSON
  }
  return { stato: r.status, json, testo, intestazioni: r.headers };
}

const BUILD = {
  nome: "fire",
  fazione: "terminidi",
  primaria: "ar-2-coyote",
  secondaria: "gp-31-grenade-pistol",
  granata: "g-10-incendiary",
  stratagemmi: ["orbital-napalm-barrage", "a-flam-40-flame-sentry", "flam-40-flamethrower", "ax-flam-75-hot-dog"],
  armatura: { passiva: "inflammable", peso: "pesante" },
  potenziamento: "vitality-enhancement",
  note: "Tutto a fuoco",
};

test.before(avvia);
test.after(async () => {
  await ferma();
  fs.rmSync(cartellaDati, { recursive: true, force: true });
});

test("salute, identità da Tailscale e catalogo", async () => {
  assert.deepEqual((await chiama("GET", "/api/salute")).json, { ok: true });
  assert.deepEqual((await chiama("GET", "/api/io")).json, { login: null });
  const io = (await chiama("GET", "/api/io", undefined, AMICO)).json;
  assert.equal(io.nome, "Nicolò", "nome codificato RFC 2047");
  assert.equal(io.amministratore, false);
  assert.equal((await chiama("GET", "/api/io", undefined, CAPO)).json.amministratore, true);

  const r = await fetch(`http://127.0.0.1:${porta}/api/catalogo`, { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(r.status, 200);
  const c = await r.json();
  assert.ok(c.oggetti.length > 200);
  const etag = r.headers.get("etag");
  assert.equal((await chiama("GET", "/api/catalogo", undefined, { "If-None-Match": etag })).stato, 304);
});

test("creare, modificare ed eliminare: solo l'autore (o un amministratore)", async () => {
  assert.equal((await chiama("POST", "/api/build", BUILD)).stato, 401, "senza Tailscale non si scrive");
  const nuova = await chiama("POST", "/api/build", BUILD, VITO);
  assert.equal(nuova.stato, 201);
  const b = nuova.json;
  assert.match(b.id, /^b-[0-9a-f]{12}$/);
  assert.deepEqual(b.autore, { login: "vito@esempio.it", nome: "Vito" });
  assert.equal(b.note, "Tutto a fuoco");

  const elenco = (await chiama("GET", "/api/build")).json;
  assert.equal(elenco.build.length, 1);
  assert.deepEqual(elenco.ordine.terminidi, [b.id]);

  const altro = await chiama("PUT", `/api/build/${b.id}`, { ...BUILD, nome: "mia" }, AMICO);
  assert.equal(altro.stato, 403);
  assert.match(altro.json.errore, /di Vito/);
  const mio = await chiama("PUT", `/api/build/${b.id}`, { ...BUILD, nome: "fire 2", fazione: "automi" }, VITO);
  assert.equal(mio.stato, 200);
  assert.equal(mio.json.nome, "fire 2");
  assert.equal(mio.json.creata, b.creata);
  const dopo = (await chiama("GET", "/api/build")).json.ordine;
  assert.deepEqual([dopo.terminidi, dopo.automi], [[], [b.id]], "cambia fazione, cambia elenco");
  assert.equal((await chiama("PUT", `/api/build/${b.id}`, { ...BUILD, nome: "dal capo" }, CAPO)).stato, 200);

  assert.equal((await chiama("DELETE", `/api/build/${b.id}`, {}, AMICO)).stato, 403);
  assert.deepEqual((await chiama("DELETE", `/api/build/${b.id}`, {}, VITO)).json, { ok: true, esisteva: true });
  assert.equal((await chiama("GET", `/api/build/${b.id}`)).stato, 404);
});

test("build non valide", async () => {
  const prova = (b) => chiama("POST", "/api/build", { ...BUILD, ...b }, VITO);
  assert.equal((await prova({ fazione: "marziani" })).stato, 400);
  assert.match((await prova({ primaria: "g-10-incendiary" })).json.errore, /non va nel posto/);
  assert.match((await prova({ stratagemmi: ["eagle-500kg-bomb", "eagle-500kg-bomb"] })).json.errore, /due volte/);
  assert.match((await prova({ potenziamento: "non-esiste" })).json.errore, /sconosciuto/);
  assert.equal((await prova({ stratagemmi: [1, 2, 3, 4, 5] })).stato, 400);
  assert.equal((await chiama("POST", "/api/build", "{}", { ...VITO, "Content-Type": "text/plain" })).stato, 415);
  assert.equal((await chiama("POST", "/api/build", BUILD, { ...VITO, "Sec-Fetch-Site": "cross-site" })).stato, 403);
  assert.equal((await chiama("POST", "/api/build", { note: "x".repeat(70000) }, VITO)).stato, 413);
  const vuota = await chiama("POST", "/api/build", { fazione: "illuminati" }, VITO);
  assert.equal(vuota.stato, 201);
  assert.equal(vuota.json.nome, "Build senza nome");
  assert.deepEqual(vuota.json.stratagemmi, [null, null, null, null]);
  assert.deepEqual(vuota.json.armatura, { passiva: null, peso: "media" });
});

test("riordinare un elenco", async () => {
  const a = (await chiama("POST", "/api/build", { ...BUILD, nome: "a" }, VITO)).json;
  const b = (await chiama("POST", "/api/build", { ...BUILD, nome: "b" }, AMICO)).json;
  assert.deepEqual((await chiama("GET", "/api/build")).json.ordine.terminidi, [b.id, a.id], "le nuove in cima");
  const r = await chiama("PUT", "/api/ordine", { fazione: "terminidi", ids: [a.id, b.id, "b-000000000000"] }, AMICO);
  assert.deepEqual(r.json.ordine, [a.id, b.id]);
  assert.equal((await chiama("PUT", "/api/ordine", { fazione: "terminidi", ids: ["../x"] }, AMICO)).stato, 400);
});

test("aggiornamento dalla wiki: se fallisce resta il catalogo di prima", async () => {
  const prima = (await chiama("GET", "/api/aggiornamento")).json;
  assert.ok(prima.oggetti > 200);
  assert.equal((await chiama("POST", "/api/aggiornamento", {})).stato, 401);
  assert.equal((await chiama("POST", "/api/aggiornamento", {}, VITO)).stato, 202);
  let stato;
  for (let i = 0; i < 100; i++) {
    stato = (await chiama("GET", "/api/aggiornamento")).json;
    if (!stato.inCorso) break;
    await new Promise((ok) => setTimeout(ok, 100));
  }
  assert.equal(stato.esito, "errore");
  assert.equal(stato.oggetti, prima.oggetti);
  assert.equal((await chiama("POST", "/api/aggiornamento", {}, VITO)).stato, 429, "non più di uno ogni 10 minuti");
  assert.deepEqual((await chiama("GET", "/api/novita")).json, []);
});

test("icone, pagine e intestazioni di sicurezza", async () => {
  const png = await fetch(`http://127.0.0.1:${porta}/icone/ar-2-coyote.png`);
  assert.equal(png.status, 200);
  assert.equal(png.headers.get("content-type"), "image/png");
  const svg = await fetch(`http://127.0.0.1:${porta}/icone/orbital-laser.svg`);
  assert.equal(svg.status, 200);
  assert.match(svg.headers.get("content-security-policy"), /sandbox/);
  assert.equal((await chiama("GET", "/icone/..%2Fdati%2Fcatalogo.json")).stato, 404);
  assert.equal((await chiama("GET", "/icone/nessuna.png")).stato, 404);
  assert.equal((await chiama("GET", "/../server/server.js")).stato, 404);
  assert.equal((await chiama("GET", "/%2e%2e/server/server.js")).stato, 404);
});

test("i dati restano dopo il riavvio, con il backup del giorno", async () => {
  await chiama("POST", "/api/build", { ...BUILD, nome: "resto" }, VITO);
  await ferma();
  await avvia();
  const nomi = (await chiama("GET", "/api/build")).json.build.map((b) => b.nome);
  assert.ok(nomi.includes("resto"));
  assert.ok(fs.readdirSync(path.join(cartellaDati, "backup")).some((f) => /^build-\d{4}-\d{2}-\d{2}\.json$/.test(f)));
});
