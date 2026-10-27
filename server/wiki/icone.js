// Icone del catalogo: le immagini di armi, nemici e armature dalla wiki (miniature PNG,
// CC BY-NC-SA 4.0) e le icone degli stratagemmi dalla raccolta di nvigneux su GitHub ("Feel
// free to use them in your own projects"). Si scaricano solo quelle che mancano.
// Passive e potenziamenti non hanno immagini scaricate: l'app disegna emblemi suoi.
const fs = require("node:fs");
const path = require("node:path");
const { scarica } = require("./rete");
const { infoFile, urlIconaStratagemma } = require("./sorgenti");

const LARGHEZZA = 256;
const MAX_ICONA = 2 * 1024 * 1024;

// Alcune immagini della wiki sono concesse solo per contenuti pubblici e liberi: la nostra
// app è privata (solo tailnet), quindi quelle non si usano
function licenzaVieta(descrizione) {
  return /publicly accessible|access-restricted|exclusively for free/i.test(descrizione || "");
}

// Toglie da un SVG tutto ciò che potrebbe eseguire codice o caricare altro
function pulisciSvg(testo) {
  const t = String(testo);
  if (!/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(t)) return null;
  return t
    .replace(/<\?xml[^>]*>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*("(?!#|data:image\/)[^"]*"|'(?!#|data:image\/)[^']*')/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

// Nome del file locale dell'icona di un oggetto, nemico o armatura
function nomeFile(o) {
  if (o.icona?.tipo === "stratagemma") return `${o.id}.svg`;
  if (o.icona?.tipo === "wiki") return o.icona.nome || `${o.id}.png`;
  return null;
}

// Scarica le icone mancanti in `cartella` (quelle già presenti in `altre` si saltano).
// Imposta o.icona = nome del file, oppure null se non c'è. Restituisce gli avvisi.
async function prepara(catalogo, { cartella, altre = [], avanzamento = () => {} }) {
  fs.mkdirSync(cartella, { recursive: true });
  const avvisi = [];
  const presente = (f) => [cartella, ...altre].some((c) => fs.existsSync(path.join(c, f)));

  const tutti = [...catalogo.oggetti, ...(catalogo.nemici || []), ...(catalogo.armature || [])];
  const daWiki = tutti.filter((o) => o.icona?.tipo === "wiki" && !presente(nomeFile(o)));
  if (daWiki.length) avanzamento(`${daWiki.length} immagini dalla wiki`);
  // Miniature di larghezze diverse (le armature sono più piccole): una richiesta per larghezza
  const info = {};
  for (const larghezza of new Set(daWiki.map((o) => o.icona.larghezza || LARGHEZZA))) {
    const gruppo = daWiki.filter((o) => (o.icona.larghezza || LARGHEZZA) === larghezza);
    info[larghezza] = await infoFile(gruppo.map((o) => o.icona.file), larghezza);
  }
  for (const o of daWiki) {
    const i = info[o.icona.larghezza || LARGHEZZA][o.icona.file];
    try {
      if (!i) throw new Error("immagine non trovata sulla wiki");
      if (licenzaVieta(i.descrizione)) throw new Error("licenza solo per contenuti pubblici");
      const dati = await scarica(i.miniatura, { tipo: "byte", massimo: MAX_ICONA });
      if (!dati.subarray(0, 4).equals(PNG)) throw new Error("non è un PNG");
      fs.writeFileSync(path.join(cartella, nomeFile(o)), dati);
    } catch (e) {
      avvisi.push(`${o.nome}: icona non scaricata (${e.message})`);
    }
  }

  const daRaccolta = catalogo.oggetti.filter((o) => o.icona?.tipo === "stratagemma" && !presente(nomeFile(o)));
  if (daRaccolta.length) avanzamento(`${daRaccolta.length} icone di stratagemmi`);
  for (const o of daRaccolta) {
    try {
      const testo = await scarica(urlIconaStratagemma(o.icona.percorso), { tipo: "testo", massimo: MAX_ICONA });
      const svg = pulisciSvg(testo);
      if (!svg) throw new Error("non è un SVG");
      fs.writeFileSync(path.join(cartella, nomeFile(o)), svg);
    } catch (e) {
      avvisi.push(`${o.nome}: icona non scaricata (${e.message})`);
    }
  }

  for (const o of tutti) {
    const f = nomeFile(o);
    o.icona = f && presente(f) ? f : null;
  }
  return avvisi;
}

module.exports = { prepara, pulisciSvg, licenzaVieta, nomeFile };
