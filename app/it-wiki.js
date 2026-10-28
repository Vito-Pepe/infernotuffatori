// Sezione Wiki: tutto sul gioco, dai dati della wiki di Helldivers 2. Nemici con l'anatomia
// completa, armi, granate, stratagemmi, passive, potenziamenti, armature, elmi e mantelli,
// strutture e meccaniche. I testi lunghi arrivano dal Pi solo quando si apre una pagina; i
// numeri e i confronti vengono dal catalogo e dal nostro modello.
(function () {
  "use strict";
  const { h, monta, stato, oggetto, chiama, vista, numero, leggiLocale, scriviLocale } = window.IT;
  const G = window.Grafica;
  const M = window.Metriche;
  const PB = window.PaginaBuild;

  const DIFFICOLTA = ["", "Trivial", "Easy", "Medium", "Challenging", "Hard", "Extreme", "Suicide Mission", "Impossible", "Helldive", "Super Helldive"];
  const CLASSI = { leggero: "Leggero", medio: "Medio", pesante: "Pesante" };
  const PESI = { leggera: "Leggera", media: "Media", pesante: "Pesante" };
  const PESI_PLURALE = { leggera: "Leggere", media: "Medie", pesante: "Pesanti" };
  const NOMI_COLPO = { proiettile: "Proiettile", esplosione: "Esplosione", raggio: "Raggio", arco: "Arco elettrico", spruzzo: "Getto", mischia: "Corpo a corpo", stato: "Effetto" };
  const ELEMENTI = { fire: "fuoco", gas: "gas", arc: "elettrico", acid: "acido", laser: "laser" };

  // --- Dati ---

  const nemici = () => stato.catalogo.nemici || [];
  const armature = () => stato.catalogo.armature || [];
  const nemico = (id) => nemici().find((n) => n.id === id) || null;
  const armatura = (id) => armature().find((a) => a.id === id) || null;

  // Testi della wiki: scaricati una volta sola per pagina
  const testi = new Map();
  function testiDi(tipo, id) {
    const k = `${tipo}/${id}`;
    if (!testi.has(k)) {
      testi.set(
        k,
        chiama("GET", `wiki/${tipo}/${encodeURIComponent(id)}`).catch((e) => {
          testi.delete(k);
          throw e;
        }),
      );
    }
    return testi.get(k);
  }

  function nomeGrado(n, tipo = "AP") {
    if (n == null) return "";
    if (n > 10) return "Indestructible";
    if (n < 0) return "No Hitbox";
    const base = ["Unarmored", "Very Light", "Light", "Medium", "Heavy"][n];
    if (base) return base;
    return `${tipo === "AV" ? "Tank" : "Anti-Tank"} ${["I", "II", "III", "IV", "V", "VI"][n - 5]}`;
  }

  function grado(n, tipo = "AP") {
    if (n == null) return null;
    return h("span", { class: `grado g${Math.max(-1, Math.min(11, n))}`, title: `${tipo} ${n}: ${nomeGrado(n, tipo)}` }, `${tipo} ${n}`);
  }

  const percento = (x, cifre = 0) => (x == null ? "–" : `${numero(x * 100, cifre)}%`);

  // Perforazione principale di un oggetto: quella della scheda, altrimenti la più alta dei colpi
  function perforazioneDi(o) {
    if (o.scheda?.perforazione != null) return o.scheda.perforazione;
    const ap = colpiPiatti(o.combattimento).filter((x) => x.tipo !== "stato" && !x.retro && x.ap != null).map((x) => x.ap);
    return ap.length ? Math.max(...ap) : null;
  }

  // Etichetta che il gioco mostra sull'arma ("Medium Armor Penetrating", "Anti-Tank")
  function etichettaGioco(o) {
    return (o.tratti || []).find((t) => /armou?r penetrating|anti-tank/i.test(t)) || null;
  }

  function colpiPiatti(c, prefisso = "") {
    const out = [];
    for (const x of c?.colpi || []) {
      if (x.tipo === "arma") out.push(...colpiPiatti(x, `${x.nome || "Arma"} · `));
      else out.push({ ...x, etichetta: `${prefisso}${x.tipo === "stato" ? `Effetto ${String(x.nome || "").replace(/_/g, " ")}` : NOMI_COLPO[x.tipo] || x.tipo}` });
    }
    return out;
  }

  function costoTesto(c) {
    if (!c) return null;
    if (c.esclusiva) return "esclusiva";
    return [c.quantita != null ? numero(c.quantita, 0) : null, c.valuta].filter(Boolean).join(" ");
  }

  const normale = (t) =>
    String(t || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  // --- Armatura dei Helldiver: quanto danno si subisce ---

  function fattore(protezione, testa = false) {
    const a = stato.catalogo.meccaniche?.armatura || {};
    const tabella = testa ? a.testa : a.fattori;
    if (tabella && tabella[protezione] != null) return tabella[protezione];
    const p = testa ? Math.max(100, protezione) : protezione;
    return p <= 150 ? 1.5 - p / 200 : 1.05 - p / 500;
  }

  // Danno subito su una parte del corpo, rispetto al danno del colpo (1 = tutto)
  function dannoSubito(protezione, parte) {
    const a = stato.catalogo.meccaniche?.armatura || {};
    const molt = a.parti?.[parte] ?? { testa: 1.5, petto: 1, braccia: 0.85, gambe: 0.85 }[parte];
    return molt * fattore(protezione, parte === "testa");
  }

  // --- Pezzi della pagina ---

  function pezzi(s) {
    return (s || []).map((p) => (typeof p === "string" ? p : h("a", { href: `#/wiki/${p.v}/${encodeURIComponent(p.id)}` }, p.t)));
  }

  function tabellaWiki(b) {
    return h(
      "div",
      { class: "scorre" },
      h(
        "table",
        { class: "tabella tabella-wiki" },
        b.testa ? h("thead", null, h("tr", null, b.testa.map((c) => h("th", null, pezzi(c))))) : null,
        h("tbody", null, b.righe.map((r) => h("tr", null, r.map((c) => h("td", null, pezzi(c)))))),
      ),
    );
  }

  // Blocchi della wiki (paragrafi, elenchi annidati, titoletti, tabelle) → elementi
  function disegnaBlocchi(blocchi) {
    const out = h("div", { class: "prosa" });
    let pila = [];
    for (const b of blocchi || []) {
      if (b.t === "li") {
        const l = Math.max(1, Math.min(3, b.l || 1));
        while (pila.length && pila[pila.length - 1].l > l) pila.pop();
        let corrente = pila[pila.length - 1];
        if (!corrente || corrente.l < l) {
          const ul = h("ul");
          (corrente ? corrente.ul.lastElementChild || corrente.ul : out).append(ul);
          corrente = { l, ul };
          pila.push(corrente);
        }
        corrente.ul.append(h("li", null, pezzi(b.s)));
        continue;
      }
      pila = [];
      if (b.t === "p") out.append(h("p", null, pezzi(b.s)));
      else if (b.t === "h") out.append(h("h4", null, pezzi(b.s)));
      else if (b.t === "tab") out.append(tabellaWiki(b));
    }
    return out;
  }

  function sezioniWiki(v) {
    return (v.sezioni || []).map((s) => h("section", null, h("h2", null, s.titolo), h("div", { class: "pannello testo-lungo" }, disegnaBlocchi(s.blocchi))));
  }

  function patch(v) {
    if (!v.modifiche?.length) return null;
    return h(
      "section",
      null,
      h("h2", null, `Modifiche nelle patch · ${v.modifiche.length}`),
      h(
        "div",
        { class: "pannello testo-lungo" },
        v.modifiche.map((m, i) => h("details", { class: "patch", open: i === 0 }, h("summary", null, `Versione ${m.versione || "?"}${m.data ? ` · ${m.data}` : ""}`), disegnaBlocchi(m.blocchi))),
      ),
    );
  }

  function urlWiki(titolo) {
    return `https://helldivers.wiki.gg/wiki/${encodeURIComponent(String(titolo).replace(/ /g, "_")).replace(/%2F/g, "/")}`;
  }

  function fonte(titolo) {
    return h(
      "p",
      { class: "tenue piccolo fonte-wiki" },
      "Testi e dati dalla pagina ",
      h("a", { href: urlWiki(titolo), target: "_blank", rel: "noopener noreferrer" }, `${titolo} ↗`),
      " della Helldivers Wiki (CC BY-NC-SA 4.0).",
    );
  }

  // Zona che si riempie quando arrivano i testi della wiki
  function zonaTesti(tipo, id, disegna) {
    const zona = h("div", null, h("div", { class: "caricamento" }, "Testi della wiki…"));
    testiDi(tipo, id)
      .then((v) => zona.replaceChildren(...[disegna(v)].flat(Infinity).filter(Boolean)))
      .catch((e) => zona.replaceChildren(h("p", { class: "tenue" }, `Testi della wiki non disponibili: ${e.message}`)));
    return zona;
  }

  // `testa`: per gli elmi con l'immagine del set, ingrandisce la testa
  function foto(x, classe = "icona", { testa = false, vuota = "?" } = {}) {
    if (!x?.icona) return h("span", { class: `${classe} vuota` }, vuota);
    const vista = x.vista === "set" ? (testa ? " set testa" : " set") : "";
    return h("span", { class: `${classe} foto${vista}` }, h("img", { src: `/icone/${x.icona}`, alt: x.nome, loading: "lazy", decoding: "async" }));
  }

  function chips(valori, attuale, scegli) {
    return h(
      "div",
      { class: "chips" },
      valori.map(([v, nome]) => h("button", { type: "button", class: v === attuale ? "attivo" : "", onclick: () => scegli(v) }, nome)),
    );
  }

  function dati(coppie) {
    const righe = coppie.filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length));
    return righe.length ? h("dl", { class: "scheda" }, righe.map(([k, v]) => [h("dt", null, k), h("dd", null, v)])) : null;
  }

  function capo(immagine, titolo, sotto, extra) {
    return h("div", { class: "capo-wiki" }, immagine, h("div", { class: "info" }, h("h1", null, titolo), sotto ? h("div", { class: "tenue piccolo" }, sotto) : null, extra));
  }

  function indietro(href, testo) {
    return h("a", { class: "indietro piccolo", href }, `← ${testo}`);
  }

  function nonTrovato(main, testo) {
    monta(main, h("div", { class: "vuoto" }, `${testo} non trovato. `, h("a", { href: "#/wiki" }, "Torna alla Wiki")));
  }

  // --- Categorie e ricerca ---

  const CATEGORIE = [
    { id: "nemici", nome: "Nemici", descr: "Salute e corazza di ogni parte, attacchi, consigli, armi migliori", conta: () => nemici().length },
    { id: "primarie", nome: "Armi primarie", slot: "primaria" },
    { id: "secondarie", nome: "Armi secondarie", slot: "secondaria" },
    { id: "granate", nome: "Granate", slot: "granata" },
    { id: "stratagemmi", nome: "Stratagemmi", slot: "stratagemma" },
    { id: "armature", nome: "Armature", descr: "Protezione, danno subito, velocità, stamina e passiva", conta: () => armature().length },
    { id: "passive", nome: "Passive delle armature", slot: "armatura" },
    { id: "potenziamenti", nome: "Potenziamenti", slot: "potenziamento" },
    { id: "elmi", nome: "Elmi", descr: "Estetici: chi protegge la testa è il corpo", conta: () => (stato.catalogo.elmi || []).length },
    { id: "mantelli", nome: "Mantelli", descr: "Estetici", conta: () => (stato.catalogo.mantelli || []).length },
    { id: "strutture", nome: "Strutture", descr: "Nidi, fabbriche, torri: la forza che serve per distruggerle", conta: () => (stato.catalogo.strutture || []).length },
    { id: "meccaniche", nome: "Meccaniche del gioco", descr: "Perforazione e corazza, danni, esplosioni, effetti, stordimento, armatura, difficoltà" },
  ];
  const DESCRIZIONI = {
    primarie: "Danno, perforazione, attacchi e come vanno contro ogni nemico",
    secondarie: "Danno, perforazione, attacchi e come vanno contro ogni nemico",
    granate: "Esplosioni, raggi, effetti",
    stratagemmi: "Codici, tempi, usi, attacchi e moduli della nave",
    passive: "Cosa fanno, con i numeri, e quali armature le hanno",
    potenziamenti: "Cosa fanno e come si ottengono",
  };

  function vociCercabili() {
    const c = stato.catalogo;
    const voci = [];
    for (const o of c.oggetti) voci.push({ nome: o.nome, sotto: [PB.NOMI_POSTO[o.slot], o.slot === "stratagemma" ? PB.NOMI_TIPO[o.tipo] : o.tipo].filter(Boolean).join(" · "), href: `#/wiki/oggetto/${o.id}`, icona: () => G.iconaOggetto(o, { titolo: false }) });
    for (const n of nemici()) voci.push({ nome: n.nome, sotto: `${G.FAZIONI[n.fazione]?.nome} · ${CLASSI[n.classe]}`, href: `#/wiki/nemico/${n.id}`, icona: () => foto(n) });
    for (const a of armature()) voci.push({ nome: a.nome, sotto: `Armatura ${PESI[a.peso]?.toLowerCase()} · protezione ${a.protezione}`, href: `#/wiki/armatura/${a.id}`, icona: () => foto(a) });
    for (const e of c.elmi || []) voci.push({ nome: e.nome, sotto: "Elmo", href: `#/wiki/elmi/${e.id}`, icona: () => foto(e, "icona", { testa: true, vuota: "⛑" }) });
    for (const m of c.mantelli || []) voci.push({ nome: m.nome, sotto: "Mantello", href: `#/wiki/mantelli/${m.id}`, icona: () => foto(m, "icona", { vuota: "▼" }) });
    for (const s of c.strutture || []) voci.push({ nome: s.nome, sotto: `Struttura · forza ${s.forza}`, href: "#/wiki/strutture", icona: () => h("span", { class: "icona vuota" }, "▣") });
    for (const p of c.meccaniche?.pagine || []) voci.push({ nome: p.titolo, sotto: "Pagina della wiki sulle meccaniche (inglese)", href: `#/wiki/pagina/${p.id}`, icona: () => h("span", { class: "icona vuota" }, "§") });
    for (const v of voci) v.chiave = normale(`${v.nome} ${v.sotto}`);
    return voci;
  }

  function rigaVoce(v) {
    return h("a", { class: "riga riga-wiki", href: v.href }, v.icona(), h("div", { class: "testo" }, h("div", { class: "nome" }, v.nome), h("div", { class: "autore" }, v.sotto)));
  }

  function home(main) {
    const c = stato.catalogo;
    const voci = vociCercabili();
    const cerca = h("input", { type: "search", placeholder: "Cerca un nemico, un'arma, uno stratagemma, un'armatura…", "aria-label": "Cerca nella wiki", value: leggiLocale("it-wiki-cerca", "") });
    const risultati = h("div");
    const griglia = h(
      "div",
      { class: "categorie-wiki" },
      CATEGORIE.map((k) => {
        const quanti = k.slot ? c.oggetti.filter((o) => o.slot === k.slot).length : k.conta ? k.conta() : null;
        return h("a", { class: "categoria-wiki", href: `#/wiki/${k.id}` }, h("div", { class: "nome" }, k.nome, quanti != null ? h("span", { class: "quanti" }, String(quanti)) : null), h("div", { class: "descr" }, k.descr || DESCRIZIONI[k.id] || ""));
      }),
    );
    const aggiorna = () => {
      scriviLocale("it-wiki-cerca", cerca.value);
      const q = normale(cerca.value);
      griglia.classList.toggle("nascosto", Boolean(q));
      if (!q) return risultati.replaceChildren();
      const parole = q.split(" ");
      const trovate = voci.filter((v) => parole.every((p) => v.chiave.includes(p)));
      trovate.sort((a, b) => Number(!normale(a.nome).startsWith(q)) - Number(!normale(b.nome).startsWith(q)) || a.nome.localeCompare(b.nome));
      risultati.replaceChildren(...(trovate.length ? trovate.slice(0, 60).map(rigaVoce) : [h("div", { class: "vuoto" }, "Niente con questo nome.")]));
      if (trovate.length > 60) risultati.append(h("p", { class: "tenue piccolo" }, `Altri ${trovate.length - 60}: scrivi qualcosa in più.`));
    };
    cerca.addEventListener("input", aggiorna);
    monta(
      main,
      h("h1", { style: "margin-bottom:10px" }, "Wiki di Helldivers 2"),
      h("div", { class: "filtri", style: "grid-template-columns:1fr" }, cerca),
      risultati,
      griglia,
      h("p", { class: "tenue piccolo", style: "margin-top:16px" }, `Dati della Helldivers Wiki (helldivers.wiki.gg, CC BY-NC-SA 4.0), aggiornati ogni giorno${c.versioneGioco ? ` · versione del gioco ${c.versioneGioco}` : ""}. I testi sono in inglese, come sulla wiki; spiegazioni, tabelle e confronti sono nostri.`),
    );
    aggiorna();
  }

  // --- Nemici ---

  function corazzaCorpo(n) {
    return n.parti?.find((p) => p.main)?.av ?? null;
  }

  function elencoNemici(main) {
    const filtri = { fazione: "tutte", classe: "tutte", testo: "", ...leggiLocale("it-wiki-nemici", {}) };
    const cerca = h("input", { type: "search", placeholder: "Cerca un nemico", value: filtri.testo, "aria-label": "Cerca un nemico" });
    const barra = h("div");
    const elenco = h("div");
    const ordine = ["terminidi", "automi", "illuminati"];
    const ridisegna = () => {
      scriviLocale("it-wiki-nemici", filtri);
      barra.replaceChildren(
        chips([["tutte", "Tutte"], ...ordine.map((f) => [f, G.FAZIONI[f].nome])], filtri.fazione, (v) => ((filtri.fazione = v), ridisegna())),
        h("div", { style: "height:6px" }),
        chips([["tutte", "Tutte le classi"], ["leggero", "Leggeri"], ["medio", "Medi"], ["pesante", "Pesanti"]], filtri.classe, (v) => ((filtri.classe = v), ridisegna())),
      );
      const q = normale(filtri.testo);
      const scelti = nemici()
        .filter((n) => (filtri.fazione === "tutte" || n.fazione === filtri.fazione) && (filtri.classe === "tutte" || n.classe === filtri.classe) && (!q || normale(n.nome).includes(q)))
        .sort((a, b) => ordine.indexOf(a.fazione) - ordine.indexOf(b.fazione) || a.salute - b.salute);
      elenco.replaceChildren(
        ...(scelti.length
          ? scelti.map((n) =>
              h(
                "a",
                { class: "riga riga-wiki", href: `#/wiki/nemico/${n.id}` },
                foto(n),
                h("div", { class: "testo" }, h("div", { class: "nome" }, n.nome), h("div", { class: "autore" }, `${G.FAZIONI[n.fazione]?.nome} · ${CLASSI[n.classe]}${n.difficolta ? ` · da difficoltà ${n.difficolta}` : ""}`)),
                h("div", { class: "valori" }, h("span", { title: "Salute del corpo" }, `♥ ${numero(n.salute, 0)}`), grado(corazzaCorpo(n), "AV")),
              ),
            )
          : [h("div", { class: "vuoto" }, "Nessun nemico con questi filtri.")]),
      );
    };
    cerca.addEventListener("input", () => ((filtri.testo = cerca.value), ridisegna()));
    monta(main, indietro("#/wiki", "Wiki"), h("h1", { style: "margin:6px 0 10px" }, "Nemici"), h("div", { class: "filtri", style: "grid-template-columns:1fr" }, cerca), barra, h("div", { style: "height:10px" }), elenco);
    ridisegna();
  }

  // Le armi e gli stratagemmi migliori contro un nemico, secondo il nostro modello
  function miglioriContro(n) {
    const gruppi = { mano: [], granate: [], stratagemmi: [] };
    for (const o of stato.catalogo.oggetti) {
      if (!o.combattimento?.colpi?.length) continue;
      const d = M.analizzaOggetto(o, [n]).dettagli[0];
      if (!d || !(d.kpm > 0)) continue;
      const g = o.slot === "granata" ? "granate" : ["primaria", "secondaria"].includes(o.slot) || (o.slot === "stratagemma" && o.tipo === "arma") ? "mano" : o.slot === "stratagemma" ? "stratagemmi" : null;
      if (g) gruppi[g].push({ o, kpm: d.kpm, colpi: d.colpi, parte: d.parte });
    }
    for (const k of Object.keys(gruppi)) gruppi[k] = gruppi[k].sort((a, b) => b.kpm - a.kpm).slice(0, 6);
    return gruppi;
  }

  function tabellaMigliori(titolo, righe) {
    if (!righe.length) return null;
    return h(
      "div",
      { class: "grafico" },
      h("h3", null, titolo),
      h(
        "table",
        { class: "tabella" },
        h("thead", null, h("tr", null, h("th", null, "Oggetto"), h("th", { class: "num", title: "Uccisioni al minuto stimate dal nostro modello" }, "Ucc./min"), h("th", { class: "num" }, "Colpi"))),
        h(
          "tbody",
          null,
          righe.map((r) =>
            h(
              "tr",
              null,
              h("td", null, h("a", { href: `#/wiki/oggetto/${r.o.id}` }, r.o.nome), r.parte ? h("div", { class: "tenue piccolo" }, `mirando a: ${r.parte}`) : null),
              h("td", { class: "num" }, numero(r.kpm)),
              h("td", { class: "num" }, Number.isFinite(r.colpi) && r.colpi ? String(r.colpi) : "–"),
            ),
          ),
        ),
      ),
    );
  }

  function tabellaAnatomia(parti) {
    if (!parti?.length) return null;
    return h(
      "div",
      { class: "scorre" },
      h(
        "table",
        { class: "tabella anatomia" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, "Parte"),
            h("th", { class: "num" }, "Salute"),
            h("th", null, "Corazza"),
            h("th", { class: "num", title: "Quota di danno durevole che conta su questa parte" }, "Durevole"),
            h("th", { class: "num", title: "Quanto del danno passa alla salute del corpo" }, "Al corpo"),
            h("th", { class: "num", title: "Resistenza alle esplosioni (ExDR): 100% = immune" }, "Esplosioni"),
            h("th", null, "Fatale"),
          ),
        ),
        h(
          "tbody",
          null,
          parti.map((p) =>
            h(
              "tr",
              { class: p.main ? "principale" : "" },
              h("td", null, p.nome, p.sanguina ? h("div", { class: "tenue piccolo" }, `sanguina: ${p.sanguina}`) : null),
              h("td", { class: "num" }, p.salute === "main" ? "= corpo" : p.salute == null ? "–" : numero(p.salute, 0)),
              h("td", null, grado(p.av, "AV"), h("span", { class: "tenue piccolo" }, ` ${nomeGrado(p.av, "AV")}`)),
              h("td", { class: "num" }, percento(p.durevole)),
              h("td", { class: "num" }, p.versoMain == null ? "–" : percento(p.versoMain), p.limite === false ? h("span", { class: "tenue", title: "Il danno in più passa al corpo senza limite" }, " ∞") : null),
              h("td", { class: "num" }, percento(p.resistenzaEsplosioni)),
              h("td", null, p.fatale ? h("b", { class: "si" }, "✓") : h("span", { class: "tenue" }, "–")),
            ),
          ),
        ),
      ),
    );
  }

  function attacchiNemico(v) {
    const carte = (v.attacchi || []).map((a) =>
      h(
        "div",
        { class: "pannello attacco" },
        h("div", { class: "nome" }, a.nome || "Attacco"),
        a.descrizione ? h("p", { class: "tenue piccolo" }, a.descrizione) : null,
        dati([
          ["Danno", a.danno],
          ["Danno durevole", a.durevole],
          ["Perforazione", a.ap ? `${a.ap}${/^\d+/.test(a.ap) ? ` (${nomeGrado(Number(a.ap.match(/^-?\d+/)[0]))})` : ""}` : null],
          ["Cadenza", a.cadenza],
          ["Dispersione", a.dispersione],
          ["Effetti", a.effetti],
          ["Demolizione", a.demolizione],
          ["Stordimento", a.stordimento],
          ["Spinta", a.spinta],
        ]),
      ),
    );
    if (!carte.length && !v.danni?.length) return null;
    return h(
      "section",
      null,
      h("h2", null, "Attacchi"),
      v.danni?.length ? h("p", { class: "piccolo" }, h("span", { class: "tenue" }, `Danni${v.tipoDanno ? ` (${v.tipoDanno})` : ""}: `), v.danni.join(" · ")) : null,
      carte.length ? h("div", { class: "griglia-carte" }, carte) : null,
      h("p", { class: "tenue piccolo" }, "Perforazione degli attacchi scritta come sulla wiki: il primo numero vale per i colpi dritti, gli altri per i colpi sempre più inclinati."),
    );
  }

  function paginaNemico(main, id) {
    const n = nemico(id);
    if (!n) return nonTrovato(main, "Nemico");
    const corpo = n.parti.find((p) => p.main);
    const deboli = n.parti.filter((p) => !p.main).sort((a, b) => a.av - b.av || (a.salute === "main" ? 1e9 : a.salute) - (b.salute === "main" ? 1e9 : b.salute));
    const migliori = miglioriContro(n);
    const av = corpo?.av ?? 0;
    monta(
      main,
      indietro("#/wiki/nemici", "Nemici"),
      capo(
        foto(n, "foto-grande"),
        n.nome,
        [G.FAZIONI[n.fazione]?.nome, CLASSI[n.classe]].filter(Boolean).join(" · "),
        dati([
          ["Salute", numero(n.salute, 0)],
          ["Corazza del corpo", corpo ? [grado(corpo.av, "AV"), ` ${nomeGrado(corpo.av, "AV")}`] : null],
          ["Da difficoltà", n.difficolta ? `${n.difficolta} (${DIFFICOLTA[n.difficolta] || "?"})${n.difficoltaMassima ? ` fino a ${n.difficoltaMassima}` : ""}` : null],
          ["Stordimento", n.stordimento != null ? `serve una forza di ${n.stordimento} per interromperlo` : null],
          ["Danno da fuoco", n.fuoco != null && n.fuoco !== 1 ? `×${numero(n.fuoco, 2)}` : null],
          ["Danno elettrico", n.arco != null ? `×${numero(n.arco, 2)}` : null],
        ]),
      ),
      n.descrizione ? h("p", { class: "descrizione-wiki" }, n.descrizione) : null,
      h("h2", null, "Come abbatterlo"),
      h(
        "div",
        { class: "pannello testo-lungo" },
        h(
          "p",
          null,
          `Il corpo ha corazza ${av} (${nomeGrado(av, "AV")}): con perforazione ${av} lo colpisci al 65%, con ${av + 1} o più a danno pieno, sotto ${av} i colpi rimbalzano. `,
          h("a", { href: "#/wiki/meccaniche" }, "Come funziona"),
        ),
        deboli.length
          ? h(
              "div",
              null,
              h("p", null, "Parti che lo uccidono se le distruggi, dalla meno corazzata:"),
              h(
                "ul",
                null,
                deboli.map((p) => h("li", null, h("b", null, p.nome), ": ", grado(p.av, "AV"), ` · ${p.salute === "main" ? "stessa salute del corpo" : `${numero(p.salute, 0)} di salute`}${p.durevole ? ` · durevole ${percento(p.durevole)}` : ""}${p.versoMain != null ? ` · ${percento(p.versoMain)} del danno al corpo` : ""}`)),
              ),
            )
          : null,
      ),
      h(
        "div",
        { class: "griglia3" },
        tabellaMigliori("Armi in mano", migliori.mano),
        tabellaMigliori("Granate", migliori.granate),
        tabellaMigliori("Stratagemmi", migliori.stratagemmi),
      ),
      h("p", { class: "tenue piccolo" }, "Le armi migliori sono stimate dal nostro modello, con i dati del gioco: uccisioni al minuto contro questo nemico e colpi per abbatterlo. ", h("a", { href: "#/teoria" }, "Come calcoliamo")),
      zonaTesti("nemico", n.id, (v) => [
        v.anatomia?.length ? [h("h2", null, "Anatomia"), h("div", { class: "pannello" }, tabellaAnatomia(v.anatomia), h("p", { class: "tenue piccolo" }, "Durevole: quanto conta il danno durevole dell'arma. Al corpo: quota del danno che passa alla salute del corpo (∞ = senza limite). Esplosioni: resistenza, 100% = immune (il danno va al corpo). Fatale: distruggerla uccide."))] : null,
        attacchiNemico(v),
        sezioniWiki(v),
        patch(v),
      ]),
      fonte(n.nome),
    );
  }

  // --- Oggetti: armi, granate, stratagemmi, passive, potenziamenti ---

  function valoriOggetto(o) {
    if (o.slot === "armatura") return h("div", { class: "valori descr" }, o.effetto || o.descrizione || "");
    if (o.slot === "potenziamento") return h("div", { class: "valori descr" }, o.descrizione || "");
    const sc = o.scheda || {};
    const ap = perforazioneDi(o);
    if (o.slot === "stratagemma") {
      return h(
        "div",
        { class: "valori" },
        ap != null && o.combattimento?.colpi?.length ? grado(ap) : null,
        sc.chiamata != null ? h("span", { title: "Chiamata" }, `⏱ ${numero(sc.chiamata)}s`) : null,
        sc.attesa != null ? h("span", { title: "Attesa" }, `↻ ${numero(sc.attesa, 0)}s`) : null,
        sc.usi != null ? h("span", { title: "Usi" }, `×${sc.usi}`) : null,
      );
    }
    // Danno: solo il primo numero (alcune armi ne hanno diversi, "100 Uncharged Bolt + 75 ...")
    const danno = sc.danno != null ? String(sc.danno) : "";
    const breve = danno.length > 12 ? (danno.match(/\d[\d.,]*/) || [danno.slice(0, 10)])[0] : danno;
    return h("div", { class: "valori" }, grado(ap), breve ? h("span", { title: `Danno: ${danno}` }, `✦ ${breve}`) : null, sc.caricatore != null ? h("span", { title: "Caricatore" }, `▮ ${sc.caricatore}`) : null);
  }

  function elencoOggetti(main, categoria) {
    const tutti = stato.catalogo.oggetti.filter((o) => o.slot === categoria.slot);
    const tipoDi = (o) => (o.slot === "stratagemma" ? PB.NOMI_TIPO[o.tipo] || o.tipo : o.tipo) || "Altro";
    const tipi = [...new Set(tutti.map(tipoDi))].sort();
    const chiave = `it-wiki-${categoria.id}`;
    const filtri = { tipo: "tutti", testo: "", ordine: "nome", ...leggiLocale(chiave, {}) };
    const cerca = h("input", { type: "search", placeholder: `Cerca in ${categoria.nome.toLowerCase()}`, value: filtri.testo, "aria-label": "Cerca" });
    const ordine = h("select", { "aria-label": "Ordina" }, h("option", { value: "nome" }, "Per nome"), h("option", { value: "perforazione" }, "Per perforazione"));
    ordine.value = filtri.ordine;
    const barra = h("div");
    const elenco = h("div");
    const ridisegna = () => {
      scriviLocale(chiave, filtri);
      barra.replaceChildren(tipi.length > 1 ? chips([["tutti", "Tutti"], ...tipi.map((t) => [t, t])], filtri.tipo, (v) => ((filtri.tipo = v), ridisegna())) : "");
      const q = normale(filtri.testo);
      const scelti = tutti.filter((o) => (filtri.tipo === "tutti" || tipoDi(o) === filtri.tipo) && (!q || normale(`${o.nome} ${o.descrizione || ""} ${o.effetto || ""}`).includes(q)));
      if (filtri.ordine === "perforazione") scelti.sort((a, b) => (perforazioneDi(b) ?? -2) - (perforazioneDi(a) ?? -2) || a.nome.localeCompare(b.nome));
      else scelti.sort((a, b) => a.nome.localeCompare(b.nome));
      elenco.replaceChildren(
        ...(scelti.length
          ? scelti.map((o) =>
              h(
                "a",
                { class: "riga riga-wiki", href: `#/wiki/oggetto/${o.id}` },
                G.iconaOggetto(o, { titolo: false }),
                h("div", { class: "testo" }, h("div", { class: "nome" }, o.nome), h("div", { class: "autore" }, [tipoDi(o), o.fonte].filter(Boolean).join(" · "))),
                valoriOggetto(o),
              ),
            )
          : [h("div", { class: "vuoto" }, "Niente con questi filtri.")]),
      );
    };
    cerca.addEventListener("input", () => ((filtri.testo = cerca.value), ridisegna()));
    ordine.addEventListener("change", () => ((filtri.ordine = ordine.value), ridisegna()));
    monta(main, indietro("#/wiki", "Wiki"), h("h1", { style: "margin:6px 0 10px" }, categoria.nome), h("div", { class: "filtri" }, cerca, ordine), barra, h("div", { style: "height:10px" }), elenco);
    ridisegna();
  }

  function tabellaColpi(o) {
    const righe = colpiPiatti(o.combattimento);
    if (!righe.length) return null;
    const altro = (x) =>
      [
        x.elemento ? ELEMENTI[x.elemento] || x.elemento : null,
        x.proiettili > 1 ? `${x.proiettili} pallettoni` : null,
        x.velocita ? `${numero(x.velocita, 0)} m/s` : null,
        x.raggi?.length ? `raggi ${x.raggi.map((r) => numero(r, 1)).join(" / ")} m` : null,
        x.catena ? `salta su ${x.catena} nemici` : null,
        x.gittata ? `gittata ${numero(x.gittata, 0)} m` : null,
        x.tipo === "stato" && x.durata ? `${numero(x.durata, 1)} s` : null,
        x.tipo === "stato" && x.dps ? `${numero(x.dps, 0)} danni/s` : null,
        x.tipo === "stato" && x.forza ? `intensità ${numero(x.forza, 2)}` : null,
        x.retro ? "ritorno di fiamma (dietro di te)" : null,
      ]
        .filter(Boolean)
        .join(" · ");
    return h(
      "div",
      { class: "scorre" },
      h(
        "table",
        { class: "tabella" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, "Attacco"),
            h("th", { class: "num" }, "Danno"),
            h("th", { class: "num" }, "Durevole"),
            h("th", { title: "Perforazione per colpi dritti; tra parentesi con i colpi inclinati" }, "Perforazione"),
            h("th", { class: "num" }, "Demolizione"),
            h("th", { class: "num" }, "Stordimento"),
            h("th", { class: "num" }, "Spinta"),
            h("th", null, "Altro"),
          ),
        ),
        h(
          "tbody",
          null,
          righe.map((x) =>
            h(
              "tr",
              null,
              h("td", null, x.etichetta),
              h("td", { class: "num" }, x.danno != null ? numero(x.danno, 0) : "–"),
              h("td", { class: "num" }, x.durevole != null ? numero(x.durevole, 0) : "–"),
              // Le esplosioni hanno una sola perforazione: gli angoli valgono solo per i colpi
              h("td", null, x.ap != null ? [grado(x.ap), x.apAngolo?.length && x.tipo !== "esplosione" ? h("span", { class: "tenue piccolo" }, ` (${x.apAngolo.join("/")})`) : null] : "–"),
              h("td", { class: "num" }, x.demolizione != null ? numero(x.demolizione, 0) : "–"),
              h("td", { class: "num" }, x.stordimento != null ? numero(x.stordimento, 0) : "–"),
              h("td", { class: "num" }, x.spinta != null ? numero(x.spinta, 0) : "–"),
              h("td", { class: "piccolo altro" }, altro(x)),
            ),
          ),
        ),
      ),
    );
  }

  // Come va un oggetto contro i nemici di una fazione
  function controNemici(o) {
    if (!o.combattimento?.colpi?.length) return null;
    let fazione = leggiLocale("it-wiki-contro", "terminidi");
    const zona = h("div");
    const disegna = () => {
      scriviLocale("it-wiki-contro", fazione);
      const lista = nemici().filter((n) => n.fazione === fazione);
      const a = M.analizzaOggetto(o, lista);
      const righe = a.dettagli.map((d) => ({ ...d, n: lista.find((n) => n.nome === d.nemico) })).sort((x, y) => (x.n?.salute ?? 0) - (y.n?.salute ?? 0));
      zona.replaceChildren(
        chips(["terminidi", "automi", "illuminati"].map((f) => [f, G.FAZIONI[f].nome]), fazione, (v) => ((fazione = v), disegna())),
        h(
          "div",
          { class: "punteggi" },
          ["leggero", "medio", "pesante"].map((c) => h("div", null, h("div", { class: "titolo" }, `Contro i ${c === "leggero" ? "leggeri" : c === "medio" ? "medi" : "pesanti"}`), h("div", { class: "numero" }, numero(a[c])), h("div", { class: "tenue piccolo" }, "su 10"))),
        ),
        h(
          "div",
          { class: "scorre" },
          h(
            "table",
            { class: "tabella" },
            h("thead", null, h("tr", null, h("th", null, "Nemico"), h("th", null, "Classe"), h("th", { class: "num" }, "Ucc./min"), h("th", { class: "num" }, "Colpi"), h("th", null, "Dove mirare"))),
            h(
              "tbody",
              null,
              righe.map((r) =>
                h(
                  "tr",
                  null,
                  h("td", null, r.n ? h("a", { href: `#/wiki/nemico/${r.n.id}` }, r.nemico) : r.nemico),
                  h("td", null, CLASSI[r.classe]),
                  h("td", { class: "num" }, numero(r.kpm)),
                  h("td", { class: "num" }, Number.isFinite(r.colpi) && r.colpi ? String(r.colpi) : "–"),
                  h("td", { class: "piccolo" }, r.parte || ""),
                ),
              ),
            ),
          ),
        ),
        h("p", { class: "tenue piccolo" }, "Stime del nostro modello con i dati del gioco: punteggi da 0 a 10, uccisioni al minuto e colpi per abbattere ogni nemico (solo per le armi in mano). ", h("a", { href: "#/teoria" }, "Come calcoliamo")),
      );
    };
    disegna();
    return h("section", null, h("h2", null, "Contro i nemici"), h("div", { class: "pannello" }, zona));
  }

  // Tutti i numeri degli attacchi, come nella sezione "Detailed Weapon Statistics" della wiki
  const TIPI_SCHEDA = { arma: "Arma", stratagemma: "Stratagemma", proiettile: "Proiettile", esplosione: "Esplosione", raggio: "Raggio", arco: "Arco elettrico", getto: "Getto", colpo: "Colpo", effetto: "Effetto" };

  function datiCompleti(d) {
    if (!d?.schede?.length) return null;
    const posto = new Map(d.schede.map((x, i) => [x.id, i]));
    const nomeScheda = (x) => String(x.titolo || x.id).replace(/_/g, " ");
    const schede = [];
    const valore = (r) => {
      if (r[2] === "ap") return r[0] === "Corazza" ? grado(r[1], "AV") : [grado(r[1]), ` ${nomeGrado(r[1])}`];
      if (r[2] === "rif") {
        const i = posto.get(r[1]);
        if (i == null) return String(r[1]).replace(/_/g, " ");
        return h("a", { href: "#", onclick: (e) => (e.preventDefault(), schede[i]?.scrollIntoView({ behavior: "smooth", block: "start" })) }, nomeScheda(d.schede[i]));
      }
      return r[1];
    };
    for (const x of d.schede) {
      schede.push(
        h(
          "div",
          { class: `pannello scheda-dati livello-${Math.min(x.livello || 0, 3)}` },
          h("div", { class: "testa-scheda" }, h("b", null, nomeScheda(x)), h("span", { class: "tipo" }, TIPI_SCHEDA[x.tipo] || x.tipo)),
          x.righe.length ? h("dl", { class: "scheda" }, x.righe.map((r) => (r.s ? h("dt", { class: "sotto" }, r.s) : [h("dt", null, r[0]), h("dd", null, valore(r))]))) : h("p", { class: "tenue piccolo" }, "Nessun numero in più."),
        ),
      );
    }
    return h(
      "section",
      null,
      h("h2", null, `Tutti i dati del gioco · ${d.schede.length} ${d.schede.length === 1 ? "scheda" : "schede"}`),
      h("p", { class: "tenue piccolo" }, `Come nella sezione «Detailed Weapon Statistics» della wiki${d.versione ? `, dati della versione ${d.versione}` : ""}. Una scheda per l'arma e una per ogni attacco: quelle rientrate partono dalla scheda sopra (per esempio l'esplosione di un proiettile). I nomi degli attacchi sono quelli dei dati del gioco.`),
      h("div", { class: "schede-dati" }, schede),
    );
  }

  function paginaOggetto(main, id) {
    const o = oggetto(id);
    if (!o) return nonTrovato(main, "Oggetto");
    const categoria = CATEGORIE.find((k) => k.slot === o.slot);
    const tipo = o.slot === "stratagemma" ? PB.NOMI_TIPO[o.tipo] || o.tipo : o.tipo;
    const ap = perforazioneDi(o);
    const etichetta = etichettaGioco(o);
    const conPassiva = o.slot === "armatura" ? armature().filter((a) => a.passivaId === o.id) : [];
    const usata = stato.build.filter((b) => window.Elenco.oggettiDi(b).includes(o.id));
    monta(
      main,
      indietro(categoria ? `#/wiki/${categoria.id}` : "#/wiki", categoria ? categoria.nome : "Wiki"),
      capo(
        h("span", { class: "foto-grande oggetto" }, G.iconaOggetto(o, { titolo: false })),
        o.nome,
        [o.slot === "armatura" ? "Passiva dell'armatura" : PB.NOMI_POSTO[o.slot], tipo, o.fonte ? `da ${o.fonte}` : null].filter(Boolean).join(" · "),
        o.codice?.length ? h("div", { class: "codice", "aria-label": `Codice: ${o.codice.join(" ")}` }, o.codice.map((c) => h("span", null, PB.FRECCE[c] || "?"))) : null,
      ),
      o.descrizione ? h("p", { class: "descrizione-wiki" }, o.descrizione) : null,
      o.effetto && normale(o.effetto) !== normale(o.descrizione) ? h("div", { class: "pannello effetto" }, h("b", null, "Effetto: "), o.effetto) : null,
      o.tratti?.length ? h("div", { class: "tratti" }, o.tratti.map((t) => h("span", null, t))) : null,
      ap != null && o.combattimento?.colpi?.length
        ? h(
            "div",
            { class: "pannello perforazione" },
            h("b", null, "Perforazione: "),
            grado(ap),
            ` ${nomeGrado(ap)}`,
            etichetta ? h("span", { class: "tenue" }, ` · in gioco: «${etichetta}»`) : null,
            h("div", { class: "tenue piccolo" }, `Buca a danno pieno le corazze fino a ${ap - 1}, al 65% quelle da ${ap}. `, h("a", { href: "#/wiki/meccaniche" }, "Gradi di perforazione")),
          )
        : null,
      PB.scheda(o) ? h("section", null, h("h2", null, "Scheda"), h("div", { class: "pannello" }, PB.scheda(o))) : null,
      o.combattimento?.colpi?.length ? h("section", null, h("h2", null, "Attacchi (dati del gioco)"), h("div", { class: "pannello" }, tabellaColpi(o))) : null,
      controNemici(o),
      struttureDistrutte(o),
      conPassiva.length
        ? h(
            "section",
            null,
            h("h2", null, `Armature con questa passiva · ${conPassiva.length}`),
            h("div", null, conPassiva.map((a) => rigaArmatura(a))),
          )
        : null,
      usata.length ? h("section", null, h("h2", null, "Build che lo usano"), h("div", { class: "pannello" }, usata.map((b, i) => [i ? ", " : "", h("a", { href: `#/build/${b.id}` }, b.nome)]))) : null,
      zonaTesti("oggetto", o.id, (v) => [
        v.ottenimento
          ? h(
              "section",
              null,
              h("h2", null, "Come si ottiene"),
              h("div", { class: "pannello" }, dati([["Da", v.ottenimento.fonte], ["Livello", v.ottenimento.livello], ["Costo", v.ottenimento.costo]])),
            )
          : null,
        v.anatomia?.length ? [h("h2", null, "Anatomia"), h("div", { class: "pannello" }, tabellaAnatomia(v.anatomia))] : null,
        datiCompleti(v.dati),
        sezioniWiki(v),
        patch(v),
      ]),
      fonte(o.pagina),
    );
  }

  // --- Armature, elmi, mantelli ---

  function protezioneTesto(a) {
    if (a.protezione == null) return "–";
    return a.base != null && a.protezione > a.base ? `${a.protezione} (${a.base} + ${a.protezione - a.base})` : String(a.protezione);
  }

  function rigaArmatura(a) {
    return h(
      "a",
      { class: "riga riga-wiki", href: `#/wiki/armatura/${a.id}` },
      foto(a),
      h("div", { class: "testo" }, h("div", { class: "nome" }, a.nome), h("div", { class: "autore" }, [PESI[a.peso], a.passiva].filter(Boolean).join(" · "))),
      h(
        "div",
        { class: "valori" },
        h("span", { title: "Protezione (base + passiva)" }, `🛡 ${protezioneTesto(a)}`),
        a.protezione != null ? h("span", { title: "Danno subito sul petto, rispetto al colpo" }, `petto ${percento(dannoSubito(a.protezione, "petto"))}`) : null,
        a.velocita != null ? h("span", { title: "Velocità" }, `➜ ${a.velocita}`) : null,
      ),
    );
  }

  function elencoArmature(main, scheda) {
    const filtri = { peso: "tutte", testo: "", ordine: "protezione", ...leggiLocale("it-wiki-armature", {}) };
    const cerca = h("input", { type: "search", placeholder: "Cerca un'armatura o una passiva", value: filtri.testo, "aria-label": "Cerca" });
    const ordine = h("select", { "aria-label": "Ordina" }, h("option", { value: "protezione" }, "Per protezione"), h("option", { value: "velocita" }, "Per velocità"), h("option", { value: "nome" }, "Per nome"));
    ordine.value = filtri.ordine;
    const barra = h("div");
    const elenco = h("div");
    const ridisegna = () => {
      scriviLocale("it-wiki-armature", filtri);
      barra.replaceChildren(chips([["tutte", "Tutte"], ["leggera", "Leggere"], ["media", "Medie"], ["pesante", "Pesanti"]], filtri.peso, (v) => ((filtri.peso = v), ridisegna())));
      const q = normale(filtri.testo);
      const scelti = armature().filter((a) => (filtri.peso === "tutte" || a.peso === filtri.peso) && (!q || normale(`${a.nome} ${a.passiva || ""}`).includes(q)));
      if (filtri.ordine === "nome") scelti.sort((a, b) => a.nome.localeCompare(b.nome));
      else if (filtri.ordine === "velocita") scelti.sort((a, b) => (b.velocita ?? 0) - (a.velocita ?? 0) || a.nome.localeCompare(b.nome));
      else scelti.sort((a, b) => (b.protezione ?? 0) - (a.protezione ?? 0) || a.nome.localeCompare(b.nome));
      elenco.replaceChildren(...(scelti.length ? scelti.map(rigaArmatura) : [h("div", { class: "vuoto" }, "Nessuna armatura con questi filtri.")]));
    };
    cerca.addEventListener("input", () => ((filtri.testo = cerca.value), ridisegna()));
    ordine.addEventListener("change", () => ((filtri.ordine = ordine.value), ridisegna()));
    // Riassunto: quante armature per ogni valore di protezione, divise per peso
    const gruppi = new Map();
    for (const a of armature()) {
      const k = `${a.peso}|${a.protezione}`;
      gruppi.set(k, (gruppi.get(k) || 0) + 1);
    }
    const riassunto = h(
      "div",
      { class: "scorre" },
      h(
        "table",
        { class: "tabella compatta" },
        h("thead", null, h("tr", null, h("th", null, "Peso"), h("th", { class: "num", title: "Protezione" }, "Prot."), h("th", { class: "num", title: "Quante armature" }, "Quante"), h("th", { class: "num" }, "Testa"), h("th", { class: "num" }, "Petto"), h("th", { class: "num", title: "Braccia e gambe" }, "Arti"))),
        h(
          "tbody",
          null,
          [...gruppi.entries()]
            .map(([k, quante]) => ({ peso: k.split("|")[0], protezione: Number(k.split("|")[1]), quante }))
            .sort((a, b) => ["leggera", "media", "pesante"].indexOf(a.peso) - ["leggera", "media", "pesante"].indexOf(b.peso) || a.protezione - b.protezione)
            .map((g) =>
              h(
                "tr",
                null,
                h("td", null, PESI[g.peso]),
                h("td", { class: "num" }, String(g.protezione)),
                h("td", { class: "num" }, String(g.quante)),
                h("td", { class: "num" }, percento(dannoSubito(g.protezione, "testa"))),
                h("td", { class: "num" }, percento(dannoSubito(g.protezione, "petto"))),
                h("td", { class: "num" }, percento(dannoSubito(g.protezione, "braccia"))),
              ),
            ),
        ),
      ),
    );
    monta(
      main,
      indietro("#/wiki", "Wiki"),
      h("h1", { style: "margin:6px 0 10px" }, "Armature"),
      h("div", { class: "pannello testo-lungo", style: "margin-bottom:12px" }, h("p", null, "Danno che subisci rispetto al colpo, per ogni livello di protezione (100 = il danno del colpo, sotto 100% ne pari una parte, sopra 100% ne prendi di più). La protezione può comprendere quella della passiva: per esempio 150 (100 + 50) è un'armatura media con Extra Padding."), riassunto, h("p", { class: "tenue piccolo" }, "Le parti del corpo hanno un loro moltiplicatore (testa ×1,5, braccia e gambe ×0,85); sulla testa l'armatura conta solo sopra 100. ", h("a", { href: "#/wiki/meccaniche/armatura" }, "Tutti i dettagli"))),
      chips(
        [
          ["corpo", "Per il corpo"],
          ["elmi", "Elmi"],
          ["mantelli", "Mantelli"],
        ],
        scheda || "corpo",
        (v) => (location.hash = v === "corpo" ? "#/wiki/armature" : `#/wiki/${v}`),
      ),
      h("div", { style: "height:10px" }),
      h("div", { class: "filtri" }, cerca, ordine),
      barra,
      h("div", { style: "height:10px" }),
      elenco,
    );
    ridisegna();
  }

  function elencoEstetici(main, quale, id) {
    const elmi = quale === "elmi";
    const voci = (elmi ? stato.catalogo.elmi : stato.catalogo.mantelli) || [];
    const cerca = h("input", { type: "search", placeholder: elmi ? "Cerca un elmo" : "Cerca un mantello", "aria-label": "Cerca" });
    const elenco = h("div");
    const conArmatura = (v) => (elmi && v.vista === "set" ? armature().find((a) => a.nome === v.nome) : null);
    const riga = (v) => {
      const armatura = conArmatura(v);
      return h(
        "details",
        { class: "estetico", open: v.id === id, dataset: { id: v.id } },
        h(
          "summary",
          { class: "riga riga-wiki" },
          foto(v, "icona", { testa: true, vuota: elmi ? "⛑" : "▼" }),
          h("div", { class: "testo" }, h("div", { class: "nome" }, v.nome), h("div", { class: "autore" }, [v.fonte, v.tipoFonte && !["Warbond", v.fonte].includes(v.tipoFonte) ? v.tipoFonte : null].filter(Boolean).join(" · ") || "–")),
          h("div", { class: "valori" }, costoTesto(v.costo) ? h("span", null, costoTesto(v.costo)) : null),
        ),
        h(
          "div",
          { class: "dettaglio-estetico" },
          v.icona ? h("img", { class: v.vista === "set" ? "set" : "", src: `/icone/${v.icona}`, alt: v.nome, loading: "lazy", decoding: "async" }) : null,
          h(
            "div",
            null,
            dati([
              ["Da", v.fonte],
              ["Tipo", v.tipoFonte !== v.fonte ? v.tipoFonte : null],
              ["Costo", costoTesto(v.costo)],
            ]),
            armatura ? h("p", { class: "tenue piccolo" }, "Nell'immagine l'elmo è indossato con l'armatura dello stesso set: ", h("a", { href: `#/wiki/armatura/${armatura.id}` }, armatura.nome), ".") : null,
            !v.icona ? h("p", { class: "tenue piccolo" }, v.immagineVietata ? "Sulla wiki c'è solo un disegno di un utente che chiede di usarlo solo lì: per rispetto non lo mostriamo." : "Sulla wiki non c'è un'immagine.") : null,
          ),
        ),
      );
    };
    const ridisegna = () => {
      const q = normale(cerca.value);
      const scelti = voci.filter((v) => !q || normale(`${v.nome} ${v.fonte || ""}`).includes(q));
      elenco.replaceChildren(...(scelti.length ? scelti.map(riga) : [h("div", { class: "vuoto" }, "Niente con questo nome.")]));
    };
    cerca.addEventListener("input", ridisegna);
    const senza = voci.filter((v) => !v.icona).length;
    monta(
      main,
      indietro("#/wiki/armature", "Armature"),
      h("h1", { style: "margin:6px 0 10px" }, elmi ? `Elmi · ${voci.length}` : `Mantelli · ${voci.length}`),
      h(
        "div",
        { class: "pannello testo-lungo", style: "margin-bottom:12px" },
        elmi
          ? h("p", null, "Gli elmi non cambiano niente: valgono 100 per protezione, velocità e stamina, tutti uguali. La testa però è protetta dall'armatura del corpo: se il corpo ha più di 100 di protezione, anche i colpi alla testa fanno meno danni. ", h("a", { href: "#/wiki/meccaniche/armatura" }, "Come funziona"))
          : h("p", null, "I mantelli sono solo estetici: in gioco mostrano dei valori, ma non cambiano protezione, velocità o stamina."),
        h("p", { class: "tenue piccolo" }, `Tocca una riga per vedere l'immagine più grande. Le immagini sono quelle ufficiali del gioco caricate sulla wiki${elmi ? " (per molti elmi c'è solo quella del set completo nell'armeria)" : ""}.${senza ? ` ${senza} senza immagine: sulla wiki ci sono solo disegni di un utente che chiede di usarli solo lì.` : ""}`),
      ),
      chips(
        [
          ["corpo", "Per il corpo"],
          ["elmi", "Elmi"],
          ["mantelli", "Mantelli"],
        ],
        quale,
        (v) => (location.hash = v === "corpo" ? "#/wiki/armature" : `#/wiki/${v}`),
      ),
      h("div", { style: "height:10px" }),
      h("div", { class: "filtri", style: "grid-template-columns:1fr" }, cerca),
      elenco,
    );
    ridisegna();
    if (id) requestAnimationFrame(() => elenco.querySelector(`details[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center" }));
  }

  function paginaArmatura(main, id) {
    const a = armatura(id);
    if (!a) return nonTrovato(main, "Armatura");
    const passiva = a.passivaId ? oggetto(a.passivaId) : null;
    const parti = [
      ["testa", "Testa"],
      ["petto", "Petto"],
      ["braccia", "Braccia"],
      ["gambe", "Gambe"],
    ];
    const salute = stato.catalogo.meccaniche?.armatura?.salute || 125;
    const esplosioni = stato.catalogo.meccaniche?.armatura?.esplosioni ?? 0.5;
    const stessa = armature().filter((x) => x.id !== a.id && x.protezione === a.protezione && x.peso === a.peso).length;
    monta(
      main,
      indietro("#/wiki/armature", "Armature"),
      capo(
        foto(a, "foto-grande"),
        a.nome,
        [`Armatura ${PESI[a.peso]?.toLowerCase()}`, a.fonte ? `da ${a.fonte}` : null, costoTesto(a.costo)].filter(Boolean).join(" · "),
        dati([
          ["Protezione", protezioneTesto(a)],
          ["Velocità", a.velocita],
          ["Stamina", a.stamina != null ? `${a.stamina} (rigenerazione)` : null],
          ["Passiva", passiva ? h("a", { href: `#/wiki/oggetto/${passiva.id}` }, a.passiva) : a.passiva],
        ]),
      ),
      a.descrizione ? h("p", { class: "descrizione-wiki" }, a.descrizione) : null,
      passiva?.effetto ? h("div", { class: "pannello effetto" }, h("b", null, `${passiva.nome}: `), passiva.effetto) : null,
      a.protezione != null
        ? h(
            "section",
            null,
            h("h2", null, "Danno che subisci"),
            h(
              "div",
              { class: "pannello" },
              h(
                "table",
                { class: "tabella" },
                h("thead", null, h("tr", null, h("th", null, "Parte"), h("th", { class: "num" }, "Danno subito"), h("th", { class: "num", title: "Rispetto a un'armatura da 100" }, "Rispetto a 100"), h("th", { class: "num", title: `Danno da prendere per finire a terra, con ${salute} di salute` }, "Salute effettiva"))),
                h(
                  "tbody",
                  null,
                  parti.map(([k, nome]) => {
                    const d = dannoSubito(a.protezione, k);
                    const rif = dannoSubito(100, k);
                    return h("tr", null, h("td", null, nome), h("td", { class: "num" }, percento(d, 1)), h("td", { class: "num" }, `${d <= rif ? "−" : "+"}${numero(Math.abs(d / rif - 1) * 100, 1)}%`), h("td", { class: "num" }, numero(salute / d, 0)));
                  }),
                ),
              ),
              h(
                "p",
                { class: "tenue piccolo" },
                `Danno subito = danno del colpo × moltiplicatore della parte × fattore della protezione ${a.protezione} (${numero(fattore(a.protezione), 3)}; sulla testa ${numero(fattore(a.protezione, true), 3)}). Le esplosioni fanno ×${numero(esplosioni, 2)} ai Helldiver, e Fortified dimezza ancora. ${stessa ? `${stessa === 1 ? "Un'altra armatura" : `Altre ${stessa} armature`} ${(stessa === 1 ? PESI : PESI_PLURALE)[a.peso].toLowerCase()} ${stessa === 1 ? "ha" : "hanno"} la stessa protezione.` : ""} `,
                h("a", { href: "#/wiki/meccaniche/armatura" }, "Come funziona"),
              ),
            ),
          )
        : null,
      zonaTesti("armatura", a.id, (v) => [sezioniWiki(v), patch(v)]),
      fonte(a.pagina),
    );
  }

  // --- Strutture ---

  const FAZIONI_STRUTTURE = [
    ["tutte", "Di tutte le fazioni", null],
    ["terminidi", "Terminidi", null],
    ["automi", "Automi", null],
    ["illuminati", "Illuminati", null],
    ["superterra", "Super Terra", "Strutture vostre (mura delle colonie, cancelli, generatori, edifici delle megacittà): si rompono anche per sbaglio, con la stessa forza."],
  ];
  const GRUPPI_DEMOLIZIONE = ["Armi primarie", "Armi secondarie", "Granate", "Armi di supporto", "Zaini", "Aquile", "Orbitali", "Torrette", "Postazioni", "Veicoli", "Altri stratagemmi", "Dalla missione"];
  const PLURALI_TIPO = { arma: "Armi di supporto", zaino: "Zaini", aquila: "Aquile", orbitale: "Orbitali", torretta: "Torrette", postazione: "Postazioni", veicolo: "Veicoli" };
  // Fonti della tabella della wiki che non sono nel catalogo: cose della missione o del pianeta
  const FONTI_MISSIONE = {
    "NUX-223 Hellbomb": "la Hellbomb degli obiettivi",
    Hellpod: "un Hellpod che atterra (rinforzi e stratagemmi)",
    "SEAF Artillery": "l'artiglieria SEAF",
    "SEAF SAM Site": "la postazione antiaerea SEAF",
    "Planetary Defense Cannon": "il cannone di difesa planetaria",
    "Ground All-Terrain Extraction Rig (GATER)": "il GATER",
  };
  // Dalla pagina Demolition e dalle pagine delle strutture della wiki
  const SALUTE = "Ha anche salute (corazza 2, tutta durevole): si abbatte anche a forza di danni, per esempio con le armi anticarro.";
  const NOTE_STRUTTURE = {
    "Spore Spewer": SALUTE,
    "Shrieker Nest Tower": SALUTE,
    "Fabricator (Outer)": "Le fabbriche hanno anche salute e corazza: le armi anticarro le distruggono, con più colpi.",
    "Bulk Fabricator (Outer)": "Le fabbriche hanno anche salute e corazza: le armi anticarro le distruggono, con più colpi.",
    "Grounded Warp Ship (Outer)": "Ha anche salute e corazza: le armi anticarro la distruggono, con più colpi.",
  };

  function gruppoDemolizione(o) {
    if (o.slot === "primaria") return "Armi primarie";
    if (o.slot === "secondaria") return "Armi secondarie";
    if (o.slot === "granata") return "Granate";
    if (o.slot === "stratagemma") return PLURALI_TIPO[o.tipo] || "Altri stratagemmi";
    return null;
  }

  // Chi distrugge una struttura, per gruppo: gli oggetti del catalogo (con l'attacco
  // migliore) e le fonti della missione
  function chiDemolisce(s) {
    const c = stato.catalogo;
    const gruppi = new Map();
    const metti = (gruppo, voce) => gruppi.set(gruppo, [...(gruppi.get(gruppo) || []), voce]);
    for (const o of c.oggetti) {
      const gruppo = gruppoDemolizione(o);
      const d = gruppo && M.demolizione(o, s, c);
      if (d) metti(gruppo, { nome: o.nome, href: `#/wiki/oggetto/${o.id}`, ...d, diretto: colpoDiretto(o, d, c) });
    }
    const missione = new Map();
    for (const d of c.demolizioni || []) {
      if (d.id || d.forza < s.forza || (s.balistica && !d.esplosiva)) continue;
      const prima = missione.get(d.nome);
      if (!prima || d.forza > prima.forza) missione.set(d.nome, { ...d, descr: FONTI_MISSIONE[d.nome] || null });
    }
    if (missione.size) gruppi.set("Dalla missione", [...missione.values()]);
    for (const l of gruppi.values()) l.sort((a, b) => Number(a.situazionale) - Number(b.situazionale) || a.nome.localeCompare(b.nome));
    return GRUPPI_DEMOLIZIONE.filter((g) => gruppi.has(g)).map((g) => [g, gruppi.get(g)]);
  }

  const PARTICOLARE = "solo in casi particolari: quando l'oggetto esplode, si sovraccarica o viene distrutto";
  const DIRETTO = "solo con un colpo diretto: è la forza del proiettile, l'esplosione ne ha meno";

  // L'oggetto ha esplosioni, ma la forza che basta è quella del proiettile (colpo diretto)
  function colpoDiretto(o, d, c) {
    return !d.esplosiva && !d.situazionale && M.fontiDemolizione(o, c).some((f) => f.esplosiva && !f.situazionale);
  }

  function chipDemolizione(v) {
    const titolo = [v.descr, v.attacco ? `attacco: ${v.attacco}` : null, `forza ${v.forza}${v.esplosiva ? ", esplosione" : ""}`, v.situazionale ? PARTICOLARE : null, v.diretto ? DIRETTO : null].filter(Boolean).join(" · ");
    const dentro = [v.nome, h("span", { class: "forza" }, String(v.forza)), v.situazionale ? h("span", { class: "particolare" }, "*") : null, v.diretto ? h("span", { class: "particolare" }, "◎") : null];
    return v.href ? h("a", { class: "chip", href: v.href, title: titolo }, dentro) : h("span", { class: "chip", title: titolo }, dentro);
  }

  function schedaStruttura(s) {
    const gruppi = chiDemolisce(s);
    const quanti = gruppi.reduce((n, [, l]) => n + l.filter((v) => !v.situazionale).length, 0);
    return h(
      "details",
      { class: "struttura", open: quanti <= 24 },
      h(
        "summary",
        null,
        h("span", { class: "nome" }, s.nome),
        h("span", { class: "forza-struttura", title: "Forza di demolizione che serve" }, `forza ${s.forza}`),
        s.balistica ? h("span", { class: "serve-esplosione", title: "Serve un attacco esplosivo: i proiettili non bastano" }, "serve un'esplosione") : null,
        h("span", { class: "quanti" }, quanti === 1 ? "1 oggetto" : `${quanti} oggetti`),
      ),
      NOTE_STRUTTURE[s.nome] ? h("p", { class: "tenue piccolo" }, NOTE_STRUTTURE[s.nome]) : null,
      gruppi.length
        ? gruppi.map(([g, lista]) => h("div", { class: "gruppo-demolizione" }, h("div", { class: "tenue piccolo" }, `${g} · ${lista.length}`), h("div", { class: "chips avvolte" }, lista.map(chipDemolizione))))
        : h("p", { class: "tenue piccolo" }, "Nessun oggetto del catalogo ha abbastanza forza."),
    );
  }

  function paginaStrutture(main) {
    const strutture = stato.catalogo.strutture || [];
    monta(
      main,
      indietro("#/wiki", "Wiki"),
      h("h1", { style: "margin:6px 0 10px" }, "Strutture"),
      h(
        "div",
        { class: "pannello testo-lungo", style: "margin-bottom:12px" },
        h("p", null, "Per distruggere una struttura basta un solo attacco con ", h("b", null, "forza di demolizione"), " almeno pari alla sua (da 10 a 60). Perforazione e danno non contano."),
        h("p", null, "Alcune strutture (i buchi dei nidi, le prese d'aria delle fabbriche, la porta e lo scudo delle navi atterrate degli Illuminati) vogliono ", h("b", null, "anche"), " un'esplosione: lì un proiettile non basta, anche se ha la forza giusta. Per esempio il LAS-98 Laser Cannon ha forza 20 ma non chiude i buchi dei nidi. Per tutte le altre l'esplosione non serve: basta la forza."),
        h("p", null, "Sotto ogni struttura ci sono le armi e gli stratagemmi che ce la fanno, con la loro forza. Delle esplosioni conta il centro: nel raggio esterno la forza cala."),
        h("p", null, h("b", null, "◎"), " solo con un colpo diretto: l'oggetto esplode, ma la forza che basta è quella del proiettile (per esempio l'Eruptor: proiettile 30, esplosione 20). ", h("b", null, "*"), " solo in casi particolari, quando l'oggetto esplode, si sovraccarica o viene distrutto."),
        h("p", { class: "tenue piccolo" }, "Forze dai dati del gioco e dalla tabella della wiki. ", h("a", { href: "#/wiki/pagina/demolition" }, "Pagina della wiki (inglese)")),
      ),
      FAZIONI_STRUTTURE.map(([f, nome, nota]) => {
        const lista = strutture.filter((s) => s.fazione === f).sort((a, b) => a.forza - b.forza || a.nome.localeCompare(b.nome));
        if (!lista.length) return null;
        return h("section", null, h("h2", null, nome), nota ? h("p", { class: "tenue piccolo" }, nota) : null, lista.map(schedaStruttura));
      }),
    );
  }

  // Nella pagina di un oggetto: le strutture che distrugge
  function struttureDistrutte(o) {
    const c = stato.catalogo;
    const strutture = c.strutture || [];
    const fonti = M.fontiDemolizione(o, c);
    if (!strutture.length || !fonti.length) return null;
    const elenco = strutture.map((s) => ({ s, d: M.demolizione(o, s, c) })).filter((x) => x.d);
    const normali = fonti.filter((f) => !f.situazionale);
    const migliore = (l) => l.reduce((m, f) => (!m || f.forza > m.forza || (f.forza === m.forza && f.esplosiva) ? f : m), null);
    const massima = migliore(normali.length ? normali : fonti);
    const esplosione = migliore(normali.filter((f) => f.esplosiva));
    const quante = elenco.filter((x) => !x.d.situazionale).length;
    const forzaTesto = massima.esplosiva
      ? `${massima.forza}, con un'esplosione`
      : esplosione
        ? `${massima.forza} con un colpo diretto; l'esplosione arriva a ${esplosione.forza}`
        : `${massima.forza}, senza esplosioni (non basta per le strutture che vogliono un'esplosione)`;
    return h(
      "section",
      null,
      h("h2", null, `Strutture che distrugge · ${quante} su ${strutture.length}`),
      h(
        "div",
        { class: "pannello" },
        h("p", { class: "piccolo", style: "margin-top:0" }, `Forza di demolizione massima: ${forzaTesto}${massima.situazionale ? ` (${PARTICOLARE})` : ""}.`),
        elenco.length
          ? FAZIONI_STRUTTURE.map(([f, nome]) => {
              const qui = elenco.filter((x) => x.s.fazione === f).sort((a, b) => a.s.forza - b.s.forza || a.s.nome.localeCompare(b.s.nome));
              if (!qui.length) return null;
              return h(
                "div",
                { class: "gruppo-demolizione" },
                h("div", { class: "tenue piccolo" }, nome),
                h(
                  "div",
                  { class: "chips avvolte" },
                  qui.map(({ s, d }) => {
                    const diretto = colpoDiretto(o, d, c);
                    return h("a", { class: "chip", href: "#/wiki/strutture", title: [`serve forza ${s.forza}${s.balistica ? " e un'esplosione" : ""}`, d.situazionale ? PARTICOLARE : null, diretto ? DIRETTO : null].filter(Boolean).join(" · ") }, s.nome, h("span", { class: "forza" }, String(s.forza)), d.situazionale ? h("span", { class: "particolare" }, "*") : null, diretto ? h("span", { class: "particolare" }, "◎") : null);
                  }),
                ),
              );
            })
          : h("p", { class: "tenue piccolo" }, "Non ha abbastanza forza per nessuna struttura."),
        h("p", { class: "tenue piccolo" }, "◎ solo con un colpo diretto del proiettile; * solo in casi particolari. ", h("a", { href: "#/wiki/strutture" }, "Tutte le strutture e chi le distrugge")),
      ),
    );
  }

  // --- Pagine della wiki sulle meccaniche (in inglese) ---

  function paginaWiki(main, id) {
    const p = (stato.catalogo.meccaniche?.pagine || []).find((x) => x.id === id);
    if (!p) return nonTrovato(main, "Pagina");
    monta(
      main,
      indietro("#/wiki/meccaniche", "Meccaniche del gioco"),
      h("h1", { style: "margin:6px 0 4px" }, p.titolo),
      h("p", { class: "tenue piccolo" }, "La pagina della wiki, in inglese, così com'è. La spiegazione in italiano è in ", h("a", { href: "#/wiki/meccaniche" }, "Meccaniche del gioco"), "."),
      zonaTesti("pagina", id, (v) => [sezioniWiki(v), patch(v)]),
      fonte(p.titolo),
    );
  }

  // --- Navigazione ---

  vista("wiki", (main, sezione, id) => {
    if (!sezione) return home(main);
    if (sezione === "nemici") return elencoNemici(main);
    if (sezione === "nemico") return paginaNemico(main, id);
    if (sezione === "oggetto") return paginaOggetto(main, id);
    if (sezione === "armature") return elencoArmature(main, "corpo");
    if (sezione === "elmi" || sezione === "mantelli") return elencoEstetici(main, sezione, id);
    if (sezione === "armatura") return paginaArmatura(main, id);
    if (sezione === "strutture") return paginaStrutture(main);
    if (sezione === "pagina") return paginaWiki(main, id);
    if (sezione === "meccaniche") return window.Meccaniche.disegna(main, id);
    const categoria = CATEGORIE.find((k) => k.id === sezione && k.slot);
    if (categoria) return elencoOggetti(main, categoria);
    return nonTrovato(main, "Sezione");
  });

  window.Wiki = { nomeGrado, grado, perforazioneDi, etichettaGioco, colpiPiatti, dannoSubito, fattore, percento, disegnaBlocchi, indietro, chips, dati, PESI, CLASSI, DIFFICOLTA };
})();
