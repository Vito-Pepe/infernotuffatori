// Elenco di tutte le build, diviso per fazione, con filtri e riordino trascinando.
(function () {
  "use strict";
  const { h, monta, stato, oggetto, chiama, avviso, vista, vai, caricaBuild, leggiLocale, scriviLocale } = window.IT;
  const G = window.Grafica;
  const ORDINE_FAZIONI = ["terminidi", "automi", "illuminati"];

  function oggettiDi(b) {
    return [b.primaria, b.secondaria, b.granata, ...(b.stratagemmi || [null, null, null, null]), b.armatura?.passiva, b.potenziamento];
  }

  function riga(b, trascinabile) {
    const totale = window.Metriche.analizza(b, stato.catalogo).potenza.totale;
    const posti = ["primaria", "secondaria", "granata", "stratagemma", "stratagemma", "stratagemma", "stratagemma", "armatura", "potenziamento"];
    const maniglia = trascinabile ? h("span", { class: "maniglia", title: "Trascina per riordinare", "aria-hidden": "true" }, "⠿") : null;
    return h(
      "a",
      { class: "riga", href: `#/build/${b.id}`, dataset: { id: b.id } },
      maniglia,
      G.emblemaFazione(b.fazione),
      h("div", { class: "testo" }, h("div", { class: "nome" }, b.nome), h("div", { class: "autore" }, [b.autore?.nome, b.variante].filter(Boolean).join(" · "))),
      h("div", { class: "icone" }, oggettiDi(b).map((id, i) => G.iconaOggetto(oggetto(id), { slot: posti[i] }))),
      h("span", { class: "punti", title: "Potenza totale" }, String(Math.round(totale))),
    );
  }

  // Trascinamento con il puntatore (dito o mouse) sulla maniglia; a fine corsa salva l'ordine
  function abilitaTrascina(contenitore, fazione) {
    let attiva = null;
    contenitore.addEventListener("pointerdown", (e) => {
      const maniglia = e.target.closest(".maniglia");
      if (!maniglia) return;
      e.preventDefault();
      attiva = maniglia.closest(".riga");
      attiva.classList.add("trascinata");
      document.body.style.userSelect = "none";
      // Si ascolta la finestra: spostando la riga nella pagina la maniglia perderebbe il puntatore
      const muovi = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        ev.preventDefault();
        const sotto = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".riga");
        if (!sotto || sotto === attiva || sotto.parentNode !== contenitore) return;
        const r = sotto.getBoundingClientRect();
        contenitore.insertBefore(attiva, ev.clientY > r.top + r.height / 2 ? sotto.nextSibling : sotto);
      };
      const fine = async (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        window.removeEventListener("pointermove", muovi);
        window.removeEventListener("pointerup", fine);
        window.removeEventListener("pointercancel", fine);
        document.body.style.userSelect = "";
        attiva.classList.remove("trascinata");
        attiva = null;
        const ids = [...contenitore.querySelectorAll(".riga")].map((x) => x.dataset.id);
        if (ids.join() === stato.ordine[fazione].join()) return;
        stato.ordine[fazione] = ids;
        try {
          const r = await chiama("PUT", "ordine", { fazione, ids });
          stato.ordine[fazione] = r.ordine;
        } catch (err) {
          avviso(`Ordine non salvato: ${err.message}`, "errore");
        }
      };
      window.addEventListener("pointermove", muovi, { passive: false });
      window.addEventListener("pointerup", fine);
      window.addEventListener("pointercancel", fine);
    });
    // Un clic sulla maniglia non apre la build, e i link non si trascinano come link
    contenitore.addEventListener("click", (e) => e.target.closest(".maniglia") && e.preventDefault());
    contenitore.addEventListener("dragstart", (e) => e.preventDefault());
  }

  vista("", (main) => {
    const filtri = { testo: "", autore: "tutti", fazione: "tutte", ...leggiLocale("it-filtri", {}) };
    const autori = [...new Map(stato.build.map((b) => [b.autore?.login, b.autore?.nome])).entries()].filter(([l]) => l);

    const cerca = h("input", { type: "search", placeholder: "Cerca per nome, autore o oggetto", value: filtri.testo, "aria-label": "Cerca" });
    const sceltaAutore = h(
      "select",
      { "aria-label": "Autore" },
      h("option", { value: "tutti" }, "Tutti gli autori"),
      stato.io.login ? h("option", { value: "mie" }, "Solo le mie") : null,
      autori.map(([login, nome]) => h("option", { value: login }, nome)),
    );
    sceltaAutore.value = filtri.autore;
    if (sceltaAutore.value !== filtri.autore) sceltaAutore.value = "tutti";
    const chipFazioni = h("div", { class: "chips", style: "margin-top:8px" });
    const elenco = h("div");
    const migliore = h("a", { class: "pulsante", href: "#/migliore" }, "★ Build migliore");

    const ridisegna = () => {
      scriviLocale("it-filtri", filtri);
      // La build migliore per la fazione che si sta guardando
      migliore.href = `#/migliore/${ORDINE_FAZIONI.includes(filtri.fazione) ? filtri.fazione : "terminidi"}`;
      chipFazioni.replaceChildren(
        ...[["tutte", "Tutte"], ...ORDINE_FAZIONI.map((f) => [f, G.FAZIONI[f].nome])].map(([v, nome]) =>
          h("button", { type: "button", class: filtri.fazione === v ? "attivo" : "", onclick: () => ((filtri.fazione = v), ridisegna()) }, nome),
        ),
      );
      const testo = filtri.testo.trim().toLowerCase();
      const filtrato = testo || filtri.autore !== "tutti";
      const passa = (b) => {
        if (filtri.autore === "mie" && b.autore?.login !== stato.io.login) return false;
        if (!["tutti", "mie"].includes(filtri.autore) && b.autore?.login !== filtri.autore) return false;
        if (!testo) return true;
        const nomi = oggettiDi(b).map((id) => oggetto(id)?.nome || "");
        return [b.nome, b.autore?.nome, b.note, ...nomi].join(" ").toLowerCase().includes(testo);
      };
      const gruppi = ORDINE_FAZIONI.filter((f) => filtri.fazione === "tutte" || filtri.fazione === f).map((f) => {
        const ids = stato.ordine[f] || [];
        const build = ids.map((id) => stato.build.find((b) => b.id === id)).filter((b) => b && passa(b));
        if (!build.length) return null;
        const contenitore = h("div", null, build.map((b) => riga(b, !filtrato && Boolean(stato.io.login))));
        if (!filtrato && stato.io.login) abilitaTrascina(contenitore, f);
        return h("section", { class: "gruppo-fazione" }, h("h2", null, G.emblemaFazione(f, { class: "fazione-icona" }), `${G.FAZIONI[f].nome} · ${build.length}`), contenitore);
      });
      const pieni = gruppi.filter(Boolean);
      elenco.replaceChildren(
        ...(pieni.length
          ? pieni
          : [h("div", { class: "vuoto" }, stato.build.length ? "Nessuna build con questi filtri." : "Ancora nessuna build. Creane una o importa quelle di democracy-hub.")]),
      );
      if (filtrato && pieni.length) elenco.append(h("p", { class: "tenue piccolo" }, "Con un filtro attivo non si riordina: toglilo per trascinare le build."));
    };

    cerca.addEventListener("input", () => ((filtri.testo = cerca.value), ridisegna()));
    sceltaAutore.addEventListener("change", () => ((filtri.autore = sceltaAutore.value), ridisegna()));

    monta(main, 
      h("div", { class: "pulsanti", style: "margin-bottom:14px" }, h("a", { class: "pulsante primo", href: "#/nuova" }, "+ Nuova build"), migliore, h("a", { class: "pulsante", href: "#/importa" }, "Importa da democracy-hub")),
      h("div", { class: "filtri" }, cerca, sceltaAutore),
      chipFazioni,
      elenco,
    );
    ridisegna();

    // Quando si torna sull'app, le build nuove degli altri
    const aggiorna = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        await caricaBuild();
        ridisegna();
      } catch {
        // offline: resta quello che c'è
      }
    };
    document.addEventListener("visibilitychange", aggiorna);
    return () => document.removeEventListener("visibilitychange", aggiorna);
  });

  window.Elenco = { riga, oggettiDi };
})();
