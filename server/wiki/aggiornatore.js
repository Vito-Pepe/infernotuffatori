// Aggiornamento automatico del catalogo dalla wiki: una volta al giorno (e a richiesta)
// scarica i dati, ricostruisce il catalogo, lo controlla e, se va bene, lo mette al posto di
// quello in uso. Le novità (oggetti aggiunti, tolti, cambiati) restano in novita.json.
// Se qualcosa va storto si tiene il catalogo di prima: l'app funziona anche senza rete,
// con il catalogo che c'è nell'immagine.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { scaricaTutto } = require("./sorgenti");
const { costruisci, controlla, VERSIONE } = require("./catalogo");
const { prepara, togliNonUsate } = require("./icone");
const { confronta } = require("./differenze");

const ORE = 3600 * 1000;
const OGNI = 24 * ORE;
const MAX_NOVITA = 60;

function scriviAtomico(file, testo) {
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, testo);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function leggiJson(file, riserva) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return riserva;
  }
}

// Parti del catalogo che vengono da tabelle o pagine a sé: se un giorno mancano (la wiki non
// risponde o cambia formato) si tengono quelle di prima invece di perdere la sezione
function riporta(nuovo, vecchio) {
  const avvisi = [];
  if (!vecchio) return avvisi;
  if (!nuovo.armature?.length && vecchio.armature?.length) {
    Object.assign(nuovo, { armature: vecchio.armature, elmi: vecchio.elmi || [], mantelli: vecchio.mantelli || [] });
    nuovo.wiki = { ...nuovo.wiki, armature: vecchio.wiki?.armature || {} };
    avvisi.push("armature non lette dalla wiki: restano quelle di prima");
  }
  if (!nuovo.demolizioni?.length && vecchio.demolizioni?.length) {
    nuovo.demolizioni = vecchio.demolizioni;
    avvisi.push("fonti della demolizione non lette dalla wiki: restano quelle di prima");
  }
  if (!nuovo.meccaniche?.armatura?.letti && vecchio.meccaniche?.armatura?.letti) {
    nuovo.meccaniche = { ...nuovo.meccaniche, armatura: vecchio.meccaniche.armatura };
    avvisi.push("numeri dell'armatura non letti dalla wiki: restano quelli di prima");
  }
  if (!Object.keys(nuovo.wiki?.pagine || {}).length && Object.keys(vecchio.wiki?.pagine || {}).length) {
    nuovo.wiki = { ...nuovo.wiki, pagine: vecchio.wiki.pagine };
    nuovo.meccaniche = { ...nuovo.meccaniche, pagine: vecchio.meccaniche?.pagine || [] };
    avvisi.push("pagine delle meccaniche non lette dalla wiki: restano quelle di prima");
  }
  return avvisi;
}

// Scarica, costruisce e prepara le icone: usato dal server e dallo strumento che crea il
// catalogo di riserva dentro l'immagine
async function generaCatalogo({ cartellaIcone, altreIcone = [], grezzo, avanzamento = () => {} }) {
  const materiale = grezzo || (await scaricaTutto({ avanzamento }));
  const catalogo = costruisci(materiale);
  const avvisiIcone = await prepara(catalogo, { cartella: cartellaIcone, altre: altreIcone, avanzamento });
  catalogo.avvisi = [...catalogo.avvisi, ...avvisiIcone];
  return catalogo;
}

class Aggiornatore {
  constructor({ cartellaDati, cartellaApp, log = console.log }) {
    this.cartella = path.join(cartellaDati, "catalogo");
    this.cartellaIcone = path.join(this.cartella, "icone");
    this.iconeApp = path.join(cartellaApp, "icone");
    this.fileRiserva = path.join(cartellaApp, "dati", "catalogo.json");
    this.file = path.join(this.cartella, "catalogo.json");
    this.fileStato = path.join(this.cartella, "stato.json");
    this.fileNovita = path.join(this.cartella, "novita.json");
    this.log = log;
    this.inCorso = null;
    this.timer = null;
    fs.mkdirSync(this.cartellaIcone, { recursive: true });
    this.carica();
  }

  // Catalogo in uso: quello aggiornato nel volume, se c'è ed è valido, altrimenti quello
  // dell'immagine
  carica() {
    const riserva = leggiJson(this.fileRiserva, null);
    const aggiornato = leggiJson(this.file, null);
    const valido = (c) => c && c.versione === VERSIONE && Array.isArray(c.oggetti) && c.oggetti.length > 50;
    let scelto = valido(riserva) ? riserva : { versione: VERSIONE, oggetti: [], nemici: [], avvisi: [] };
    // Il catalogo del volume vale solo se è più recente di quello dell'immagine (dopo un
    // aggiornamento dell'app quello dell'immagine può essere più nuovo)
    if (valido(aggiornato) && (!valido(riserva) || aggiornato.generato >= riserva.generato)) scelto = aggiornato;
    this.usa(scelto);
  }

