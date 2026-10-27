// Testi delle pagine della wiki per la sezione Wiki dell'app: sezioni in prosa (comportamento,
// consigli tattici, curiosità...), modifiche nelle patch, attacchi dei nemici e tabelle.
// Il wikitesto diventa blocchi semplici fatti di pezzi di testo e di collegamenti alle altre
// pagine dell'app. Niente HTML: l'app disegna tutto come testo.
//
// Blocchi: { t: "p", s } paragrafo · { t: "li", l, s } voce di elenco di livello l ·
// { t: "h", s } titoletto · { t: "tab", righe: [[s, ...], ...], testa } tabella.
// Pezzi (s): stringhe oppure { v, id, t } = collegamento alla pagina `v` (oggetto, nemico,
// armatura, pagina) con l'identificativo `id` e il testo `t`.
const W = require("./wikitesto");

// Sezioni tenute per oggetti, nemici e armature, con il titolo in italiano
const TITOLI = {
  spawning: "Dove compare",
  behavior: "Comportamento",
  "tactical information": "Consigli tattici",
  variants: "Varianti",
  trivia: "Curiosità",
  "known issues": "Problemi noti",
  issues: "Problemi noti",
  lore: "Storia",
  gameplay: "In partita",
  description: "Descrizione",
  explanation: "Come funziona",
  functionality: "Come funziona",
  procurement: "Come si ottiene",
  acquisition: "Come si ottiene",
  attachments: "Accessori",
  "applicable ship modules": "Moduli della nave",
  notes: "Note",
  controls: "Comandi",
  usage: "Uso",
  strategy: "Strategia",
};

// Sezioni che l'app mostra in altro modo (schede, tabelle) o che non servono
const SCARTATE = /^(media|gallery|references|see also|anatomy|weapons loadout|change history|armor list|passive ability|detailed( weapon| stratagem| backpack)? statistics|weapon statistics|stratagem statistics|attachments table|affected by|navigation|sources)$/i;

// Template che non hanno testo da mostrare (navigazione, citazioni, avvisi, tabelle generate)
const SENZA_TESTO = /^(nav |change history head|enemy2list|attachments table|armor passive info panel|armors with passive table|cite |citation needed|msgbox|message box|empty section|incomplete section|expand section|minefield tips|general frv tactics|attack data|tabs|clear|main|see also|stub|breadcrumb|hatnote|disambigmsg|doc$|helmet grid|cape grid|armor table|armor ratings|reflist|toc|anchor)/;

// Fazioni e sottofazioni scritte con un template
const NOMI = /^(automatons?|terminids?|illuminate|incineration corps|jet brigade|cyborg legion|mindless masses|spore burst strain|predator strain|rupture strain|vote snatchers|appropriators|dragonroach(es)?|super earth)$/;

const DIFFICOLTA = ["", "Trivial", "Easy", "Medium", "Challenging", "Hard", "Extreme", "Suicide Mission", "Impossible", "Helldive", "Super Helldive"];
const FRECCE = { up: "↑", down: "↓", left: "←", right: "→" };

// Nomi dei gradi di corazza e perforazione (template "Armor" della wiki)
function nomeGrado(n, tipo = "AP") {
  if (n == null || Number.isNaN(n)) return "";
  if (n > 10) return "Indestructible";
  if (n < 0) return "No Hitbox";
  const base = ["Unarmored", "Very Light", "Light", "Medium", "Heavy"][n];
  if (base) return base;
  const romano = ["I", "II", "III", "IV", "V", "VI"][n - 5];
  return `${tipo === "AV" ? "Tank" : "Anti-Tank"} ${romano}`;
}

const titoloCase = (t) => t.replace(/\b\w/g, (c) => c.toUpperCase());

