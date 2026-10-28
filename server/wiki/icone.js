// Icone del catalogo: le immagini di armi, nemici, armature, elmi e mantelli dalla wiki
// (miniature PNG) e le icone degli stratagemmi dalla raccolta di nvigneux su GitHub ("Feel
// free to use them in your own projects"). Si scaricano solo quelle che mancano, ma la
// licenza si controlla ogni volta anche per quelle già scaricate.
// Passive e potenziamenti non hanno immagini scaricate: l'app disegna emblemi suoi.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { scarica } = require("./rete");
const { infoFile, urlIconaStratagemma } = require("./sorgenti");

const LARGHEZZA = 256;
const MAX_ICONA = 2 * 1024 * 1024;

// Utenti della wiki che ci hanno dato il permesso di usare le loro immagini (vedi sotto)
const AUTORI_CON_PERMESSO = [];

// Alcune immagini della wiki hanno condizioni in più della licenza, e quelle non si usano:
// - concesse solo per contenuti pubblici e liberi (la nostra app è privata, solo tailnet);
// - con il modello {{FileAuthor}} l'autore chiede di usarle solo sulla wiki e di chiedergli
//   il permesso prima di usarle altrove (per esempio i disegni di armature, elmi e mantelli).
function motivoVieta(descrizione) {
  const d = String(descrizione || "");
  if (/publicly accessible|access-restricted|exclusively for free/i.test(d)) return "licenza solo per contenuti pubblici";
  const autore = d.match(/\{\{\s*FileAuthor\s*(?:\|\s*(?:user\s*=\s*)?([^|}]*))?/i);
  if (autore && !AUTORI_CON_PERMESSO.some((a) => a.toLowerCase() === String(autore[1] || "").trim().toLowerCase())) return "l'autore chiede di usarla solo sulla wiki";
  return null;
}

function licenzaVieta(descrizione) {
  return motivoVieta(descrizione) != null;
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

// Nome del file locale di un'immagine scelta fra più file della wiki (armature, elmi,
// mantelli): legato al file d'origine, così lo stesso file serve a più voci (l'elmo e
// l'armatura dello stesso set) e se cambia l'immagine scelta cambia anche il nome
function nomeLocale(file, larghezza) {
  const base = String(file)
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  const impronta = crypto.createHash("sha1").update(`${file}|${larghezza}`).digest("hex").slice(0, 6);
  return `${base || "immagine"}-${impronta}.png`;
}

// Immagini possibili di una voce, in ordine di preferenza: un file fisso (armi, nemici, con
// il nome locale di sempre) o più file (`candidati`), ognuno con la sua "vista" (per esempio
// "set": il set completo indossato, foto in verticale)
function candidatiDi(o) {
  const larghezza = o.icona.larghezza || LARGHEZZA;
  if (!o.icona.candidati) return [{ file: o.icona.file, locale: o.icona.nome || `${o.id}.png`, vista: null }];
  return o.icona.candidati.map((c) => ({ file: c.file, locale: nomeLocale(c.file, larghezza), vista: c.vista || null }));
}

const GRUPPI = [
  ["oggetti", "oggetti"],
  ["nemici", "nemici"],
  ["armature", "armature"],
  ["elmi", "elmi"],
  ["mantelli", "mantelli"],
];

// Scarica le icone mancanti in `cartella` (quelle già presenti in `altre` si saltano).
// Imposta o.icona = nome del file (e o.vista se serve), oppure null se non c'è.
// Restituisce gli avvisi.
async function prepara(catalogo, { cartella, altre = [], avanzamento = () => {} }) {
  fs.mkdirSync(cartella, { recursive: true });
  const avvisi = [];
  const presente = (f) => [cartella, ...altre].some((c) => fs.existsSync(path.join(c, f)));

  const tutti = GRUPPI.flatMap(([k]) => catalogo[k] || []);
  const daWiki = tutti.filter((o) => o.icona?.tipo === "wiki");
  const candidati = new Map(daWiki.map((o) => [o, candidatiDi(o)]));
  // Informazioni e licenza di tutti i file possibili: miniature di larghezze diverse (le
  // armature sono più piccole), 50 file per richiesta. Se la wiki non risponde restano le
  // immagini già scaricate.
  const info = {};
  let letto = true;
  try {
    for (const larghezza of new Set(daWiki.map((o) => o.icona.larghezza || LARGHEZZA))) {
      const file = daWiki.filter((o) => (o.icona.larghezza || LARGHEZZA) === larghezza).flatMap((o) => candidati.get(o).map((c) => c.file));
      info[larghezza] = await infoFile(file, larghezza);
    }
  } catch (e) {
    letto = false;
    avvisi.push(`immagini della wiki non controllate (${e.message}): restano quelle già scaricate`);
  }
  // Da scaricare: le voci la cui prima immagine permessa non c'è ancora
  const permessa = (o) => candidati.get(o).find((c) => info[o.icona.larghezza || LARGHEZZA]?.[c.file] && !motivoVieta(info[o.icona.larghezza || LARGHEZZA][c.file].descrizione));
  const daScaricare = letto ? daWiki.filter((o) => permessa(o) && !presente(permessa(o).locale)).length : 0;
  if (daScaricare) avanzamento(`${daScaricare} immagini dalla wiki`);
  // Voci rimaste senza immagine perché le uniche sulla wiki hanno condizioni (per gruppo)
  const vietate = new Map();
  for (const o of daWiki) {
    const larghezza = o.icona.larghezza || LARGHEZZA;
    let scelta = null;
    let motivo = null;
    for (const c of candidati.get(o)) {
      if (!letto) {
        if (presente(c.locale)) scelta = c;
        if (scelta) break;
        continue;
      }
      const i = info[larghezza][c.file];
      if (!i) continue;
      motivo = motivoVieta(i.descrizione) || motivo;
      if (motivoVieta(i.descrizione)) continue;
      if (!presente(c.locale)) {
        try {
          const dati = await scarica(i.miniatura, { tipo: "byte", massimo: MAX_ICONA });
          if (!dati.subarray(0, 4).equals(PNG)) throw new Error("non è un PNG");
          fs.writeFileSync(path.join(cartella, c.locale), dati);
        } catch (e) {
          avvisi.push(`${o.nome}: icona non scaricata (${e.message})`);
          continue;
        }
      }
      scelta = c;
      break;
    }
    if (!scelta && motivo) {
      const gruppo = GRUPPI.find(([k]) => (catalogo[k] || []).includes(o))?.[1] || "altro";
      const chiave = `${gruppo}|${motivo}`;
      vietate.set(chiave, [...(vietate.get(chiave) || []), o.nome]);
    } else if (!scelta && letto && !o.icona.candidati) avvisi.push(`${o.nome}: icona non scaricata (immagine non trovata sulla wiki)`);
    o.icona = scelta ? scelta.locale : null;
    if (scelta?.vista) o.vista = scelta.vista;
    else delete o.vista;
    // Per spiegarlo nell'app: c'era solo un'immagine che l'autore non vuole fuori dalla wiki
    if (!scelta && motivo) o.immagineVietata = true;
    else delete o.immagineVietata;
  }
  for (const [chiave, nomi] of vietate) {
    const [gruppo, motivo] = chiave.split("|");
    avvisi.push(`${gruppo}: ${nomi.length} senza immagine (${motivo}): ${nomi.slice(0, 8).join(", ")}${nomi.length > 8 ? "…" : ""}`);
  }

  const stratagemmi = catalogo.oggetti.filter((o) => o.icona?.tipo === "stratagemma");
  const daRaccolta = stratagemmi.filter((o) => !presente(`${o.id}.svg`));
  if (daRaccolta.length) avanzamento(`${daRaccolta.length} icone di stratagemmi`);
  for (const o of daRaccolta) {
    try {
      const testo = await scarica(urlIconaStratagemma(o.icona.percorso), { tipo: "testo", massimo: MAX_ICONA });
      const svg = pulisciSvg(testo);
      if (!svg) throw new Error("non è un SVG");
      fs.writeFileSync(path.join(cartella, `${o.id}.svg`), svg);
    } catch (e) {
      avvisi.push(`${o.nome}: icona non scaricata (${e.message})`);
    }
  }
  for (const o of stratagemmi) o.icona = presente(`${o.id}.svg`) ? `${o.id}.svg` : null;
  // Tutto il resto (tipi sconosciuti) resta senza icona
  for (const o of tutti) if (o.icona && typeof o.icona !== "string") o.icona = null;
  return avvisi;
}

// File d'icona usati da un catalogo
function iconeUsate(catalogo) {
  return new Set(
    GRUPPI.flatMap(([k]) => catalogo?.[k] || [])
      .map((o) => o.icona)
      .filter((f) => typeof f === "string"),
  );
}

// Dopo un aggiornamento riuscito: toglie dalla cartella delle icone scaricate quelle che il
// catalogo in uso non usa più (oggetti tolti dalla wiki, immagini cambiate o non più
// permesse). Restituisce quante ne ha tolte.
function togliNonUsate(cartella, catalogo) {
  const usate = iconeUsate(catalogo);
  let tolte = 0;
  let file = [];
  try {
    file = fs.readdirSync(cartella);
  } catch {
    return 0;
  }
  for (const f of file) {
    if (!/\.(png|svg)$/.test(f) || usate.has(f)) continue;
    try {
      fs.rmSync(path.join(cartella, f));
      tolte++;
    } catch {
      // un file che non si riesce a togliere resta lì: non è in uso
    }
  }
  return tolte;
}

module.exports = { prepara, pulisciSvg, licenzaVieta, motivoVieta, nomeLocale, iconeUsate, togliNonUsate };