  // I testi della wiki (lunghi) non vanno con il catalogo: il server li manda a pezzi
  usa(catalogo) {
    const { wiki, ...resto } = catalogo;
    this.catalogo = catalogo;
    this.wiki = wiki || { oggetti: {}, nemici: {}, armature: {}, pagine: {} };
    this.testo = JSON.stringify(resto);
    this.etag = `"${crypto.createHash("sha1").update(this.testo).digest("hex").slice(0, 16)}"`;
    this.etagWiki = crypto.createHash("sha1").update(JSON.stringify(this.wiki)).digest("hex").slice(0, 12);
  }

  // Testo della wiki di un nemico, oggetto, armatura o pagina delle meccaniche
  voceWiki(tipo, id) {
    const gruppo = { nemico: "nemici", oggetto: "oggetti", armatura: "armature", pagina: "pagine" }[tipo];
    const voce = gruppo && Object.hasOwn(this.wiki[gruppo] || {}, id) ? this.wiki[gruppo][id] : null;
    return voce ? { voce, etag: `"${this.etagWiki}-${tipo}-${id}"` } : null;
  }

  stato() {
    const s = leggiJson(this.fileStato, {});
    return {
      ...s,
      inCorso: Boolean(this.inCorso),
      generato: this.catalogo.generato || null,
      versioneGioco: this.catalogo.versioneGioco || null,
      oggetti: this.catalogo.oggetti.length,
    };
  }

  novita() {
    return leggiJson(this.fileNovita, []);
  }

  // Un aggiornamento alla volta: chi chiede mentre ne gira uno aspetta lo stesso
  aggiorna(motivo = "pianificato") {
    if (!this.inCorso) {
      this.inCorso = this.esegui(motivo).finally(() => {
        this.inCorso = null;
      });
    }
    return this.inCorso;
  }

  async esegui(motivo) {
    const inizio = new Date().toISOString();
    const stato = { ...leggiJson(this.fileStato, {}), ultimoTentativo: inizio, motivo };
    try {
      this.log(`catalogo: aggiornamento dalla wiki (${motivo})`);
      const nuovo = await generaCatalogo({
        cartellaIcone: this.cartellaIcone,
        altreIcone: [this.iconeApp],
        avanzamento: (m) => this.log(`catalogo: ${m}`),
      });
      const riportati = riporta(nuovo, this.catalogo);
      nuovo.avvisi = [...(nuovo.avvisi || []), ...riportati];
      const problemi = controlla(nuovo, this.catalogo);
      if (problemi.length) throw Object.assign(new Error(`dati della wiki incompleti: ${problemi.join("; ")}`), { problemi });

      const diff = confronta(this.catalogo, nuovo);
      scriviAtomico(this.file, JSON.stringify(nuovo));
      if (!diff.vuoto) {
        const elenco = this.novita();
        elenco.unshift({ data: inizio, versioneGioco: nuovo.versioneGioco || null, ...diff });
        scriviAtomico(this.fileNovita, JSON.stringify(elenco.slice(0, MAX_NOVITA)));
      }
      this.usa(nuovo);
      // Solo dopo che il catalogo nuovo è in uso: le immagini scaricate che non usa più
      const tolte = togliNonUsate(this.cartellaIcone, nuovo);
      if (tolte) this.log(`catalogo: tolte ${tolte} immagini non più usate`);
      Object.assign(stato, { ultimoSuccesso: new Date().toISOString(), esito: "ok", errore: null, avvisi: nuovo.avvisi || [], cambiamenti: diff.totale });
      this.log(`catalogo: fatto, ${nuovo.oggetti.length} oggetti, ${stato.cambiamenti} cambiamenti`);
    } catch (e) {
      Object.assign(stato, { esito: "errore", errore: e.message });
      this.log(`catalogo: aggiornamento non riuscito: ${e.message}`);
    }
    scriviAtomico(this.fileStato, JSON.stringify(stato));
    return { ...this.stato(), inCorso: false };
  }

  // Primo controllo qualche minuto dopo l'avvio se l'ultimo è vecchio, poi ogni 24 ore
  pianifica() {
    const s = leggiJson(this.fileStato, {});
    const ultimo = Date.parse(s.ultimoTentativo || 0) || 0;
    const attesa = Math.max(2 * 60 * 1000, ultimo + OGNI - Date.now());
    this.timer = setTimeout(() => {
      this.aggiorna();
      this.timer = setInterval(() => this.aggiorna(), OGNI);
      this.timer.unref();
    }, attesa);
    this.timer.unref();
  }

  ferma() {
    clearTimeout(this.timer);
    clearInterval(this.timer);
  }
}

module.exports = { Aggiornatore, generaCatalogo };
