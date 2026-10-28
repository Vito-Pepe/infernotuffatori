// Da dove vengono gli ordini (solo lettura, nessun accesso con un account):
// - l'API del gioco di Arrowhead, la stessa che usa il gioco e che usano i siti della
//   community: guerra in corso, Major Order, stato dei pianeti, dispacci (testi in italiano);
// - nomi di pianeti e oggetti dalla raccolta della community su GitHub (helldivers-2/json).
// Il Personal Order non c'è: il gioco lo dà solo a chi è collegato con il suo account.
const { AGENTE } = require("../wiki/rete");

const API = process.env.GUERRA_API_URL || "https://api.live.prod.thehelldiversgame.com";
const RACCOLTA = process.env.GUERRA_JSON_URL || "https://raw.githubusercontent.com/helldivers-2/json/master";
const RIPROVA_MS = Number(process.env.ORDINI_RIPROVA_MS ?? 3000);
const TIMEOUT_MS = 20000;
const MASSIMO = 8 * 1024 * 1024;

const aspetta = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function chiedi(url, { lingua = "it-IT", intestazioni = {}, tentativi = 2 } = {}) {
  let errore;
  for (let i = 0; i < tentativi; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": AGENTE, Accept: "application/json", "Accept-Language": lingua, ...intestazioni },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!r.ok) throw Object.assign(new Error(`${new URL(url).host} ha risposto ${r.status}`), { stato: r.status });
      const testo = await r.text();
      if (testo.length > MASSIMO) throw new Error(`risposta troppo grande da ${new URL(url).host}`);
      return JSON.parse(testo);
    } catch (e) {
      errore = e.name === "TimeoutError" ? new Error(`${new URL(url).host} non risponde`) : e;
      if (e.stato && e.stato < 500 && e.stato !== 429) break;
      if (i + 1 < tentativi) await aspetta(RIPROVA_MS * (i + 1));
    }
  }
  throw errore;
}

// Cose che cambiano di rado: guerra in corso, pianeti (salute massima), nomi
async function statiche() {
  const guerra = await chiedi(`${API}/api/WarSeason/current/WarID`);
  const id = Number(guerra?.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("l'API del gioco non dice qual è la guerra in corso");
  const [info, pianeti, oggetti] = await Promise.all([
    chiedi(`${API}/api/WarSeason/${id}/WarInfo`),
    chiedi(`${RACCOLTA}/planets/planets.json`).catch(() => null),
    chiedi(`${RACCOLTA}/items/item_names.json`).catch(() => null),
  ]);
  return { guerra: id, info, pianeti, oggetti };
}

// Cose che cambiano di continuo. Ognuna può mancare senza fermare le altre.
async function correnti(guerra) {
  const [maggiori, stato, dispacci] = await Promise.allSettled([
    chiedi(`${API}/api/v2/Assignment/War/${guerra}`),
    chiedi(`${API}/api/WarSeason/${guerra}/Status`),
    chiedi(`${API}/api/NewsFeed/${guerra}?maxEntries=1024`),
  ]);
  return { maggiori, stato, dispacci };
}

module.exports = { statiche, correnti, chiedi, API, RACCOLTA };