// Testo di un template nella prosa ("" = sparisce)
function testoTemplate(corpo, ctx) {
  const fine = fuori(corpo, "|");
  const nome = W.nomeTemplate(fine < 0 ? corpo : corpo.slice(0, fine));
  if (!nome || nome.startsWith("#") || /^[A-Z]+:/.test(corpo)) return "";
  if (nome === "!") return "|";
  if (nome === "pagename") return ctx.titolo || "";
  if (SENZA_TESTO.test(nome)) return "";
  const { nominati, posizionali: p } = W.parametri(corpo);
  const pos = p.filter((x) => x.toLowerCase() !== "notext");
  switch (nome) {
    case "*":
      return " · ";
    case "armor": {
      const n = Number(pos[0]);
      const tipo = (pos[1] || "AV").toUpperCase();
      return Number.isFinite(n) ? `${tipo} ${n}` : pos[0] || "";
    }
    case "difficulty": {
      const n = Number(pos[0]);
      return DIFFICOLTA[n] ? `Difficulty ${n} (${DIFFICOLTA[n]})` : `Difficulty ${pos[0] || ""}`.trim();
    }
    case "status":
      return pos[1] || titoloCase(pos[0] || "");
    case "quote":
      return pos[0] ? `“${pos[0]}”` : "";
    case "stratagem code":
      return pos.map((x) => FRECCE[x.toLowerCase()] || x).join(" ");
    case "colorhighlight":
    case "tooltip":
    case "passive":
      return pos[0] || "";
    case "damage":
      // {{Damage|Acid||notext}} è solo l'icona del tipo di danno
      if (p.some((x) => x.toLowerCase() === "notext") && pos.filter(Boolean).length <= 1) return "";
      return W.pulisci(`{{${corpo}}}`);
    case "currency":
      return W.pulisci(`{{${corpo}}}`);
  }
  if (nominati.text) return nominati.text;
  if (NOMI.test(nome)) return titoloCase(nome);
  return "";
}

// Posizione del primo carattere c fuori da {{ }} e [[ ]]
function fuori(testo, c, da = 0) {
  let graffe = 0;
  let quadre = 0;
  for (let i = da; i < testo.length; i++) {
    if (testo.startsWith("{{", i)) { graffe++; i++; continue; }
    if (testo.startsWith("}}", i)) { graffe--; i++; continue; }
    if (testo.startsWith("[[", i)) { quadre++; i++; continue; }
    if (testo.startsWith("]]", i)) { quadre--; i++; continue; }
    if (testo.startsWith(c, i) && graffe <= 0 && quadre <= 0) return i;
  }
  return -1;
}

// Template dal più interno, finché ce ne sono
function espandi(testo, ctx) {
  let t = testo;
  for (let giro = 0; giro < 12 && t.includes("{{"); giro++) {
    const prima = t;
    t = t.replace(/\{\{([^{}]*)\}\}/g, (_, corpo) => testoTemplate(corpo, ctx));
    if (t === prima) break;
  }
  // Graffe rimaste spaiate: via
  return t.replace(/\{\{|\}\}/g, "");
}

function preparaTesto(testo, ctx) {
  return String(testo || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<references\s*\/?>/gi, "")
    .replace(/<nowiki\s*\/>/gi, "")
    .replace(/<nowiki>([\s\S]*?)<\/nowiki>/gi, "$1")
    .replace(/__[A-Z]+__/g, "")
    .replace(/\{\{\s*PAGENAME\s*\}\}/g, ctx.titolo || "")
    .replace(/\r/g, "");
}

// <gallery> → voci di elenco con la didascalia di ogni immagine
function gallerie(testo) {
  return testo.replace(/<gallery[^>]*>([\s\S]*?)<\/gallery>/gi, (_, corpo) =>
    corpo
      .split("\n")
      .map((r) => {
        const i = fuori(r, "|");
        const didascalia = i < 0 ? "" : r.slice(i + 1).replace(/^(alt|link|class)=[^|]*\|?/i, "").trim();
        return didascalia ? `* ${didascalia}` : "";
      })
      .filter(Boolean)
      .join("\n"),
  );
}

// <tabber> → titoletti, uno per scheda
function schede(testo) {
  return testo
    .replace(/<tabber>\s*([^=\n|]+)=/gi, "\n=== $1 ===\n")
    .replace(/^\|-\|\s*([^=\n]+)=/gm, "\n=== $1 ===\n")
    .replace(/<\/?tabber>/gi, "");
}

// Celle di una riga di tabella: "| a || b" oppure "! a !! b", attributi tolti
function celle(riga) {
  const corpo = riga.slice(1);
  const sep = riga[0] === "!" ? ["!!", "||"] : ["||"];
  return spezzaFuori(corpo, sep).map((c) => {
    const i = fuori(c, "|");
    // "scope="col" width="10%" | Testo": prima del | ci sono solo attributi
    if (i >= 0 && /^[\s\w-]+=/.test(c.slice(0, i)) && !c.slice(0, i).includes("[[")) return c.slice(i + 1).trim();
    return c.trim();
  });
}

