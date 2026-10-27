// Pagina di una build e pannello delle metriche (usato anche dal costruttore).
(function () {
  "use strict";
  const { h, monta, stato, oggetto, buildDa, puoModificare, avviso, conferma, chiama, vista, vai, data, numero } = window.IT;
  const G = window.Grafica;

  const NOMI_POSTO = { primaria: "Primaria", secondaria: "Secondaria", granata: "Granata", stratagemma: "Stratagemma", armatura: "Armatura", potenziamento: "Potenziamento" };
  const NOMI_TIPO = { arma: "Arma di supporto", zaino: "Zaino", orbitale: "Orbitale", aquila: "Aquila", torretta: "Torretta", postazione: "Postazione", veicolo: "Veicolo" };
  const FRECCE = { up: "↑", down: "↓", left: "←", right: "→" };

  const CAMPI = [
    ["danno", "Danno"],
    ["perforazione", "Perforazione"],
    ["caricatore", "Caricatore"],
    ["riserva", "Riserva"],
    ["ricarica", "Ricarica", "s"],
    ["cadenza", "Cadenza", "colpi/min"],
    ["dps", "Danno al secondo"],
    ["raggio", "Raggio", "m"],
    ["miccia", "Miccia", "s"],
    ["quantita", "Quantità"],
    ["chiamata", "Chiamata", "s"],
    ["attesa", "Attesa", "s"],
    ["usi", "Usi"],
    ["riarmo", "Riarmo", "s"],
  ];

  function urlWiki(o) {
    return `https://helldivers.wiki.gg/wiki/${encodeURIComponent(o.pagina.replace(/ /g, "_")).replace(/%2F/g, "/")}`;
  }

  function scheda(o) {
    const righe = [];
    const sc = o.scheda || {};
    for (const [k, nome, unita] of CAMPI) {
      const v = sc[k];
      if (v == null || v === "") continue;
      righe.push(h("dt", null, nome), h("dd", null, typeof v === "number" ? `${numero(v, 2)}${unita ? ` ${unita}` : ""}` : String(v)));
    }
    if (o.slot === "stratagemma" && o.scheda && o.scheda.usi == null && o.tipo !== "arma") righe.push(h("dt", null, "Usi"), h("dd", null, "illimitati"));
    return righe.length ? h("dl", { class: "scheda" }, righe) : null;
  }

  // Un oggetto con nome, tipo, descrizione e scheda (aperta a richiesta)
  function pezzo(o, posto, extra) {
    if (!o) return h("div", { class: "pezzo" }, G.iconaOggetto(null, { slot: NOMI_POSTO[posto].toLowerCase() }), h("div", { class: "info" }, h("div", { class: "nome tenue" }, `${NOMI_POSTO[posto]}: nessuna`)));
    const tipo = o.slot === "stratagemma" ? NOMI_TIPO[o.tipo] || o.tipo : o.tipo;
    return h(
      "div",
      { class: "pezzo" },
      G.iconaOggetto(o),
      h(
        "div",
        { class: "info" },
        h("div", { class: "nome" }, o.nome),
        h("div", { class: "tenue piccolo" }, [NOMI_POSTO[posto], tipo, extra].filter(Boolean).join(" · ")),
        o.codice?.length ? h("div", { class: "codice", "aria-label": `Codice: ${o.codice.join(" ")}` }, o.codice.map((c) => h("span", null, FRECCE[c] || "?"))) : null,
        h(
          "details",
          null,
          h("summary", null, "dettagli"),
          o.descrizione ? h("p", { class: "piccolo" }, o.descrizione) : null,
          o.tratti?.length ? h("div", { class: "piccolo tenue" }, o.tratti.join(" · ")) : null,
          scheda(o),
          o.fonte ? h("div", { class: "piccolo tenue" }, `Da: ${o.fonte}`) : null,
          h("a", { class: "piccolo", href: urlWiki(o), target: "_blank", rel: "noopener noreferrer" }, "Apri sulla wiki ↗"),
        ),
      ),
    );
  }

  function equipaggiamento(b) {
    const strat = b.stratagemmi || [];
    return h(
      "div",
      { class: "equip" },
      pezzo(oggetto(b.primaria), "primaria"),
      pezzo(oggetto(b.secondaria), "secondaria"),
      pezzo(oggetto(b.granata), "granata"),
      [0, 1, 2, 3].map((i) => pezzo(oggetto(strat[i]), "stratagemma")),
      pezzo(oggetto(b.armatura?.passiva), "armatura", `peso ${G.ARMATURE[b.armatura?.peso] || "Media"}`),
      pezzo(oggetto(b.potenziamento), "potenziamento"),
    );
  }

  // --- Metriche ---

  function pannelloAnalisi(b) {
    const a = window.Metriche.analizza(b, stato.catalogo);
    const cruscotto = h(
      "div",
      { class: "cruscotto" },
      h("div", { class: "grafico" }, h("h3", null, "Prestazioni"), G.barre(a.voci)),
      h("div", { class: "grafico" }, h("h3", null, "Potenza"), G.potenza(a.potenza), h("h3", { style: "margin-top:14px" }, "Soglie di fuoco"), G.anelli(a.soglie)),
      h("div", { class: "grafico" }, h("h3", null, "Efficacia per distanza"), G.gittata(a.gittata)),
      h("div", { class: "grafico" }, h("h3", null, "Profilo"), G.profilo(a.profilo)),
    );
    const avvisi = a.avvisi.length ? h("div", { class: "avvisi" }, a.avvisi.map((x) => h("div", { class: `avviso ${x.livello}` }, x.livello === "attenzione" ? "⚠ " : "ℹ ", x.testo))) : null;
    const obiettivi = a.obiettivi.length
      ? h(
          "div",
          { class: "grafico", style: "margin-top:12px" },
          h("h3", null, "Strutture che puoi distruggere"),
          h(
            "div",
            { class: "strutture" },
            a.obiettivi.map((s) =>
              h(
                "span",
                { title: s.con.length ? `Con: ${s.con.join(", ")}` : "Niente in questa build ha abbastanza forza di demolizione" },
                h("b", { class: s.copertura >= 0.5 ? "si" : "no" }, s.copertura >= 0.5 ? "✓" : "✗"),
                `${s.nome} `,
                h("span", { class: "tenue" }, `(forza ${s.forza})`),
              ),
            ),
          ),
        )
      : null;
    const contributi = a.contributi.length
      ? h(
          "div",
          { class: "grafico", style: "margin-top:12px;overflow-x:auto" },
          h("h3", null, "Ogni oggetto contro la fazione"),
          h(
            "table",
            { class: "tabella" },
            h("thead", null, h("tr", null, h("th", null, "Oggetto"), h("th", { class: "num" }, "Leggeri"), h("th", { class: "num" }, "Medi"), h("th", { class: "num" }, "Pesanti"), h("th", { class: "num", title: "Quanto conta nella build: le armi in mano si usano una alla volta" }, "Peso"))),
            h(
              "tbody",
              null,
              a.contributi.map((c) =>
                h("tr", null, h("td", null, c.nome), h("td", { class: "num" }, numero(c.leggero)), h("td", { class: "num" }, numero(c.medio)), h("td", { class: "num" }, numero(c.pesante)), h("td", { class: "num" }, c.fattore ? `${numero(c.fattore * 100, 0)}%` : "–")),
              ),
            ),
          ),
          h("p", { class: "tenue piccolo" }, "Punteggi da 0 a 10 dalle uccisioni al minuto stimate contro i nemici di questa fazione. ", h("a", { href: "#/teoria" }, "Come calcoliamo")),
        )
      : null;
    return h("div", null, cruscotto, avvisi, obiettivi, contributi);
  }

  // --- Pagina della build ---

  vista("build", (main, id) => {
    const b = buildDa(id);
    if (!b) {
      monta(main, h("div", { class: "vuoto" }, "Build non trovata. ", h("a", { href: "#/" }, "Torna all'elenco")));
      return;
    }
    const mia = puoModificare(b);
    const copiaLink = async () => {
      const link = `${location.origin}/#/build/${b.id}`;
      try {
        await navigator.clipboard.writeText(link);
        avviso("Link copiato", "ok");
      } catch {
        prompt("Copia il link:", link);
      }
    };
    const elimina = async () => {
      if (!(await conferma(`Eliminare "${b.nome}"? Non si può tornare indietro.`, "Elimina"))) return;
      try {
        await chiama("DELETE", `build/${b.id}`, {});
        stato.build = stato.build.filter((x) => x.id !== b.id);
        avviso("Build eliminata", "ok");
        vai("/");
      } catch (e) {
        avviso(`Non eliminata: ${e.message}`, "errore");
      }
    };
    monta(main, 
      h(
        "div",
        { class: "capo-build" },
        G.emblemaFazione(b.fazione),
        h(
          "div",
          null,
          h("h1", null, b.nome),
          h(
            "div",
            { class: "tenue piccolo" },
            [G.FAZIONI[b.fazione]?.nome, b.variante, `di ${b.autore?.nome || "?"}`, `aggiornata il ${data(b.aggiornata)}`, b.modificataDa && b.modificataDa.login !== b.autore?.login ? `da ${b.modificataDa.nome}` : null].filter(Boolean).join(" · "),
          ),
        ),
      ),
      h(
        "div",
        { class: "pulsanti", style: "margin-bottom:14px" },
        mia ? h("a", { class: "pulsante primo", href: `#/modifica/${b.id}` }, "Modifica") : null,
        h("a", { class: "pulsante", href: `#/copia/${b.id}` }, "Duplica"),
        h("button", { class: "pulsante", type: "button", onclick: copiaLink }, "Copia link"),
        mia ? h("button", { class: "pulsante pericolo", type: "button", onclick: elimina }, "Elimina") : null,
      ),
      equipaggiamento(b),
      b.note ? h("div", { class: "pannello note-build", style: "margin-top:12px" }, b.note) : null,
      h("h2", null, "Analisi"),
      pannelloAnalisi(b),
    );
  });

  window.PaginaBuild = { pannelloAnalisi, pezzo, NOMI_POSTO, NOMI_TIPO };
})();
