// Server di Infernotuffatori: pagine dell'app, catalogo degli oggetti (dalla wiki, aggiornato
// ogni giorno) e build condivise tra tutti quelli che entrano dalla tailnet.
// Nessuna dipendenza esterna.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { Archivio, FAZIONI, idValido } = require("./archivio");
const { identita } = require("./identita");
const { valida } = require("./build");
const { Aggiornatore } = require("./wiki/aggiornatore");

const PORTA = Number(process.env.PORT) || 3000;
const CARTELLA_DATI = process.env.DATA_DIR || "/data";
const CARTELLA_APP = path.resolve(process.env.APP_DIR || path.join(__dirname, "..", "app"));
const MAX_CORPO = 64 * 1024;
// Un aggiornamento a mano dalla wiki al massimo ogni 10 minuti
const PAUSA_AGGIORNAMENTO = 10 * 60 * 1000;

const TIPI = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const INTESTAZIONI = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
// Le icone SVG vengono da fuori: se aperte da sole non possono eseguire niente
const INTESTAZIONI_SVG = { ...INTESTAZIONI, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" };

fs.mkdirSync(CARTELLA_DATI, { recursive: true });
const archivio = new Archivio(CARTELLA_DATI);
const catalogo = new Aggiornatore({ cartellaDati: CARTELLA_DATI, cartellaApp: CARTELLA_APP });
if (process.env.AGGIORNA_WIKI !== "0") catalogo.pianifica();

function rispondi(res, stato, corpo, extra = {}) {
  const testo = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  res.writeHead(stato, { ...INTESTAZIONI, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
  res.end(testo);
}

function errore(res, stato, messaggio) {
  rispondi(res, stato, { errore: messaggio });
}

function leggiCorpo(req, limite) {
  return new Promise((ok, ko) => {
    let dimensione = 0;
    const pezzi = [];
    const leggi = (p) => {
      dimensione += p.length;
      if (dimensione > limite) {
        req.off("data", leggi);
        req.resume();
        ko(Object.assign(new Error("Dati troppo grandi"), { stato: 413 }));
        return;
      }
      pezzi.push(p);
    };
    req.on("data", leggi);
    req.on("end", () => {
      try {
        ok(JSON.parse(Buffer.concat(pezzi).toString("utf8") || "null"));
      } catch {
        ko(Object.assign(new Error("JSON non valido"), { stato: 400 }));
      }
    });
    req.on("error", ko);
  });
}

// Catalogo compresso una volta per versione
let catalogoGzip = { etag: null, dati: null };
function inviaCatalogo(req, res) {
  const etag = catalogo.etag;
  const intestazioni = { ...INTESTAZIONI, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", ETag: etag, Vary: "Accept-Encoding" };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, intestazioni);
    return res.end();
  }
  if (/\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
    if (catalogoGzip.etag !== etag) catalogoGzip = { etag, dati: zlib.gzipSync(catalogo.testo) };
    res.writeHead(200, { ...intestazioni, "Content-Encoding": "gzip", "Content-Length": catalogoGzip.dati.length });
    return res.end(catalogoGzip.dati);
  }
  res.writeHead(200, intestazioni);
  res.end(catalogo.testo);
}

function puoModificare(chi, b) {
  return Boolean(chi && (chi.amministratore || b.autore?.login === chi.login));
}

async function api(req, res, url) {
  const parti = url.pathname.split("/").filter(Boolean).slice(1);
  const metodo = req.method;
  const chi = identita(req);

  // Le scritture arrivano solo dalla pagina stessa (JSON, niente richieste da altri siti)
  // e solo da chi Tailscale riconosce
  if (metodo !== "GET" && metodo !== "HEAD") {
    if (!String(req.headers["content-type"] || "").startsWith("application/json")) return errore(res, 415, "Serve Content-Type: application/json");
    if (req.headers["sec-fetch-site"] === "cross-site") return errore(res, 403, "Richiesta da un altro sito");
    if (!chi) return errore(res, 401, "Non so chi sei: apri l'app dal suo indirizzo Tailscale");
  }

  if (metodo === "GET" && parti[0] === "salute") return rispondi(res, 200, { ok: true });
  if (metodo === "GET" && parti[0] === "io") return rispondi(res, 200, chi || { login: null });
  if (metodo === "GET" && parti[0] === "catalogo") return inviaCatalogo(req, res);
  if (metodo === "GET" && parti[0] === "novita") return rispondi(res, 200, catalogo.novita());

  if (parti[0] === "aggiornamento" && parti.length === 1) {
    if (metodo === "GET") return rispondi(res, 200, catalogo.stato());
    if (metodo === "POST") {
      const s = catalogo.stato();
      const ultimo = Date.parse(s.ultimoTentativo || 0) || 0;
      if (!s.inCorso && Date.now() - ultimo < PAUSA_AGGIORNAMENTO) return errore(res, 429, "Aggiornamento appena fatto: riprova tra qualche minuto");
      catalogo.aggiorna(`a mano da ${chi.nome}`);
      return rispondi(res, 202, catalogo.stato());
    }
  }

  if (parti[0] === "build") {
    if (parti.length === 1 && metodo === "GET") return rispondi(res, 200, archivio.elenco());
    if (parti.length === 1 && metodo === "POST") {
      const b = valida(await leggiCorpo(req, MAX_CORPO), catalogo.catalogo);
      return rispondi(res, 201, await archivio.crea(b, { login: chi.login, nome: chi.nome }));
    }
    if (parti.length === 2) {
      if (!idValido(parti[1])) return errore(res, 400, "Identificativo non valido");
      const prima = archivio.prendi(parti[1]);
      if (!prima) return errore(res, 404, "Build non trovata");
      if (metodo === "GET") return rispondi(res, 200, prima);
      if (!puoModificare(chi, prima)) return errore(res, 403, `Questa build è di ${prima.autore?.nome || "un altro"}: puoi farne una copia`);
      if (metodo === "PUT") {
        const b = valida(await leggiCorpo(req, MAX_CORPO), catalogo.catalogo, prima);
        return rispondi(res, 200, await archivio.aggiorna(prima.id, b, { login: chi.login, nome: chi.nome }));
      }
      if (metodo === "DELETE") return rispondi(res, 200, { ok: true, esisteva: await archivio.elimina(prima.id) });
    }
  }

  if (parti[0] === "ordine" && parti.length === 1 && metodo === "PUT") {
    const corpo = await leggiCorpo(req, MAX_CORPO);
    if (!FAZIONI.includes(corpo?.fazione) || !Array.isArray(corpo.ids) || !corpo.ids.every(idValido)) return errore(res, 400, "Ordine non valido");
    return rispondi(res, 200, { ordine: await archivio.riordina(corpo.fazione, corpo.ids) });
  }

  return errore(res, 404, "Non trovato");
}

// --- File dell'app e icone ---

function inviaFile(req, res, file, intestazioniBase, cache) {
  fs.stat(file, (err, info) => {
    if (err || !info.isFile()) {
      res.writeHead(404, { ...INTESTAZIONI, "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Non trovato");
    }
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const intestazioni = { ...intestazioniBase, "Content-Type": TIPI[path.extname(file)] || "application/octet-stream", "Cache-Control": cache, ETag: etag };
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, intestazioni);
      return res.end();
    }
    res.writeHead(200, { ...intestazioni, "Content-Length": info.size });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function icona(req, res, nome) {
  if (!/^[a-z0-9-]{1,80}\.(png|svg)$/.test(nome)) return errore(res, 404, "Icona non trovata");
  // Prima quelle scaricate dall'aggiornamento (volume), poi quelle dell'immagine
  const cartelle = [catalogo.cartellaIcone, catalogo.iconeApp];
  const file = cartelle.map((c) => path.join(c, nome)).find((f) => fs.existsSync(f));
  if (!file) return errore(res, 404, "Icona non trovata");
  inviaFile(req, res, file, nome.endsWith(".svg") ? INTESTAZIONI_SVG : INTESTAZIONI, "public, max-age=86400");
}

function statico(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return errore(res, 405, "Metodo non permesso");
  let percorso;
  try {
    percorso = decodeURIComponent(url.pathname);
  } catch {
    return errore(res, 400, "Indirizzo non valido");
  }
  if (percorso.startsWith("/icone/")) return icona(req, res, percorso.slice("/icone/".length));
  if (percorso === "/" || !path.extname(percorso)) percorso = "/index.html";
  const file = path.resolve(CARTELLA_APP, `.${percorso}`);
  if (!file.startsWith(CARTELLA_APP + path.sep) || file.startsWith(path.join(CARTELLA_APP, "icone") + path.sep)) return errore(res, 404, "Non trovato");
  // Sempre la versione più recente dopo un aggiornamento dal Pi (il browser chiede se è cambiata)
  inviaFile(req, res, file, INTESTAZIONI, "no-cache");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    api(req, res, url).catch((e) => {
      if (e.stato === 413) res.setHeader("Connection", "close");
      if (!res.headersSent) errore(res, e.stato || 500, e.stato ? e.message : "Errore del server");
      if (!e.stato) console.error(e);
    });
  } else {
    statico(req, res, url);
  }
});

server.listen(PORTA, () => console.log(`Infernotuffatori in ascolto sulla porta ${PORTA}, dati in ${CARTELLA_DATI}`));

// Allo spegnimento del container finisce le scritture in corso
function chiudi() {
  catalogo.ferma();
  server.close();
  archivio.coda.finally(() => process.exit(0));
}
process.on("SIGTERM", chiudi);
process.on("SIGINT", chiudi);

module.exports = { server };