function spezzaFuori(testo, sep) {
  const pezzi = [];
  let da = 0;
  let graffe = 0;
  let quadre = 0;
  for (let i = 0; i < testo.length; i++) {
    if (testo.startsWith("{{", i)) { graffe++; i++; continue; }
    if (testo.startsWith("}}", i)) { graffe--; i++; continue; }
    if (testo.startsWith("[[", i)) { quadre++; i++; continue; }
    if (testo.startsWith("]]", i)) { quadre--; i++; continue; }
    if (graffe <= 0 && quadre <= 0) {
      const s = sep.find((x) => testo.startsWith(x, i));
      if (s) {
        pezzi.push(testo.slice(da, i));
        da = i + s.length;
        i = da - 1;
      }
    }
  }
  pezzi.push(testo.slice(da));
  return pezzi;
}

// Le tabelle {| ... |} diventano blocchi "tab" (con le tabelle annidate appiattite)
function estraiTabelle(testo, ctx) {
  const righe = testo.split("\n");
  const out = [];
  const tabelle = [];
  let pila = [];
  for (const r of righe) {
    const t = r.trim();
    if (t.startsWith("{|")) {
      pila.push({ righe: [], corrente: null, testa: null });
      continue;
    }
    if (!pila.length) {
      out.push(r);
      continue;
    }
    const tab = pila[pila.length - 1];
    if (t.startsWith("|}")) {
      if (tab.corrente) tab.righe.push(tab.corrente);
      pila.pop();
      const blocco = bloccoTabella(tab, ctx);
      if (pila.length) {
        // tabella dentro una cella: le sue righe finiscono come testo della cella
        const sopra = pila[pila.length - 1];
        const testoRighe = blocco ? blocco.righe.map((x) => x.map(testoPezzi).join(" — ")).join(" / ") : "";
        if (sopra.corrente && sopra.corrente.length) sopra.corrente[sopra.corrente.length - 1].testo += ` ${testoRighe}`;
      } else if (blocco) {
        out.push(`\u0000TAB${tabelle.length}\u0000`);
        tabelle.push(blocco);
      }
      continue;
    }
    if (t.startsWith("|+")) continue;
    if (t.startsWith("|-")) {
      if (tab.corrente) tab.righe.push(tab.corrente);
      tab.corrente = [];
      continue;
    }
    if (t.startsWith("|") || t.startsWith("!")) {
      if (!tab.corrente) tab.corrente = [];
      for (const c of celle(t)) tab.corrente.push({ testo: c, testa: t[0] === "!" });
      continue;
    }
    // riga che continua la cella precedente
    if (tab.corrente && tab.corrente.length) tab.corrente[tab.corrente.length - 1].testo += `\n${r}`;
  }
  // tabelle non chiuse: si chiudono qui
  while (pila.length) {
    const tab = pila.pop();
    if (tab.corrente) tab.righe.push(tab.corrente);
    const blocco = bloccoTabella(tab, ctx);
    if (blocco && !pila.length) {
      out.push(`\u0000TAB${tabelle.length}\u0000`);
      tabelle.push(blocco);
    }
  }
  return { testo: out.join("\n"), tabelle };
}

