// Costruttore: nuova build, modifica, copia. Le metriche si aggiornano a ogni scelta.
(function () {
  "use strict";
  const { h, monta, stato, oggetto, buildDa, puoModificare, chiama, avviso, finestra, vista, vai, leggiLocale, scriviLocale, numero } = window.IT;
  const G = window.Grafica;
  const P = window.PaginaBuild;

  const TIPI_ARMI = {
    "Assault Rifles": "Fucili d'assalto",
    "Marksman Rifles": "Fucili di precisione",
    "Submachine Guns": "Mitragliette",
    Shotguns: "Fucili a pompa",
    Explosives: "Esplosivi",
    "Energy-Based": "A energia",
    Special: "Speciali",
    Pistols: "Pistole",
    Melee: "Mischia",
    Standard: "Standard",
  };
  const ORDINI = [
    ["nome", "Per nome"],
    ["leggero", "Contro i leggeri"],
    ["medio", "Contro i medi"],
    ["pesante", "Contro i pesanti"],
  ];

  function vuota(fazione = "terminidi") {
    return { nome: "", fazione, variante: null, primaria: null, secondaria: null, granata: null, stratagemmi: [null, null, null, null], armatura: { passiva: null, peso: "media" }, potenziamento: null, note: "" };
  }

  function categoria(o) {
    if (o.slot === "stratagemma") return P.NOMI_TIPO[o.tipo] || "Altro";
    if (o.slot === "armatura" || o.slot === "potenziamento") return null;
    return TIPI_ARMI[o.tipo] || o.tipo || "Altro";
  }

  // Finestra per scegliere un oggetto di un posto
  function scegli({ slot, titolo, attuale, fazione, esclusi = [], alla }) {
    const tutti = stato.catalogo.oggetti.filter((o) => o.slot === slot);
    const categorie = [...new Set(tutti.map(categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
    const pref = leggiLocale("it-scelta", {});
    let filtro = { testo: "", categoria: "tutte", ordine: pref.ordine || "nome" };
    const cerca = h("input", { type: "search", placeholder: "Cerca", "aria-label": "Cerca" });
    const ordine = h("select", { "aria-label": "Ordina" }, ORDINI.map(([v, n]) => h("option", { value: v }, n)));
    ordine.value = filtro.ordine;
    const chips = h("div", { class: "chips" });
    const griglia = h("div", { class: "scelte" });
    const misura = (o) => window.Metriche.potenza(o, stato.catalogo, fazione);
    const conFuoco = slot !== "armatura" && slot !== "potenziamento";

    const disegna = () => {
      chips.replaceChildren(
        ...(categorie.length > 1 ? ["tutte", ...categorie] : []).map((c) =>
          h("button", { type: "button", class: filtro.categoria === c ? "attivo" : "", onclick: () => ((filtro.categoria = c), disegna()) }, c === "tutte" ? "Tutte" : c),
        ),
      );
      const t = filtro.testo.trim().toLowerCase();
      let elenco = tutti.filter((o) => (filtro.categoria === "tutte" || categoria(o) === filtro.categoria) && (!t || `${o.nome} ${o.descrizione || ""} ${(o.tratti || []).join(" ")}`.toLowerCase().includes(t)));
      if (filtro.ordine !== "nome" && conFuoco) elenco = elenco.sort((a, b) => misura(b)[filtro.ordine] - misura(a)[filtro.ordine]);
      else elenco = elenco.sort((a, b) => a.nome.localeCompare(b.nome));
      griglia.replaceChildren(
        h("button", { type: "button", class: `scelta${!attuale ? " scelta-attuale" : ""}`, onclick: () => (alla(null), f.chiudi()) }, G.iconaOggetto(null), h("span", { class: "nome" }, "Nessuno")),
        ...elenco.map((o) => {
          const p = conFuoco ? misura(o) : null;
          const preso = esclusi.includes(o.id);
          return h(
            "button",
            { type: "button", class: `scelta${o.id === attuale ? " scelta-attuale" : ""}`, disabled: preso, title: preso ? "Già scelto in un altro posto" : o.descrizione || o.nome, onclick: () => (alla(o.id), f.chiudi()) },
            G.iconaOggetto(o, { titolo: false }),
            h("span", { class: "nome" }, o.nome),
            p && (p.leggero || p.medio || p.pesante)
              ? h(
                  "span",
                  { class: "minibarre", title: `Leggeri ${numero(p.leggero)} · Medi ${numero(p.medio)} · Pesanti ${numero(p.pesante)}` },
                  [
                    [p.leggero, "var(--leggeri)"],
                    [p.medio, "var(--medi)"],
                    [p.pesante, "var(--pesanti)"],
                  ].map(([v, c]) => h("i", null, h("b", { style: `height:${v * 10}%;background:${c}` }))),
                )
              : null,
            !conFuoco && o.descrizione ? h("span", { class: "descr" }, o.descrizione) : null,
            preso ? h("span", { class: "descr" }, "già scelto") : null,
          );
        }),
      );
    };
    cerca.addEventListener("input", () => ((filtro.testo = cerca.value), disegna()));
    ordine.addEventListener("change", () => {
      filtro.ordine = ordine.value;
      scriviLocale("it-scelta", { ordine: filtro.ordine });
      disegna();
    });
    const strumenti = [cerca, conFuoco ? h("div", { style: "display:flex;gap:8px" }, ordine) : null, chips];
    const f = finestra({ titolo, contenuto: griglia, strumenti });
    disegna();
    setTimeout(() => cerca.focus({ preventScroll: true }), 50);
  }

  function costruttore(main, { iniziale, id = null, chiaveBozza = null }) {
    const b = structuredClone(iniziale);
    const salvaBozza = () => chiaveBozza && scriviLocale(chiaveBozza, b);
    const analisi = h("div");
    const slots = h("div", { class: "slots" });
    const fazioni = h("div", { class: "fazioni", role: "group", "aria-label": "Fazione" });
    const peso = h("div", { class: "segmenti", role: "group", "aria-label": "Peso dell'armatura" });

    const aggiornaAnalisi = () => analisi.replaceChildren(P.pannelloAnalisi(b));

    const slot = (posto, etichetta, valore, imposta, extra = {}) => {
      const o = oggetto(valore);
      const apri = () =>
        scegli({
          slot: posto,
          titolo: etichetta,
          attuale: valore,
          fazione: b.fazione,
          esclusi: extra.esclusi || [],
          alla: (nuovo) => {
            imposta(nuovo);
            ridisegna();
          },
        });
      return h(
        "div",
        { class: "slot", role: "button", tabindex: 0, onclick: apri, onkeydown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), apri()) },
        G.iconaOggetto(o, { slot: posto }),
        h("div", { style: "min-width:0" }, h("div", { class: "etichetta" }, etichetta), h("div", { class: o ? "valore" : "valore tenue" }, o ? o.nome : "Scegli…")),
        o
          ? h(
              "button",
              {
                class: "togli",
                type: "button",
                "aria-label": `Togli ${o.nome}`,
                onclick: (e) => {
                  e.stopPropagation();
                  imposta(null);
                  ridisegna();
                },
              },
              "×",
            )
          : null,
      );
    };

    const ridisegna = () => {
      salvaBozza();
      fazioni.replaceChildren(
        ...["terminidi", "automi", "illuminati"].map((f) =>
          h("button", { type: "button", class: b.fazione === f ? "attiva" : "", "aria-pressed": String(b.fazione === f), onclick: () => ((b.fazione = f), ridisegna()) }, G.emblemaFazione(f, { class: "" }), G.FAZIONI[f].nome),
        ),
      );
      peso.replaceChildren(
        ...Object.entries(G.ARMATURE).map(([k, nome]) =>
          h("button", { type: "button", class: b.armatura.peso === k ? "attivo" : "", "aria-pressed": String(b.armatura.peso === k), onclick: () => ((b.armatura.peso = k), ridisegna()) }, nome),
        ),
      );
      slots.replaceChildren(
        slot("primaria", "Arma primaria", b.primaria, (v) => (b.primaria = v)),
        slot("secondaria", "Arma secondaria", b.secondaria, (v) => (b.secondaria = v)),
        slot("granata", "Granata", b.granata, (v) => (b.granata = v)),
        ...[0, 1, 2, 3].map((i) =>
          slot("stratagemma", `Stratagemma ${i + 1}`, b.stratagemmi[i], (v) => (b.stratagemmi[i] = v), { esclusi: b.stratagemmi.filter((x, j) => x && j !== i) }),
        ),
        slot("armatura", "Passiva dell'armatura", b.armatura.passiva, (v) => (b.armatura.passiva = v)),
        slot("potenziamento", "Potenziamento", b.potenziamento, (v) => (b.potenziamento = v)),
      );
      aggiornaAnalisi();
    };

    const nome = h("input", { type: "text", value: b.nome, maxlength: 60, placeholder: "Es. Tutto a fuoco", oninput: (e) => ((b.nome = e.target.value), salvaBozza()) });
    const note = h("textarea", { maxlength: 2000, placeholder: "Come si gioca, a che difficoltà, cosa evitare…", oninput: (e) => ((b.note = e.target.value), salvaBozza()) }, b.note || "");
    const salva = h("button", { class: "pulsante primo", type: "button", disabled: !stato.io.login }, id ? "Salva le modifiche" : "Salva la build");
    salva.addEventListener("click", async () => {
      salva.disabled = true;
      try {
        const corpo = { ...b, nome: b.nome.trim() || "Build senza nome" };
        const r = id ? await chiama("PUT", `build/${id}`, corpo) : await chiama("POST", "build", corpo);
        stato.build = [...stato.build.filter((x) => x.id !== r.id), r];
        const lista = stato.ordine[r.fazione] || [];
        for (const f of Object.keys(stato.ordine)) stato.ordine[f] = stato.ordine[f].filter((x) => x !== r.id);
        stato.ordine[r.fazione] = id && lista.includes(r.id) ? lista : [r.id, ...stato.ordine[r.fazione]];
        if (chiaveBozza) scriviLocale(chiaveBozza, null);
        avviso("Build salvata", "ok");
        vai(`/build/${r.id}`);
      } catch (e) {
        avviso(`Non salvata: ${e.message}`, "errore");
        salva.disabled = false;
      }
    });

    monta(main, 
      h("h1", { style: "margin-bottom:12px" }, id ? "Modifica la build" : "Nuova build"),
      stato.io.login ? null : h("div", { class: "avviso attenzione", style: "margin-bottom:12px" }, "Non so chi sei: per salvare apri l'app dal suo indirizzo Tailscale (https://…ts.net)."),
      fazioni,
      h("label", { class: "campo" }, h("span", null, "Nome"), nome),
      slots,
      h("div", { style: "margin-top:12px" }, h("div", { class: "etichetta tenue piccolo", style: "margin-bottom:4px;text-transform:uppercase;letter-spacing:.1em;font-weight:800" }, "Peso dell'armatura"), peso),
      h("label", { class: "campo", style: "margin-top:12px" }, h("span", null, "Note"), note),
      h("h2", null, "Analisi in diretta"),
      analisi,
      h(
        "div",
        { class: "barra-salva" },
        chiaveBozza ? h("button", { class: "pulsante", type: "button", onclick: () => (scriviLocale(chiaveBozza, null), window.IT.mostra()) }, "Ricomincia") : null,
        h("a", { class: "pulsante", href: id ? `#/build/${id}` : "#/" }, "Annulla"),
        salva,
      ),
    );
    ridisegna();
  }

  vista("nuova", (main, fazione) => {
    // Una build lasciata a metà su questo dispositivo riparte da dove era
    const bozza = leggiLocale("it-bozza", null);
    const iniziale = bozza && bozza.fazione ? { ...vuota(), ...bozza } : vuota(["terminidi", "automi", "illuminati"].includes(fazione) ? fazione : "terminidi");
    costruttore(main, { iniziale, chiaveBozza: "it-bozza" });
  });

  vista("modifica", (main, id) => {
    const b = buildDa(id);
    if (!b) return monta(main, h("div", { class: "vuoto" }, "Build non trovata."));
    if (!puoModificare(b)) return monta(main, h("div", { class: "vuoto" }, `Questa build è di ${b.autore?.nome}: puoi `, h("a", { href: `#/copia/${b.id}` }, "farne una copia"), "."));
    costruttore(main, { iniziale: { ...vuota(), ...b }, id: b.id });
  });

  vista("copia", (main, id) => {
    const b = buildDa(id);
    if (!b) return monta(main, h("div", { class: "vuoto" }, "Build non trovata."));
    const { id: _, autore, creata, aggiornata, modificataDa, ...resto } = b;
    costruttore(main, { iniziale: { ...vuota(), ...resto, nome: `${b.nome} (copia)`.slice(0, 60) } });
  });
})();
