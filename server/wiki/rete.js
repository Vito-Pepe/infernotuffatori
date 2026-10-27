// Richieste verso la wiki e verso la raccolta di icone degli stratagemmi.
// Una richiesta alla volta, con una pausa tra l'una e l'altra: la wiki è di volontari
// e un aggiornamento al giorno non ha fretta. Nessuna dipendenza esterna.

const AGENTE = "infernotuffatori/1.0 (app privata e non commerciale; https://github.com/Vito-Pepe/infernotuffatori)";

const PAUSA_MS = Number(process.env.WIKI_PAUSA_MS ?? 800);
// Attesa prima di riprovare dopo un errore (cresce a ogni tentativo)
const RIPROVA_MS = Number(process.env.WIKI_RIPROVA_MS ?? 3000);
const TIMEOUT_MS = 60000;

let ultima = 0;
let coda = Promise.resolve();

const aspetta = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Mette in fila le richieste: mai due insieme, almeno PAUSA_MS tra una e l'altra
function inFila(lavoro) {
  const turno = coda.then(async () => {
    const attesa = ultima + PAUSA_MS - Date.now();
    if (attesa > 0) await aspetta(attesa);
    try {
      return await lavoro();
    } finally {
      ultima = Date.now();
    }
  });
  coda = turno.catch(() => {});
  return turno;
}

// tipo: "json", "testo" o "byte". Riprova sugli errori di rete e sui 429/5xx.
async function scarica(url, { tipo = "json", tentativi = 3, massimo = 20 * 1024 * 1024 } = {}) {
  let errore;
  for (let i = 0; i < tentativi; i++) {
    try {
      return await inFila(async () => {
        const r = await fetch(url, {
          headers: { "User-Agent": AGENTE },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: "follow",
        });
        if (!r.ok) throw Object.assign(new Error(`${new URL(url).host} ha risposto ${r.status}`), { stato: r.status });
        const dati = Buffer.from(await r.arrayBuffer());
        if (dati.length > massimo) throw new Error(`Risposta troppo grande da ${new URL(url).host}`);
        if (tipo === "byte") return dati;
        const testo = dati.toString("utf8");
        return tipo === "json" ? JSON.parse(testo) : testo;
      });
    } catch (e) {
      errore = e;
      const definitivo = e.stato && e.stato < 500 && e.stato !== 429;
      if (definitivo) break;
      await aspetta(RIPROVA_MS * (i + 1));
    }
  }
  throw errore;
}

module.exports = { scarica, AGENTE };
