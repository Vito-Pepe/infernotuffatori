// Costruttore: nuova build, modifica, copia, build migliore. Le metriche e i consigli si
// aggiornano a ogni scelta.
(function () {
  "use strict";
  const { h, monta, stato, oggetto, buildDa, puoModificare, chiama, avviso, conferma, finestra, vista, vai, leggiLocale, scriviLocale, numero } = window.IT;
  const G = window.Grafica;
  const P = window.PaginaBuild;
  const O = window.Ottimizzatore;
  const FAZIONI = ["terminidi", "automi", "illuminati"];
  const CONTRO = { terminidi: "contro i Terminidi", automi: "contro gli Automi", illuminati: "contro gli Illuminati" };
  const PER = { terminidi: "per i Terminidi", automi: "per gli Automi", illuminati: "per gli Illuminati" };

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
    ["build", "Per questa build"],
    ["leggero", "Contro i leggeri"],
    ["medio", "Contro i medi"],
    ["pesante", "Contro i pesanti"],
  ];

  function vuota(fazione = "terminidi") {
    return { nome: "", fazione, variante: null, primaria: null, secondaria: null, granata: null, stratagemmi: [null, null, null, null], armatura: { passiva: null, peso: "media" }, potenziamento: null, note: "" };
  }

  // Build migliore di ogni fazione: si calcola una volta per catalogo
  const migliori = new WeakMap();
  function migliore(fazione) {
    let m = migliori.get(stato.catalogo);
    if (!m) migliori.set(stato.catalogo, (m = {}));
    if (!m[fazione]) m[fazione] = O.ottimizza(stato.catalogo, fazione);
    return m[fazione];
  }

  // I pezzi di una build (senza nome e note)
  function pezzi(x) {
    return { primaria: x.primaria, secondaria: x.secondaria, granata: x.granata, stratagemmi: [...x.stratagemmi], armatura: { ...x.armatura }, potenziamento: x.potenziamento };
  }

  // Posti senza un oggetto del catalogo (uno tolto dalla wiki conta come vuoto, come nei posti)
  function vuoti(b) {
    return [b.primaria, b.secondaria, b.granata, ...b.stratagemmi, b.armatura.passiva, b.potenziamento].filter((x) => !oggetto(x)).length;
  }

  const zaino = (o) => o.tipo === "zaino" || (o.tratti || []).includes("Backpack");

  // Stratagemma che non sta con quelli negli altri posti (se ne porta uno alla volta)
  function conflitto(o, altri) {
    if (o.slot !== "stratagemma") return null;
    if (zaino(o) && altri.some(zaino)) return "hai già uno zaino";
    if (o.tipo === "arma" && altri.some((a) => a.tipo === "arma")) return "hai già un'arma di supporto";
    if (o.tipo === "veicolo" && altri.some((a) => a.tipo === "veicolo")) return "hai già un veicolo";
    return null;
  }

  function delta(x) {
    if (x == null) return null;
    const d = Math.round(x * 10) / 10;
    return h("span", { class: `delta ${d > 0 ? "su" : d < 0 ? "giu" : "pari"}`, title: "Quanto cambia la potenza totale della build" }, d > 0 ? `+${numero(d)}` : d < 0 ? `−${numero(-d)}` : "=");
  }

  function categoria(o) {
    if (o.slot === "stratagemma") return P.NOMI_TIPO[o.tipo] || "Altro";
    if (o.slot === "armatura" || o.slot === "potenziamento") return null;
    return TIPI_ARMI[o.tipo] || o.tipo || "Altro";
  }

  // Finestra per scegliere un oggetto di un posto. Con la build, accanto a ogni oggetto quanto
  // cambia la potenza totale mettendolo in quel posto (per gli stratagemmi il posto indice)
  function scegli({ slot, titolo, attuale, fazione, esclusi = [], alla, build = null, indice = 0 }) {
    const tutti = stato.catalogo.oggetti.filter((o) => o.slot === slot);
    const categorie = [...new Set(tutti.map(categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "it"));
    const conFuoco = slot !== "armatura" && slot !== "potenziamento";
    const ordini = ORDINI.filter(([v]) => (v !== "build" || build) && (conFuoco || v === "nome" || v === "build"));
    const pref = leggiLocale("it-scelta", {});
    let filtro = { testo: "", categoria: "tutte", ordine: ordini.some(([v]) => v === pref.ordine) ? pref.ordine : "nome" };
    const cerca = h("input", { type: "search", placeholder: "Cerca", "aria-label": "Cerca" });
    const ordine = h("select", { "aria-label": "Ordina" }, ordini.map(([v, n]) => h("option", { value: v }, n)));
    ordine.value = filtro.ordine;
    const chips = h("div", { class: "chips" });
    const griglia = h("div", { class: "scelte" });
    const misura = (o) => window.Metriche.potenza(o, stato.catalogo, fazione);
    const prova = build ? O.prova(build, stato.catalogo, slot, indice) : null;
    const guadagno = (id) => (prova ? (id ? prova.punteggi.get(id) : prova.senza) - prova.base : null);
    const altri = build && slot === "stratagemma" ? build.stratagemmi.filter((x, j) => x && j !== indice).map(oggetto).filter(Boolean) : [];

    const disegna = () => {
      chips.replaceChildren(
        ...(categorie.length > 1 ? ["tutte", ...categorie] : []).map((c) =>
          h("button", { type: "button", class: filtro.categoria === c ? "attivo" : "", onclick: () => ((filtro.categoria = c), disegna()) }, c === "tutte" ? "Tutte" : c),
        ),
      );
      const t = filtro.testo.trim().toLowerCase();
      let elenco = tutti.filter((o) => (filtro.categoria === "tutte" || categoria(o) === filtro.categoria) && (!t || `${o.nome} ${o.descrizione || ""} ${(o.tratti || []).join(" ")}`.toLowerCase().includes(t)));
      if (filtro.ordine === "build" && prova) elenco = elenco.sort((a, b) => guadagno(b.id) - guadagno(a.id) || a.nome.localeCompare(b.nome));
      else if (filtro.ordine !== "nome" && conFuoco) elenco = elenco.sort((a, b) => misura(b)[filtro.ordine] - misura(a)[filtro.ordine]);
      else elenco = elenco.sort((a, b) => a.nome.localeCompare(b.nome));
      griglia.replaceChildren(
        h("button", { type: "button", class: `scelta${!attuale ? " scelta-attuale" : ""}`, onclick: () => (alla(null), f.chiudi()) }, G.iconaOggetto(null), h("span", { class: "nome" }, "Nessuno"), attuale ? delta(guadagno(null)) : null),
        ...elenco.map((o) => {
          const p = conFuoco ? misura(o) : null;
          const preso = esclusi.includes(o.id);
          const nota = preso ? null : conflitto(o, altri);
          return h(
            "button",
            { type: "button", class: `scelta${o.id === attuale ? " scelta-attuale" : ""}`, disabled: preso, title: preso ? "Già scelto in un altro posto" : o.descrizione || o.nome, onclick: () => (alla(o.id), f.chiudi()) },
            preso || o.id === attuale ? null : delta(guadagno(o.id)),
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
            nota ? h("span", { class: "descr attenzione" }, nota) : null,
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
    const strumenti = [cerca, ordini.length > 1 ? h("div", { style: "display:flex;gap:8px" }, ordine) : null, chips];
    const f = finestra({ titolo, contenuto: griglia, strumenti });
    disegna();
    setTimeout(() => cerca.focus({ preventScroll: true }), 50);
  }

  function metti(b, m) {
    if (m.posto === "stratagemma") b.stratagemmi[m.indice] = m.a;
    else if (m.posto === "armatura") b.armatura = { passiva: m.a, peso: m.peso };
    else b[m.posto] = m.a;
  }

  // Armature del gioco con questa passiva e questo peso
  function armatureCon(passiva, peso) {
    return (stato.catalogo.armature || []).filter((a) => a.passivaId === passiva && a.peso === peso).map((a) => a.nome);
  }

  const elencoArmature = (nomi) => `${nomi.slice(0, 3).join(", ")}${nomi.length > 3 ? ` e altre ${nomi.length - 3}` : ""}`;

  // Consigli: per ogni posto il cambio che alza di più la potenza totale, da mettere con un
  // tocco; la build migliore della fazione e i posti vuoti riempiti al meglio
  function disegnaConsigli(box, b, applica) {
    const f = b.fazione;
    const c = O.consigli(b, stato.catalogo);
    const nome = (id) => oggetto(id)?.nome || "nessuna";
    const peso = (p) => G.ARMATURE[p].toLowerCase();
    const confronto = h("span", null, "…");
    const scriviMigliore = () => {
      const r = migliore(f);
      const d = c.punteggio - r.punteggio;
      if (Math.abs(d) <= O.MINIMO) confronto.replaceChildren(`È la build migliore ${PER[f]}.`);
      else if (d > 0) confronto.replaceChildren(`Più della build migliore ${PER[f]} (${numero(r.punteggio)}), che però porta al massimo uno zaino, un'arma di supporto e un veicolo, e un'armatura che esiste.`);
      else confronto.replaceChildren("La build migliore ", PER[f], " arriva a ", h("b", null, numero(r.punteggio)), ".");
    };
    const righe = c.mosse.map((m) => {
      const o = oggetto(m.a);
      const posto = m.posto === "stratagemma" ? `Stratagemma ${m.indice + 1}` : P.NOMI_POSTO[m.posto];
      const testo = m.posto === "armatura" ? `${m.da ? `${nome(m.da)} (${peso(m.pesoPrima)}) → ` : ""}${o.nome} (${peso(m.peso)})` : m.da ? `${nome(m.da)} → ${o.nome}` : o.nome;
      return h(
        "div",
        { class: "consiglio" },
        G.iconaOggetto(o, { titolo: false }),
        h("div", { class: "testo" }, h("div", { class: "etichetta" }, posto), h("div", null, testo), m.armature?.length ? h("div", { class: "tenue piccolo" }, elencoArmature(m.armature)) : null),
        h("span", { class: "guadagno", title: "Di quanto sale la potenza totale" }, `+${numero(m.guadagno)}`),
        h("button", { class: "pulsante", type: "button", onclick: () => applica((x) => metti(x, m)) }, "Metti"),
      );
    });
    const quanti = vuoti(b);
    box.replaceChildren(
      h("summary", null, h("span", { class: "titolo" }, "Consigli per alzare il punteggio"), c.mosse.length ? h("span", { class: "guadagno" }, `fino a +${numero(c.mosse[0].guadagno)}`) : h("span", { class: "tenue piccolo" }, "niente da cambiare")),
      h("p", { class: "piccolo" }, "Potenza totale ", h("b", null, numero(c.punteggio)), ". ", confronto),
      h(
        "div",
        { class: "pulsanti" },
        h(
          "button",
          {
            class: "pulsante primo",
            type: "button",
            onclick: async () => {
              if (quanti < 9 && !(await conferma(`Metto la build migliore ${PER[f]} al posto di tutti i pezzi? Nome e note restano.`, "Metti"))) return;
              applica((x) => Object.assign(x, pezzi(migliore(f).build)));
            },
          },
          "★ Build migliore",
        ),
        quanti && quanti < 9
          ? h("button", { class: "pulsante", type: "button", title: "Tiene i pezzi che hai scelto", onclick: () => applica((x) => Object.assign(x, pezzi(O.ottimizza(stato.catalogo, f, { fissi: x }).build))) }, quanti === 1 ? "Completa il posto vuoto" : `Completa i ${quanti} posti vuoti`)
          : null,
      ),
      righe.length ? h("div", { class: "consigli-elenco" }, righe) : h("p", { class: "tenue piccolo" }, "Cambiando un pezzo solo il punteggio non sale."),
      h(
        "p",
        { class: "tenue piccolo" },
        "Secondo le nostre metriche: un pezzo alla volta, tra le combinazioni che si possono portare (al massimo uno zaino, un'arma di supporto e un veicolo; passiva e peso di un'armatura che esiste). ",
        h("a", { href: "#/teoria" }, "Come calcoliamo"),
      ),
    );
    // La build migliore si calcola la prima volta: prima si disegna il resto
    if (migliori.get(stato.catalogo)?.[f]) scriviMigliore();
    else setTimeout(scriviMigliore, 0);
  }

  // allaFazione: cosa fare quando si sceglie un'altra fazione (normalmente la si cambia e basta)
  function costruttore(main, { iniziale, id = null, chiaveBozza = null, titolo = null, intro = null, allaFazione = null }) {
    const b = structuredClone(iniziale);
    const salvaBozza = () => chiaveBozza && scriviLocale(chiaveBozza, b);
    const analisi = h("div");
    const slots = h("div", { class: "slots" });
    const fazioni = h("div", { class: "fazioni", role: "group", "aria-label": "Fazione" });
    const peso = h("div", { class: "segmenti", role: "group", "aria-label": "Peso dell'armatura" });
    const consigli = h("details", { class: "pannello consigli", open: leggiLocale("it-consigli", true) });
    consigli.addEventListener("toggle", () => scriviLocale("it-consigli", consigli.open));

    const aggiornaAnalisi = () => analisi.replaceChildren(P.pannelloAnalisi(b));
    const applica = (cambia) => {
      cambia(b);
      ridisegna();
    };

    const slot = (posto, etichetta, valore, imposta, extra = {}) => {
      const o = oggetto(valore);
      const apri = () =>
        scegli({
          slot: posto,
          titolo: etichetta,
          attuale: valore,
          fazione: b.fazione,
          esclusi: extra.esclusi || [],
          build: b,
          indice: extra.indice || 0,
          alla: (nuovo) => {
            imposta(nuovo);
            ridisegna();
          },
        });
      return h(
        "div",
        { class: "slot", role: "button", tabindex: 0, onclick: apri, onkeydown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), apri()) },
        G.iconaOggetto(o, { slot: posto }),
        h("div", { style: "min-width:0" }, h("div", { class: "etichetta" }, etichetta), h("div", { class: o ? "valore" : "valore tenue" }, o ? o.nome : "Scegli…"), extra.sotto ? h("div", { class: "tenue piccolo" }, extra.sotto) : null),
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
        ...FAZIONI.map((f) =>
          h(
            "button",
            { type: "button", class: b.fazione === f ? "attiva" : "", "aria-pressed": String(b.fazione === f), onclick: () => (allaFazione ? allaFazione(f) : ((b.fazione = f), ridisegna())) },
            G.emblemaFazione(f, { class: "" }),
            G.FAZIONI[f].nome,
          ),
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
          slot("stratagemma", `Stratagemma ${i + 1}`, b.stratagemmi[i], (v) => (b.stratagemmi[i] = v), { esclusi: b.stratagemmi.filter((x, j) => x && j !== i), indice: i }),
        ),
        slot("armatura", "Passiva dell'armatura", b.armatura.passiva, (v) => (b.armatura.passiva = v), { sotto: sottoArmatura() }),
        slot("potenziamento", "Potenziamento", b.potenziamento, (v) => (b.potenziamento = v)),
      );
      disegnaConsigli(consigli, b, applica);
      aggiornaAnalisi();
    };

    // Quali armature del gioco hanno la passiva scelta con il peso scelto
    const sottoArmatura = () => {
      if (!b.armatura.passiva || !stato.catalogo.armature?.length) return null;
      const nomi = armatureCon(b.armatura.passiva, b.armatura.peso);
      return nomi.length ? elencoArmature(nomi) : `Nessuna armatura ${G.ARMATURE[b.armatura.peso].toLowerCase()} ha questa passiva`;
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
      h("h1", { style: "margin-bottom:12px" }, titolo || (id ? "Modifica la build" : "Nuova build")),
      intro,
      stato.io.login ? null : h("div", { class: "avviso attenzione", style: "margin-bottom:12px" }, "Non so chi sei: per salvare apri l'app dal suo indirizzo Tailscale (https://…ts.net)."),
      fazioni,
      h("label", { class: "campo" }, h("span", null, "Nome"), nome),
      slots,
      h("div", { style: "margin-top:12px" }, h("div", { class: "etichetta tenue piccolo", style: "margin-bottom:4px;text-transform:uppercase;letter-spacing:.1em;font-weight:800" }, "Peso dell'armatura"), peso),
      consigli,
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

  // La build migliore di una fazione, da cambiare e salvare come una build nuova
  vista("migliore", (main, fazione) => {
    const f = FAZIONI.includes(fazione) ? fazione : "terminidi";
    main.append(h("div", { class: "caricamento" }, "Cerco la build migliore…"));
    // Si lascia disegnare la scritta prima del calcolo
    const timer = setTimeout(() => {
      const r = migliore(f);
      main.replaceChildren();
      costruttore(main, {
        iniziale: { ...vuota(f), ...pezzi(r.build), nome: `Migliore ${CONTRO[f]}` },
        titolo: "Build migliore",
        intro: h(
          "p",
          { class: "tenue piccolo", style: "margin:0 0 12px" },
          `La build con la potenza totale più alta ${CONTRO[f]} secondo le nostre metriche (${numero(r.punteggio)}), tra quelle che si possono portare: al massimo uno zaino, un'arma di supporto e un veicolo, passiva e peso di un'armatura che esiste. Con un'altra fazione si ricalcola. Puoi cambiarla e salvarla come una build tua. `,
          h("a", { href: "#/teoria" }, "Come calcoliamo"),
        ),
        allaFazione: (g) => vai(`/migliore/${g}`),
      });
    }, 30);
    return () => clearTimeout(timer);
  });
})();
