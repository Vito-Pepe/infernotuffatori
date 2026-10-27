// Archivio delle build in un file JSON nel volume Docker (/data/build.json).
// Ogni scrittura passa da un file temporaneo e un rename, così il file non resta mai a metà.
// Una copia per giorno in /data/backup (le ultime 14).
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const GIORNI_BACKUP = 14;
const FAZIONI = ["terminidi", "automi", "illuminati"];

function idValido(id) {
  return typeof id === "string" && /^[a-z0-9-]{1,64}$/.test(id);
}

function nuovoId() {
  return `b-${crypto.randomBytes(6).toString("hex")}`;
}

function normalizza(dati) {
  const stato = { versione: 1, build: {}, ordine: Object.fromEntries(FAZIONI.map((f) => [f, []])) };
  if (!dati || typeof dati !== "object") return stato;
  for (const [id, b] of Object.entries(dati.build || {})) {
    if (idValido(id) && b && typeof b === "object" && !Array.isArray(b)) stato.build[id] = { ...b, id };
  }
  for (const f of FAZIONI) {
    const elenco = Array.isArray(dati.ordine?.[f]) ? dati.ordine[f] : [];
    stato.ordine[f] = elenco.filter((id) => stato.build[id]?.fazione === f);
  }
  // Build senza posto nell'ordine (es. dopo un import a mano): in fondo
  for (const b of Object.values(stato.build)) {
    if (FAZIONI.includes(b.fazione) && !stato.ordine[b.fazione].includes(b.id)) stato.ordine[b.fazione].push(b.id);
  }
  return stato;
}

class Archivio {
  constructor(cartella) {
    this.file = path.join(cartella, "build.json");
    this.cartellaBackup = path.join(cartella, "backup");
    this.coda = Promise.resolve();
    fs.mkdirSync(this.cartellaBackup, { recursive: true });
    this.stato = fs.existsSync(this.file) ? normalizza(JSON.parse(fs.readFileSync(this.file, "utf8"))) : normalizza(null);
    if (!fs.existsSync(this.file)) this.scriviSubito();
  }

  // Le scritture vanno in fila: mai due insieme sullo stesso file
  salva() {
    this.coda = this.coda.then(() => this.scriviSubito()).catch((e) => console.error("Salvataggio non riuscito:", e));
    return this.coda;
  }

  scriviSubito() {
    this.backupDelGiorno();
    const tmp = `${this.file}.tmp`;
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeSync(fd, JSON.stringify(this.stato));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.file);
  }

  backupDelGiorno() {
    if (!fs.existsSync(this.file)) return;
    const oggi = new Date().toISOString().slice(0, 10);
    const copia = path.join(this.cartellaBackup, `build-${oggi}.json`);
    if (fs.existsSync(copia)) return;
    fs.copyFileSync(this.file, copia);
    const vecchie = fs.readdirSync(this.cartellaBackup).filter((f) => /^build-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    vecchie.slice(0, Math.max(vecchie.length - GIORNI_BACKUP, 0)).forEach((f) => fs.unlinkSync(path.join(this.cartellaBackup, f)));
  }

  elenco() {
    return { build: Object.values(this.stato.build), ordine: this.stato.ordine };
  }

  prendi(id) {
    return this.stato.build[id] || null;
  }

  // Nuova build: in cima all'elenco della sua fazione
  crea(dati, autore) {
    const ora = new Date().toISOString();
    let id = nuovoId();
    while (this.stato.build[id]) id = nuovoId();
    const b = { ...dati, id, autore, creata: ora, aggiornata: ora };
    this.stato.build[id] = b;
    this.stato.ordine[b.fazione].unshift(id);
    return this.salva().then(() => b);
  }

  aggiorna(id, dati, chi) {
    const prima = this.stato.build[id];
    const b = { ...prima, ...dati, id, autore: prima.autore, creata: prima.creata, aggiornata: new Date().toISOString(), modificataDa: chi };
    if (b.fazione !== prima.fazione) {
      this.stato.ordine[prima.fazione] = this.stato.ordine[prima.fazione].filter((x) => x !== id);
      this.stato.ordine[b.fazione].unshift(id);
    }
    this.stato.build[id] = b;
    return this.salva().then(() => b);
  }

  elimina(id) {
    const b = this.stato.build[id];
    if (!b) return Promise.resolve(false);
    delete this.stato.build[id];
    this.stato.ordine[b.fazione] = this.stato.ordine[b.fazione].filter((x) => x !== id);
    return this.salva().then(() => true);
  }

  // Nuovo ordine di una fazione: gli id mancanti restano in fondo, quelli sconosciuti si ignorano
  riordina(fazione, ids) {
    const presenti = this.stato.ordine[fazione];
    const nuovo = ids.filter((id, i) => presenti.includes(id) && ids.indexOf(id) === i);
    this.stato.ordine[fazione] = [...nuovo, ...presenti.filter((id) => !nuovo.includes(id))];
    return this.salva().then(() => this.stato.ordine[fazione]);
  }
}

module.exports = { Archivio, FAZIONI, idValido };
