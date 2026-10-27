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
const { prepara } = require("./icone");
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

  usa(catalogo) {
    this.catalogo = catalogo;
    this.testo = JSON.stringify(catalogo);
    this.etag = `"${crypto.createHash("sha1").update(this.testo).digest("hex").slice(0, 16)}"`;
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
      Object.assign(stato, { ultimoSuccesso: new Date().toISOString(), esito: "ok", errore: null, avvisi: nuovo.avvisi || [], cambiamenti: diff.vuoto ? 0 : diff.aggiunti.length + diff.rimossi.length + diff.cambiati.length });
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
