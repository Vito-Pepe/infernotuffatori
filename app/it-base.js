// Base dell'app: elementi, dati dal Pi, navigazione, finestre e messaggi.
(function () {
  "use strict";

  // --- Elementi ---

  const PROPRIETA = new Set(["value", "checked", "disabled", "selected", "open"]);

  function h(tag, props, ...figli) {
    const el = document.createElement(tag);
    imposta(el, props);
    aggiungi(el, figli);
    return el;
  }

  function s(tag, props, ...figli) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    imposta(el, props);
    aggiungi(el, figli);
    return el;
  }

  function imposta(el, props) {
    if (!props) return;
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      // Gli stili passano dal CSSOM: la Content-Security-Policy blocca l'attributo style
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (PROPRIETA.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }

  function aggiungi(el, figli) {
    figli.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      el.append(c instanceof Node ? c : String(c));
    });
  }

  // Come el.append, ma salta i null (che append scriverebbe come testo "null")
  function monta(el, ...figli) {
    aggiungi(el, figli);
    return el;
  }

  // --- Memoria del browser: solo comodità (la bozza della build che si sta facendo) ---

  function leggiLocale(chiave, predefinito) {
    try {
      const v = localStorage.getItem(chiave);
      return v ? JSON.parse(v) : predefinito;
    } catch {
      return predefinito;
    }
  }

  function scriviLocale(chiave, valore) {
    try {
      if (valore == null) localStorage.removeItem(chiave);
      else localStorage.setItem(chiave, JSON.stringify(valore));
    } catch {
      // senza memoria si perde solo la bozza
    }
  }

  // --- Dati sul Pi ---

  async function chiama(metodo, percorso, corpo) {
    const r = await fetch(`/api/${percorso}`, {
      method: metodo,
      headers: corpo !== undefined ? { "Content-Type": "application/json" } : {},
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    let json = null;
    try {
      json = await r.json();
    } catch {
      // risposta vuota
    }
    if (!r.ok) throw Object.assign(new Error(json?.errore || `Errore ${r.status}`), { stato: r.status });
    return json;
  }

  const stato = {
    io: { login: null },
    catalogo: { oggetti: [], nemici: [] },
    indice: new Map(),
    build: [],
    ordine: { terminidi: [], automi: [], illuminati: [] },
    aggiornamento: null,
  };

  function usaCatalogo(c) {
    stato.catalogo = c;
    stato.indice = new Map(c.oggetti.map((o) => [o.id, o]));
  }

  async function caricaBuild() {
    const r = await chiama("GET", "build");
    stato.build = r.build;
    stato.ordine = r.ordine;
  }

  async function carica() {
    const [io, catalogo] = await Promise.all([chiama("GET", "io"), chiama("GET", "catalogo"), caricaBuild()]);
    stato.io = io;
    usaCatalogo(catalogo);
    chiama("GET", "aggiornamento").then((a) => (stato.aggiornamento = a)).catch(() => {});
  }

  function oggetto(id) {
    return (id && stato.indice.get(id)) || null;
  }

  function buildDa(id) {
    return stato.build.find((b) => b.id === id) || null;
  }

  function puoModificare(b) {
    return Boolean(stato.io.login && (stato.io.amministratore || b.autore?.login === stato.io.login));
  }

  // --- Messaggi ---

  function avviso(testo, tipo = "") {
    let box = document.querySelector(".messaggi");
    if (!box) document.body.append((box = h("div", { class: "messaggi", role: "status", "aria-live": "polite" })));
    const m = h("div", { class: `messaggio ${tipo}` }, testo);
    box.append(m);
    setTimeout(() => m.remove(), tipo === "errore" ? 6000 : 3200);
  }

  // --- Finestra (scelta di un oggetto, conferme) ---

  function finestra({ titolo, contenuto, strumenti, alChiudere }) {
    const prima = document.activeElement;
    const chiudi = () => {
      velo.remove();
      document.removeEventListener("keydown", tasto);
      document.body.style.overflow = "";
      if (prima && prima.focus) prima.focus();
      if (alChiudere) alChiudere();
    };
    const tasto = (e) => e.key === "Escape" && chiudi();
    const pulsanteChiudi = h("button", { class: "chiudi", type: "button", "aria-label": "Chiudi", onclick: chiudi }, "×");
    const corpo = h("div", { class: "corpo" }, contenuto);
    const velo = h(
      "div",
      { class: "velo", onclick: (e) => e.target === velo && chiudi() },
      h("div", { class: "finestra", role: "dialog", "aria-modal": "true", "aria-label": titolo }, h("div", { class: "capo" }, h("h1", null, titolo), pulsanteChiudi), strumenti ? h("div", { class: "strumenti" }, strumenti) : null, corpo),
    );
    document.body.append(velo);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", tasto);
    pulsanteChiudi.focus();
    return { chiudi, corpo };
  }

  function conferma(testo, si = "Sì") {
    return new Promise((ok) => {
      let risposta = false;
      const f = finestra({
        titolo: "Conferma",
        contenuto: h(
          "div",
          null,
          h("p", null, testo),
          h(
            "div",
            { class: "pulsanti" },
            h("button", { class: "pulsante pericolo", type: "button", onclick: () => ((risposta = true), f.chiudi()) }, si),
            h("button", { class: "pulsante", type: "button", onclick: () => f.chiudi() }, "Annulla"),
          ),
        ),
        alChiudere: () => ok(risposta),
      });
    });
  }

  // --- Navigazione (#/percorso) ---

  const viste = {};
  let pulizia = null;

  function vista(nome, fn) {
    viste[nome] = fn;
  }

  function vai(percorso) {
    if (location.hash === `#${percorso}`) mostra();
    else location.hash = percorso;
  }

  function mostra() {
    const percorso = location.hash.replace(/^#/, "") || "/";
    const [, nome = "", ...argomenti] = percorso.split("/");
    const fn = viste[nome] || viste[""];
    if (pulizia) pulizia();
    pulizia = null;
    const main = document.querySelector("main");
    main.replaceChildren();
    document.querySelectorAll(".menu a").forEach((a) => a.classList.toggle("attiva", a.dataset.vista === (nome || "elenco")));
    window.scrollTo(0, 0);
    const risultato = fn(main, ...argomenti.map(decodeURIComponent));
    if (typeof risultato === "function") pulizia = risultato;
  }

  function data(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
  }

  function numero(x, cifre = 1) {
    if (x == null || Number.isNaN(x)) return "–";
    return Number(x).toLocaleString("it-IT", { maximumFractionDigits: cifre, minimumFractionDigits: 0 });
  }

  window.IT = { h, s, monta, chiama, stato, carica, caricaBuild, usaCatalogo, oggetto, buildDa, puoModificare, avviso, finestra, conferma, vista, vai, mostra, leggiLocale, scriviLocale, data, numero };
})();
