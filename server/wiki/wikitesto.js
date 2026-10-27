// Lettura del testo delle pagine della wiki (wikitesto): template, parametri e pulizia
// dei valori. Serve solo quel tanto che usano le schede di armi, stratagemmi e nemici.

// Normalizza il nome di un template: "Infobox_weapon " → "infobox weapon"
function nomeTemplate(t) {
  return String(t).replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

// Tutti i template di primo livello {{...}} del testo, con le graffe annidate rispettate
function templates(testo) {
  const trovati = [];
  let i = 0;
  while (i < testo.length) {
    const inizio = testo.indexOf("{{", i);
    if (inizio < 0) break;
    let profondita = 0;
    let j = inizio;
    while (j < testo.length) {
      if (testo.startsWith("{{", j)) {
        profondita++;
        j += 2;
      } else if (testo.startsWith("}}", j)) {
        profondita--;
        j += 2;
        if (profondita === 0) break;
      } else j++;
    }
    if (profondita !== 0) break;
    const corpo = testo.slice(inizio + 2, j - 2);
    const fineNome = cercaFuori(corpo, "|");
    trovati.push({ nome: nomeTemplate(fineNome < 0 ? corpo : corpo.slice(0, fineNome)), corpo, inizio, fine: j });
    i = j;
  }
  return trovati;
}

// Posizione del primo carattere c che non sta dentro {{ }} o [[ ]]
function cercaFuori(testo, c, da = 0) {
  let graffe = 0;
  let quadre = 0;
  for (let i = da; i < testo.length; i++) {
    if (testo.startsWith("{{", i)) { graffe++; i++; continue; }
    if (testo.startsWith("}}", i)) { graffe--; i++; continue; }
    if (testo.startsWith("[[", i)) { quadre++; i++; continue; }
    if (testo.startsWith("]]", i)) { quadre--; i++; continue; }
    if (testo[i] === c && graffe === 0 && quadre === 0) return i;
  }
  return -1;
}

// Parametri di un template: { nominati: {chiave: valore}, posizionali: [...] }
function parametri(corpo) {
  const pezzi = [];
  let da = 0;
  for (;;) {
    const p = cercaFuori(corpo, "|", da);
    if (p < 0) { pezzi.push(corpo.slice(da)); break; }
    pezzi.push(corpo.slice(da, p));
    da = p + 1;
  }
  const nominati = {};
  const posizionali = [];
  for (const pezzo of pezzi.slice(1)) {
    const uguale = cercaFuori(pezzo, "=");
    if (uguale > 0 && /^[\w\s\-]+$/.test(pezzo.slice(0, uguale))) {
      const chiave = pezzo.slice(0, uguale).trim().toLowerCase().replace(/\s+/g, "_");
      // Con chiavi ripetute vale la prima non vuota
      const valore = pezzo.slice(uguale + 1).trim();
      if (!(chiave in nominati) || (nominati[chiave] === "" && valore !== "")) nominati[chiave] = valore;
    } else posizionali.push(pezzo.trim());
  }
  return { nominati, posizionali };
}

// Primo template con uno dei nomi dati
function trova(testo, nomi) {
  const cercati = nomi.map(nomeTemplate);
  for (const t of templates(testo)) {
    if (cercati.includes(t.nome)) return { ...t, ...parametri(t.corpo) };
  }
  return null;
}

// Template annidati (es. le righe dentro {{Anatomy Table|...}})
function interni(corpo, nome) {
  const n = nomeTemplate(nome);
  return templates(corpo).filter((t) => t.nome === n).map((t) => parametri(t.corpo).nominati);
}

const TEMPLATE_TESTO = {
  "*": () => " · ",
  armor: (p) => p[0] || "",
  damage: (p) => (p[1] || p[0] || "").replace(/\|?notext/i, ""),
  currency: (p) => `${p[1] || ""} ${p[0] || ""}`.trim(),
  tooltip: (p) => p[0] || "",
  difficulty: (p) => p[0] || "",
  passive: (p) => p[0] || "",
  "stratagem code": (p) => p.join(" "),
};

// Toglie link, template, tag e formattazione: resta il testo semplice
function pulisci(valore) {
  if (valore == null) return "";
  let t = String(valore).replace(/<!--[\s\S]*?-->/g, "");
  // Template, dal più interno: si ripete finché ce ne sono
  for (let giro = 0; giro < 10 && t.includes("{{"); giro++) {
    t = t.replace(/\{\{([^{}]*)\}\}/g, (_, corpo) => {
      const pezzi = corpo.split("|").map((x) => x.trim());
      const nome = nomeTemplate(pezzi[0]);
      const posizionali = pezzi.slice(1).filter((x) => !/^\w+\s*=/.test(x) && x.toLowerCase() !== "notext");
      const f = TEMPLATE_TESTO[nome];
      return f ? f(posizionali) : "";
    });
  }
  t = t
    .replace(/\[\[(?:File|Image|Category):[^\]]*\]\]/gi, "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/<hr\s*\/?>/gi, " / ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return t.replace(/^[\s/·]+|[\s/·]+$/g, "");
}

// Primo numero del valore: "1,170" → 1170, "3s" → 3, "600 rpm" → 600, "Unlimited" → null
function numero(valore) {
  const t = pulisci(valore).replace(/(\d),(\d{3})\b/g, "$1$2");
  const m = t.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// Elenco separato da "·" (tratti, modalità di fuoco)
function elenco(valore) {
  return pulisci(valore)
    .split(/·|,/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// {{Damage|Ballistic|75}} → [{ tipo: "ballistic", valore: 75, testo: "75" }]
function danni(valore) {
  const out = [];
  for (const t of templates(String(valore || ""))) {
    if (t.nome !== "damage") continue;
    const { posizionali } = parametri(t.corpo);
    const testo = (posizionali[1] || "").replace(/\|?notext/i, "").trim();
    out.push({ tipo: (posizionali[0] || "").toLowerCase(), valore: numero(testo), testo: pulisci(testo) });
  }
  return out;
}

// {{Stratagem code|right|down|up}} → ["right", "down", "up"]
function codice(valore) {
  for (const t of templates(String(valore || ""))) {
    if (t.nome === "stratagem code") {
      return parametri(t.corpo).posizionali.map((x) => x.toLowerCase()).filter((x) => ["up", "down", "left", "right"].includes(x));
    }
  }
  return [];
}

module.exports = { templates, parametri, trova, interni, pulisci, numero, elenco, danni, codice, nomeTemplate };
