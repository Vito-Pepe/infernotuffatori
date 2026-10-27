// Controllo di una build che arriva dalla pagina: solo i campi previsti, oggetti che
// esistono nel catalogo e stanno nel posto giusto. Un oggetto tolto dal catalogo (la wiki
// l'ha rinominato o eliminato) resta nelle build che lo avevano già.
const { FAZIONI, idValido } = require("./archivio");

const POSTI = ["primaria", "secondaria", "granata", "potenziamento"];
const PESI = ["leggera", "media", "pesante"];

function errore(messaggio) {
  return Object.assign(new Error(messaggio), { stato: 400 });
}

function testo(v, max) {
  return typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

function oggetto(id, slot, indice, primaVal) {
  if (id == null || id === "") return null;
  if (!idValido(id)) throw errore(`Oggetto non valido: ${String(id).slice(0, 40)}`);
  const o = indice.get(id);
  if (o && o.slot !== slot) throw errore(`${o.nome} non va nel posto "${slot}"`);
  if (!o && id !== primaVal) throw errore(`Oggetto sconosciuto: ${id}`);
  return id;
}

function valida(corpo, catalogo, prima = null) {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) throw errore("Build non valida");
  const indice = new Map((catalogo.oggetti || []).map((o) => [o.id, o]));
  const fazione = corpo.fazione;
  if (!FAZIONI.includes(fazione)) throw errore("Fazione non valida");

  const b = {
    nome: testo(corpo.nome, 60) || "Build senza nome",
    fazione,
    variante: testo(corpo.variante, 40) || null,
    note: testo(corpo.note, 2000),
  };
  for (const posto of POSTI) b[posto] = oggetto(corpo[posto], posto, indice, prima?.[posto]);

  const strat = Array.isArray(corpo.stratagemmi) ? corpo.stratagemmi : [];
  if (strat.length > 4) throw errore("Al massimo 4 stratagemmi");
  b.stratagemmi = [0, 1, 2, 3].map((i) => oggetto(strat[i], "stratagemma", indice, prima?.stratagemmi?.[i]));
  const scelti = b.stratagemmi.filter(Boolean);
  if (new Set(scelti).size !== scelti.length) throw errore("Lo stesso stratagemma due volte");

  const armatura = corpo.armatura && typeof corpo.armatura === "object" ? corpo.armatura : {};
  b.armatura = {
    passiva: oggetto(armatura.passiva, "armatura", indice, prima?.armatura?.passiva),
    peso: PESI.includes(armatura.peso) ? armatura.peso : "media",
  };
  return b;
}

module.exports = { valida };