function bloccoTabella(tab, ctx) {
  const righe = tab.righe.filter((r) => r.length);
  if (!righe.length) return null;
  const pezziCella = (c) => inline(c.testo.replace(/(^|\n)\s*[*#:]+\s*/g, "$1").trim().replace(/\n+/g, " / "), ctx);
  let testa = null;
  if (righe[0].every((c) => c.testa)) testa = righe.shift().map(pezziCella);
  const corpo = righe.map((r) => r.map(pezziCella)).filter((r) => r.some((s) => testoPezzi(s).trim()));
  if (!corpo.length) return null;
  return { t: "tab", testa, righe: corpo };
}

const ENTITA = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—", bull: "•", times: "×", hellip: "…", deg: "°" };

function testoSemplice(t) {
  return t
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/'{2,}/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITA[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ");
}

// Testo di una riga con i collegamenti: [[Pagina|testo]] → { v, id, t } se la pagina è nell'app
function inline(riga, ctx) {
  const pezzi = [];
  let resto = riga
    .replace(/\[\[:?(File|Image|Category|Media):[^\]]*\]\]/gi, "")
    .replace(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/g, "$2")
    .replace(/\[https?:\/\/[^\]]+\]/g, "");
  const re = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;
  let da = 0;
  let m;
  while ((m = re.exec(resto))) {
    if (m.index > da) pezzi.push(testoSemplice(resto.slice(da, m.index)));
    const destinazione = m[1].split("#")[0].trim();
    const etichetta = testoSemplice(m[2] ?? m[1].replace(/#.*/, "")).trim() || destinazione;
    const c = destinazione && ctx.collega ? ctx.collega(destinazione) : null;
    pezzi.push(c && !(c.v === ctx.v && c.id === ctx.id) ? { v: c.v, id: c.id, t: etichetta } : etichetta);
    da = re.lastIndex;
  }
  if (da < resto.length) pezzi.push(testoSemplice(resto.slice(da)));
  // pezzi di testo vicini uniti, spazi sistemati
  const uniti = [];
  for (const p of pezzi) {
    if (typeof p === "string" && typeof uniti[uniti.length - 1] === "string") uniti[uniti.length - 1] += p;
    else if (p !== "") uniti.push(p);
  }
  if (typeof uniti[0] === "string") uniti[0] = uniti[0].replace(/^\s+/, "");
  const ultimo = uniti.length - 1;
  if (typeof uniti[ultimo] === "string") uniti[ultimo] = uniti[ultimo].replace(/\s+$/, "");
  return uniti.filter((p) => p !== "");
}

function testoPezzi(s) {
  return (s || []).map((p) => (typeof p === "string" ? p : p.t)).join("");
}

// Righe di prosa (template già espansi) → blocchi
function righeABlocchi(testo, tabelle, ctx) {
  const blocchi = [];
  let paragrafo = [];
  const chiudi = () => {
    const t = paragrafo.join(" ").trim();
    paragrafo = [];
    if (!t) return;
    const s = inline(t, ctx);
    if (testoPezzi(s).trim()) blocchi.push({ t: "p", s });
  };
  // <br> va a capo: chiude il paragrafo
  for (const grezza of testo.replace(/<br\s*\/?>/gi, "\n\n").split("\n")) {
    const r = grezza.trim();
    const tab = r.match(/^\u0000TAB(\d+)\u0000$/);
    if (tab) {
      chiudi();
      blocchi.push(tabelle[Number(tab[1])]);
      continue;
    }
    if (!r || /^<\/?(div|center|span|table)[^>]*>$/i.test(r) || /^-{4,}$/.test(r)) {
      chiudi();
      continue;
    }
    const titolo = r.match(/^(={2,6})\s*(.*?)\s*\1$/);
    if (titolo) {
      chiudi();
      const s = inline(titolo[2], ctx);
      if (testoPezzi(s).trim()) blocchi.push({ t: "h", s });
      continue;
    }
    const voce = r.match(/^([*#]+)\s*(.*)$/);
    if (voce) {
      chiudi();
      const s = inline(voce[2], ctx);
      if (testoPezzi(s).trim()) blocchi.push({ t: "li", l: Math.min(3, voce[1].length), s });
      continue;
    }
    const rientro = r.match(/^[;:]+\s*(.*)$/);
    if (rientro) {
      chiudi();
      paragrafo.push(rientro[1]);
      chiudi();
      continue;
    }
    paragrafo.push(r);
  }
  chiudi();
  // titoletti senza niente sotto: via
  return blocchi.filter((b, i) => b.t !== "h" || (blocchi[i + 1] && blocchi[i + 1].t !== "h"));
}

// Wikitesto di una sezione → blocchi
function blocchi(testo, ctx = {}) {
  let t = preparaTesto(testo, ctx);
  t = gallerie(t);
  t = schede(t);
  t = espandi(t, ctx);
  const { testo: senzaTabelle, tabelle } = estraiTabelle(t, ctx);
  return righeABlocchi(senzaTabelle, tabelle, ctx);
}

// Sezioni di livello 2 della pagina: [{ titolo, testo }], col testo prima del primo titolo
function dividi(testo) {
  const out = [];
  const re = /^==([^=].*?)==\s*$/gm;
  let ultimo = { titolo: "", testo: "" };
  let da = 0;
  let m;
  while ((m = re.exec(testo))) {
    ultimo.testo = testo.slice(da, m.index);
    out.push(ultimo);
    ultimo = { titolo: m[1].replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2").trim() };
    da = re.lastIndex;
  }
  ultimo.testo = testo.slice(da);
  out.push(ultimo);
  return out;
}

// Blocchi al massimo per sezione: le pagine delle meccaniche sono molto più lunghe
const MAX_BLOCCHI = 80;
const MAX_BLOCCHI_PAGINA = 400;

// Sezioni in prosa di una pagina. Con `tutte` (pagine delle meccaniche) si tengono tutte
// quelle con del testo, introduzione compresa, con il titolo originale
function sezioni(testo, ctx = {}, { tutte = false } = {}) {
  const out = [];
  for (const { titolo, testo: corpo } of dividi(String(testo || ""))) {
    const chiave = titolo.toLowerCase();
    if (SCARTATE.test(chiave)) continue;
    if (!tutte && !TITOLI[chiave]) continue;
    const b = blocchi(corpo, ctx).slice(0, tutte ? MAX_BLOCCHI_PAGINA : MAX_BLOCCHI);
    if (!b.length) continue;
    out.push({ titolo: TITOLI[chiave] || titolo || "Introduzione", blocchi: b });
  }
  return out;
}

// Righe di categoria nelle modifiche ("Changes", "Fix"...) in italiano
const CATEGORIE_PATCH = [
  [/^undocumented changes?$/i, "Modifiche non annunciate"],
  [/^changes?$/i, "Modifiche"],
  [/^fix(es)?$/i, "Correzioni"],
  [/^balanc(e|ing)$/i, "Bilanciamento"],
  [/^buffs?$/i, "Potenziamenti"],
  [/^nerfs?$/i, "Indebolimenti"],
  [/^known issues?$/i, "Problemi noti"],
];

// {{Change History Update|1.006.300|changes=...}} → [{ versione, data, blocchi }]
function modifiche(testo, ctx = {}) {
  const out = [];
  const t = preparaTesto(testo, ctx);
  for (const tpl of W.templates(t)) {
    if (tpl.nome !== "change history update") continue;
    const { nominati, posizionali } = W.parametri(tpl.corpo);
    const righe = String(nominati.changes || posizionali[1] || "")
      .split("\n")
      .map((r) => {
        const cat = CATEGORIE_PATCH.find(([re]) => re.test(r.trim()));
        return cat ? `=== ${cat[1]} ===` : r;
      })
      .join("\n");
    const b = blocchi(righe, ctx);
    if (b.length) out.push({ versione: W.pulisci(posizionali[0] || "") || null, data: nominati.date || null, blocchi: b.slice(0, MAX_BLOCCHI) });
  }
  return out.slice(0, 40);
}

function valore(v, ctx) {
  const t = espandi(preparaTesto(v, ctx), ctx);
  return testoPezzi(inline(t.replace(/<br\s*\/?>/gi, " / ").replace(/\n+/g, " / "), ctx)).replace(/\s*\/\s*$/, "").trim() || null;
}

// Attacchi dei nemici ({{Enemy Loadout Box}}): nome, descrizione e numeri
function attacchi(testo, ctx = {}) {
  const out = [];
  for (const tpl of W.templates(preparaTesto(testo, ctx))) {
    if (!/^enemy loadout box/.test(tpl.nome)) continue;
    const p = W.parametri(tpl.corpo).nominati;
    const a = {
      nome: valore(p.title, ctx),
      descrizione: valore(p.description, ctx),
      danno: valore(p.damage, ctx),
      durevole: valore(p.damage_durable, ctx),
      ap: valore(p.ap, ctx),
      cadenza: valore(p.rof, ctx),
      dispersione: valore(p.spread, ctx),
      effetti: valore(p.inflict_status, ctx),
      demolizione: valore(p.demo, ctx),
      stordimento: valore(p.stagger, ctx),
      spinta: valore(p.push, ctx),
    };
    if (a.nome || a.danno) out.push(Object.fromEntries(Object.entries(a).filter(([, v]) => v != null)));
  }
  return out;
}

module.exports = { sezioni, modifiche, attacchi, blocchi, inline, nomeGrado, testoPezzi, TITOLI };
