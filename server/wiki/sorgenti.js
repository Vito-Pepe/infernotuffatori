// Scarica dalla wiki (helldivers.wiki.gg, CC BY-NC-SA 4.0) tutto quello che serve al
// catalogo: pagine di armi, stratagemmi, passive, potenziamenti e nemici, i dati estratti
// dal gioco (moduli JSON della wiki) e l'elenco delle icone degli stratagemmi.
const { scarica } = require("./rete");

const WIKI = process.env.WIKI_URL || "https://helldivers.wiki.gg";
const ICONE_REPO = process.env.ICONE_REPO || "nvigneux/Helldivers-2-Stratagems-icons-svg";
const GITHUB_RAW = process.env.GITHUB_RAW || "https://raw.githubusercontent.com";

// Categorie della wiki → a cosa servono
const CATEGORIE = {
  primarie: "Primary Weapons",
  secondarie: "Secondary Weapons",
  granate: "Throwables",
  stratagemmi: "Stratagems",
  stratagemmiMissione: "Mission Stratagems",
  passive: "Armor Passives",
  potenziamenti: "Boosters",
  terminidi: "Terminids",
  automi: "Automatons",
  illuminati: "Illuminate",
};

// Moduli della wiki con i dati estratti dal gioco (danni, perforazione, esplosioni, ...)
const MODULI = {
  armi: "Module:Decodedata-Attacks/weapons data.json",
  stratagemmi: "Module:Decodedata-Attacks/stratagems data.json",
  armiStratagemmi: "Module:Decodedata-Attacks/stratagemdata.json",
  stati: "Module:Decodedata-Attacks/status data.json",
  // Versioni precedenti dei dati: servono per i pochi oggetti che mancano in quelle nuove
  // (postazioni, torre Tesla, Hellbomb, alcune armi da mischia)
  vecchi: "Module:Decodedata-Attacks-2/data.json",
  nuoviOggetti: "Module:Decodedata-Attacks/new gear.json",
};

function api(parametri) {
  const q = new URLSearchParams({ format: "json", formatversion: "2", ...parametri });
  return scarica(`${WIKI}/api.php?${q}`);
}

async function membri(categoria) {
  const titoli = [];
  let seguito = {};
  for (let giro = 0; giro < 20; giro++) {
    const r = await api({ action: "query", list: "categorymembers", cmtitle: `Category:${categoria}`, cmlimit: "500", cmtype: "page", ...seguito });
    for (const p of r.query?.categorymembers || []) titoli.push(p.title);
    if (!r.continue) break;
    seguito = r.continue;
  }
  return titoli;
}

// Testo, categorie e immagine principale delle pagine, 50 alla volta
async function pagine(titoli) {
  const out = {};
  for (let i = 0; i < titoli.length; i += 50) {
    const r = await api({
      action: "query",
      prop: "revisions|categories|pageimages",
      rvprop: "content",
      rvslots: "main",
      cllimit: "max",
      piprop: "name",
      redirects: "1",
      titles: titoli.slice(i, i + 50).join("|"),
    });
    for (const p of r.query?.pages || []) {
      if (p.missing || !p.revisions) continue;
      out[p.title] = {
        titolo: p.title,
        testo: p.revisions[0]?.slots?.main?.content || "",
        categorie: (p.categories || []).map((c) => c.title.replace(/^Category:/, "")),
        immagine: p.pageimage || null,
      };
    }
  }
  return out;
}

// Indirizzo dell'immagine, una miniatura larga `larghezza` e il testo della pagina del file
// (per controllare la licenza), 50 alla volta
async function infoFile(nomi, larghezza = 256) {
  const out = {};
  const elenco = [...new Set(nomi.filter(Boolean))];
  for (let i = 0; i < elenco.length; i += 50) {
    const gruppo = elenco.slice(i, i + 50);
    const r = await api({
      action: "query",
      prop: "imageinfo|revisions",
      iiprop: "url|size|mime|sha1",
      iiurlwidth: String(larghezza),
      rvprop: "content",
      rvslots: "main",
      redirects: "1",
      titles: gruppo.map((n) => `File:${n}`).join("|"),
    });
    // La wiki riscrive i titoli (trattini bassi, maiuscole, reindirizzamenti)
    const finale = (t) => {
      for (const passo of [r.query?.normalized, r.query?.redirects]) {
        const x = (passo || []).find((n) => n.from === t);
        if (x) t = x.to;
      }
      return t;
    };
    const pagine = new Map((r.query?.pages || []).map((p) => [p.title, p]));
    for (const nome of gruppo) {
      const p = pagine.get(finale(`File:${nome}`));
      const info = p?.imageinfo?.[0];
      if (!info) continue;
      out[nome] = {
        url: info.url,
        miniatura: info.thumburl || info.url,
        mime: info.mime,
        sha1: info.sha1,
        descrizione: p.revisions?.[0]?.slots?.main?.content || "",
      };
    }
  }
  return out;
}

function modulo(nome) {
  const q = new URLSearchParams({ title: nome, action: "raw" });
  return scarica(`${WIKI}/index.php?${q}`);
}

// Elenco dei file SVG della raccolta di icone degli stratagemmi, letto dal suo README
// (una sola richiesta, senza le API di GitHub e i loro limiti)
async function iconeStratagemmi() {
  const readme = await scarica(`${GITHUB_RAW}/${ICONE_REPO}/HEAD/README.md`, { tipo: "testo" });
  const percorsi = new Set();
  const radice = ICONE_REPO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const m of readme.matchAll(new RegExp(`raw\\.githubusercontent\\.com/${radice}/[^/"]+/([^"'\\s)]+?\\.svg)`, "gi"))) {
    try {
      percorsi.add(decodeURIComponent(m[1]));
    } catch {
      // indirizzo scritto male nel README: si salta
    }
  }
  return [...percorsi].sort().map((percorso) => ({ percorso }));
}

function urlIconaStratagemma(percorso) {
  return `${GITHUB_RAW}/${ICONE_REPO}/HEAD/${percorso.split("/").map(encodeURIComponent).join("/")}`;
}

// Tutto il materiale grezzo per costruire il catalogo
async function scaricaTutto({ avanzamento = () => {} } = {}) {
  const categorie = {};
  for (const [chiave, nome] of Object.entries(CATEGORIE)) {
    avanzamento(`categoria ${nome}`);
    categorie[chiave] = await membri(nome);
  }
  // "Demolition" ha la tabella della forza che serve per distruggere ogni struttura
  const titoli = [...new Set([...Object.values(categorie).flat(), "Demolition"])].filter((t) => !/^(Template|User|Community|Helldivers 1|Helldivers Wiki):/.test(t));
  avanzamento(`${titoli.length} pagine`);
  const testi = await pagine(titoli);
  const moduli = {};
  for (const [chiave, nome] of Object.entries(MODULI)) {
    avanzamento(`dati ${nome}`);
    moduli[chiave] = await modulo(nome);
  }
  avanzamento("icone degli stratagemmi");
  const icone = await iconeStratagemmi();
  return { scaricato: new Date().toISOString(), categorie, pagine: testi, moduli, iconeStratagemmi: icone };
}

module.exports = { scaricaTutto, infoFile, urlIconaStratagemma, CATEGORIE, MODULI, WIKI, ICONE_REPO };
