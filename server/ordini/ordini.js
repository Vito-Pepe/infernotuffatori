// Ordini in corso (Major Order e Personal Order), aggiornati dal server ogni mezz'ora
// (ORDINI_OGNI_MINUTI). Si tengono l'ultimo stato buono di ogni parte, se un giorno una
// fonte non risponde, e lo storico dell'avanzamento: serve a stimare il ritmo e se si
// finisce prima della scadenza. Tutto in ordini/ nel volume dei dati.
const fs = require("node:fs");
const path = require("node:path");
const fontiPredefinite = require("./fonti");
const { leggiOrdini, leggiDispacci, giocatori } = require("./guerra");

const MINUTO = 60 * 1000;
const ORA = 60 * MINUTO;
const OGNI = Number(process.env.ORDINI_OGNI_MINUTI || 30) * MINUTO;
// Guerra in corso, pianeti e nomi: una volta al giorno
const STATICHE_OGNI = 24 * ORA;
// Gli ordini durano fino a un paio di settimane
const STORICO = 16 * 24 * ORA;
// Il ritmo si calcola sulle ultime ore (almeno una cinquantina di minuti di dati)
const FINESTRA = 6 * ORA;
const MINIMO = 50 * MINUTO;

function leggiJson(file, riserva) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return riserva;
  }
}

function scriviAtomico(file, testo) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, testo);
  fs.renameSync(tmp, file);
}

class Ordini {
  constructor({ cartellaDati, log = console.log, fonti = fontiPredefinite, adesso = () => Date.now() }) {
    this.cartella = path.join(cartellaDati, "ordini");
    this.file = path.join(this.cartella, "ordini.json");
    this.fileStorico = path.join(this.cartella, "storico.json");
    this.fonti = fonti;
    this.log = log;
    this.adesso = adesso;
    fs.mkdirSync(this.cartella, { recursive: true });
    this.ultimo = leggiJson(this.file, null);
    this.storico = leggiJson(this.fileStorico, {});
    this.fisse = null;
    this.statoPrima = null;
    this.inCorso = null;
    this.timer = null;
  }

  // Un aggiornamento alla volta: chi chiede mentre ne gira uno aspetta lo stesso
  aggiorna(motivo = "pianificato") {
    if (!this.inCorso) {
      this.inCorso = this.esegui(motivo)
        .catch((e) => this.log(`ordini: aggiornamento non riuscito: ${e.message}`))
        .finally(() => {
          this.inCorso = null;
        });
    }
    return this.inCorso;
  }

  async esegui(motivo) {
    const ora = this.adesso();
    const quando = new Date(ora).toISOString();
    const errori = {};
    try {
      if (!this.fisse || ora - this.fisse.ora > STATICHE_OGNI) this.fisse = { ...(await this.fonti.statiche()), ora };
    } catch (e) {
      errori.guerra = e.message;
    }
    const prima = this.ultimo || {};
    const nuovo = { ...prima, ultimoTentativo: quando, motivo, errori };
    if (!this.fisse) {
      this.salva(nuovo);
      this.log(`ordini: guerra in corso non letta (${errori.guerra})`);
      return this.dati();
    }
    nuovo.guerra = this.fisse.guerra;
    const r = await this.fonti.correnti(this.fisse.guerra);
    if (r.stato.status === "fulfilled" && r.stato.value?.planetStatus) {
      this.statoPrima = r.stato.value;
      nuovo.giocatori = giocatori(r.stato.value);
    } else errori.pianeti = motivoDi(r.stato);
    const ctx = { ora, stato: this.statoPrima, info: this.fisse.info, pianeti: this.fisse.pianeti, oggetti: this.fisse.oggetti };
    if (r.maggiori.status === "fulfilled" && Array.isArray(r.maggiori.value)) {
      nuovo.maggiori = leggiOrdini(r.maggiori.value, "maggiore", ctx);
      nuovo.maggioriAggiornati = quando;
      this.registra(nuovo.maggiori, ora);
    } else errori.maggiori = motivoDi(r.maggiori);
    if (r.personale.status === "fulfilled" && r.personale.value) {
      const v = r.personale.value;
      nuovo.personali = leggiOrdini(Array.isArray(v) ? v : [v], "personale", ctx);
      nuovo.personaliAggiornati = quando;
      this.registra(nuovo.personali, ora);
    } else errori.personale = motivoDi(r.personale);
    if (r.dispacci.status === "fulfilled") nuovo.dispacci = leggiDispacci(r.dispacci.value, ctx);
    else errori.dispacci = motivoDi(r.dispacci);
    if (nuovo.maggioriAggiornati === quando) nuovo.ultimoSuccesso = quando;
    this.salva(nuovo);
    const quanti = (nuovo.maggiori || []).length;
    this.log(`ordini: ${quanti} ${quanti === 1 ? "ordine maggiore" : "ordini maggiori"}${Object.keys(errori).length ? `, problemi: ${Object.entries(errori).map(([k, v]) => `${k} (${v})`).join(", ")}` : ""}`);
    return this.dati();
  }

  salva(nuovo) {
    this.ultimo = nuovo;
    scriviAtomico(this.file, JSON.stringify(nuovo));
    scriviAtomico(this.fileStorico, JSON.stringify(this.storico));
  }

  // Avanzamento di ogni compito, per il ritmo: [fatto, percento] a ogni aggiornamento
  registra(ordini, ora) {
    for (const o of ordini) {
      const chiave = `${o.genere}:${o.id}`;
      const l = (this.storico[chiave] || []).filter((x) => ora - x.t < STORICO);
      l.push({ t: ora, v: o.compiti.map((c) => [c.fatto, c.percento ?? null]) });
      this.storico[chiave] = l.slice(-1000);
    }
    // Ordini finiti da più di due giorni: via
    for (const [k, l] of Object.entries(this.storico)) if (!l.length || ora - l[l.length - 1].t > 2 * 24 * ORA) delete this.storico[k];
  }

  // Ritmo di un compito nelle ultime ore e, al ritmo attuale, quando finisce
  ritmo(o, i, c) {
    const l = this.storico[`${o.genere}:${o.id}`] || [];
    if (l.length < 2) return null;
    const ultimo = l[l.length - 1];
    const primo = l.find((x) => ultimo.t - x.t <= FINESTRA);
    if (!primo || ultimo.t - primo.t < MINIMO) return null;
    const ore = (ultimo.t - primo.t) / ORA;
    // Per i numeri da raggiungere conta il fatto, per i pianeti la percentuale
    const percento = c.manca == null && c.percento != null;
    const a = primo.v[i]?.[percento ? 1 : 0];
    const b = ultimo.v[i]?.[percento ? 1 : 0];
    if (a == null || b == null) return null;
    const out = { perOra: (b - a) / ore, misura: percento ? "percento" : "numero", ore: Math.round(ore * 10) / 10 };
    const resta = percento ? 100 - (c.percento ?? b) : c.manca;
    if (!c.completato && out.perOra > 0 && resta > 0) {
      out.oreAllaFine = resta / out.perOra;
      if (o.scadenza) out.inTempo = ultimo.t + out.oreAllaFine * ORA <= Date.parse(o.scadenza);
    }
    return out;
  }

  // Per l'app: gli ordini ancora in corso, con il ritmo di ogni compito
  dati() {
    const u = this.ultimo || {};
    const ora = this.adesso();
    const conRitmo = (l) =>
      (l || [])
        .filter((o) => !o.scadenza || Date.parse(o.scadenza) > ora)
        .map((o) => ({ ...o, compiti: o.compiti.map((c, i) => ({ ...c, ritmo: this.ritmo(o, i, c) })) }));
    const prossimo = this.timer && u.ultimoTentativo ? new Date(Date.parse(u.ultimoTentativo) + OGNI).toISOString() : null;
    return {
      guerra: u.guerra || null,
      maggiori: conRitmo(u.maggiori),
      personali: conRitmo(u.personali),
      dispacci: u.dispacci || [],
      giocatori: u.giocatori ?? null,
      maggioriAggiornati: u.maggioriAggiornati || null,
      personaliAggiornati: u.personaliAggiornati || null,
      ultimoTentativo: u.ultimoTentativo || null,
      ultimoSuccesso: u.ultimoSuccesso || null,
      errori: u.errori || {},
      inCorso: Boolean(this.inCorso),
      ogniMinuti: OGNI / MINUTO,
      prossimo,
      fonti: { gioco: fontiPredefinite.API, personale: fontiPredefinite.PERSONALE },
    };
  }

  // Primo aggiornamento poco dopo l'avvio, poi ogni mezz'ora
  pianifica() {
    this.timer = setTimeout(() => {
      this.aggiorna();
      this.timer = setInterval(() => this.aggiorna(), OGNI);
      this.timer.unref();
    }, 15 * 1000);
    this.timer.unref();
  }

  ferma() {
    clearTimeout(this.timer);
    clearInterval(this.timer);
  }
}

function motivoDi(esito) {
  if (esito.status === "rejected") return esito.reason?.message || "errore";
  return "risposta senza i dati attesi";
}

module.exports = { Ordini, OGNI };
