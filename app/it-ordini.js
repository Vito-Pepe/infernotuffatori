// Ordini: il Major Order in corso (anche più d'uno), con l'avanzamento di ogni obiettivo
// in percentuale e in numeri, quanto manca, il ritmo delle ultime ore, la ricompensa e la
// scadenza. Il Pi li legge dall'API del gioco ogni mezz'ora;
// la pagina aperta richiede i dati al Pi ogni cinque minuti.
(function () {
  "use strict";
  const { h, monta, chiama, vista, numero, stato, avviso } = window.IT;

  const IN_MANO = { superterra: "di Super Terra", terminidi: "in mano ai Terminidi", automi: "in mano agli Automi", illuminati: "in mano agli Illuminati" };
  const DALLA = { terminidi: "dai Terminidi", automi: "dagli Automi", illuminati: "dagli Illuminati" };
  const OGNI_PAGINA = 5 * 60 * 1000;

  const intero = (n) => numero(Math.round(n), 0);

  function dataOra(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function durata(ore) {
    if (ore == null || !Number.isFinite(ore)) return "";
    const minuti = Math.max(0, Math.round(ore * 60));
    const g = Math.floor(minuti / 1440);
    const o = Math.floor((minuti % 1440) / 60);
    const m = minuti % 60;
    if (g) return `${g} g${o ? ` ${o} h` : ""}`;
    if (o) return `${o} h${m ? ` ${m} min` : ""}`;
    return `${m} min`;
  }

  function mancaAlla(iso) {
    const ms = Date.parse(iso) - Date.now();
    return ms > 0 ? durata(ms / 3600000) : "scaduto";
  }

  function barra(percento, classe = "") {
    const p = Math.max(0, Math.min(100, percento ?? 0));
    return h("div", { class: `barra-ordine ${classe}`, role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(p)) }, h("span", { style: `width:${p}%` }));
  }

  function testoRitmo(c) {
    const r = c.ritmo;
    if (c.completato || !r) return null;
    const unita = r.misura === "percento" ? (v) => `${numero(v, 2)}%` : (v) => intero(v);
    if (r.perOra <= 0) return h("span", { class: "ritmo fermo" }, `Nelle ultime ${numero(r.ore, 1)} ore non è avanzato${r.perOra < 0 ? ": sta tornando indietro" : ""}.`);
    const fine = r.oreAllaFine != null ? `: al ritmo attuale finisce tra ${durata(r.oreAllaFine)}` : "";
    const esito = r.inTempo === true ? " (in tempo)" : r.inTempo === false ? " (non in tempo: serve più impegno)" : "";
    return h("span", { class: `ritmo ${r.inTempo === false ? "tardi" : r.inTempo ? "in-tempo" : ""}` }, `Ritmo: +${unita(r.perOra)} all'ora${fine}${esito}.`);
  }

  function dettagliPianeta(p) {
    if (!p) return null;
    const pezzi = [
      IN_MANO[p.proprietario] || null,
      p.liberazione != null && p.proprietario !== "superterra" ? `liberato al ${numero(p.liberazione, 2)}%` : null,
      p.difesa ? `in difesa${DALLA[p.difesa.fazione] ? ` ${DALLA[p.difesa.fazione]}` : ""}: ${numero(p.difesa.percento, 2)}%${p.difesa.fine ? `, fino a ${dataOra(p.difesa.fine)}` : ""}` : null,
      p.giocatori != null ? `${intero(p.giocatori)} Helldiver ora` : null,
      p.settore ? `settore ${p.settore}` : null,
    ].filter(Boolean);
    return h("div", { class: "tenue piccolo" }, `${p.nome}: ${pezzi.join(" · ")}`);
  }

  function rigaCompito(c) {
    const numeri =
      c.obiettivo != null && c.obiettivo > 1
        ? `${intero(c.fatto)} su ${intero(c.obiettivo)}${c.percento != null ? ` (${numero(c.percento, 1)}%)` : ""}${c.manca ? ` · mancano ${intero(c.manca)}` : ""}`
        : c.percento != null
          ? `${numero(c.percento, 2)}%`
          : c.completato
            ? "fatto"
            : "da fare";
    return h(
      "li",
      { class: `compito${c.completato ? " fatto" : ""}` },
      h("div", { class: "riga-compito" }, h("span", { class: "segno", "aria-hidden": "true" }, c.completato ? "✓" : "○"), h("span", { class: "testo-compito" }, c.testo), h("span", { class: "numeri" }, numeri)),
      barra(c.completato ? 100 : c.percento, c.completato ? "piena" : ""),
      dettagliPianeta(c.pianeta),
      testoRitmo(c),
    );
  }

  function schedaOrdine(o) {
    const scade = o.scadenza ? `scade tra ${mancaAlla(o.scadenza)} (${dataOra(o.scadenza)})` : null;
    const ricompensa = o.ricompense?.length ? o.ricompense.map((r) => `${intero(r.quantita)} ${r.nome}`).join(" + ") : null;
    const fatti = o.compiti.filter((c) => c.completato).length;
    return h(
      "section",
      { class: `pannello ordine${o.completato ? " completato" : ""}` },
      h("div", { class: "testa-ordine" }, h("span", { class: "etichetta" }, "Major Order"), h("h2", null, o.titolo), scade ? h("span", { class: "scadenza" }, scade) : null),
      o.briefing ? h("p", { class: "briefing" }, o.briefing) : null,
      o.descrizione ? h("p", { class: "obiettivo-ordine" }, h("b", null, "Obiettivo: "), o.descrizione) : null,
      o.compiti.length > 1 ? h("div", { class: "tenue piccolo" }, `Obiettivi completati: ${fatti} su ${o.compiti.length}`) : null,
      h("ul", { class: "compiti" }, o.compiti.map(rigaCompito)),
      h("div", { class: "ricompensa" }, h("b", null, "Ricompensa: "), ricompensa || "non indicata"),
      o.completato ? h("div", { class: "fatto-ordine" }, "Completato: la ricompensa arriva alla fine dell'ordine.") : null,
    );
  }

  function pagina(main, d) {
    const erroreDi = (k) => d.errori?.[k];
    const nessunMaggiore = !d.maggiori.length;
    monta(
      main,
      h("h1", { style: "margin:6px 0 4px" }, "Ordini"),
      h(
        "p",
        { class: "tenue piccolo" },
        d.giocatori != null ? `${intero(d.giocatori)} Helldiver in gioco adesso. ` : "",
        d.maggioriAggiornati ? `Aggiornato ${dataOra(d.maggioriAggiornati)}, ogni ${d.ogniMinuti} minuti.` : "Non ancora aggiornato.",
      ),
      erroreDi("guerra") || erroreDi("maggiori") ? h("div", { class: "pannello avviso-ordini" }, `L'API del gioco non ha risposto all'ultimo controllo (${erroreDi("guerra") || erroreDi("maggiori")}). `, d.maggioriAggiornati ? "Qui sotto i dati dell'ultimo controllo riuscito." : "Riprova tra poco.") : null,
      nessunMaggiore && !erroreDi("guerra") && !erroreDi("maggiori") && d.maggioriAggiornati ? h("div", { class: "pannello" }, "Nessun Major Order in corso: Super Terra sta preparando il prossimo.") : null,
      d.maggiori.map(schedaOrdine),
      d.dispacci?.length
        ? h(
            "section",
            null,
            h("h2", null, "Ultimi dispacci"),
            h("div", { class: "pannello dispacci" }, d.dispacci.map((x) => h("div", { class: "dispaccio" }, x.data ? h("div", { class: "tenue piccolo" }, dataOra(x.data)) : null, h("p", null, x.testo)))),
          )
        : null,
      h(
        "p",
        { class: "tenue piccolo fonte-wiki" },
        "Dati dall'API del gioco di Arrowhead (Major Order, pianeti, dispacci); nomi dei pianeti dalla raccolta della community helldivers-2/json. Il ritmo è una stima nostra sulle ultime ore. ",
        h(
          "button",
          {
            class: "pulsante",
            type: "button",
            disabled: !stato.io.login || d.inCorso,
            title: stato.io.login ? "Chiede subito gli ordini al gioco" : "Solo per chi entra dalla tailnet",
            onclick: async (e) => {
              e.currentTarget.disabled = true;
              try {
                await chiama("POST", "ordini", {});
                avviso("Aggiornamento partito: tra qualche secondo i dati nuovi");
                setTimeout(() => location.hash === "#/ordini" && window.IT.mostra(), 8000);
              } catch (err) {
                avviso(err.message, "errore");
              }
            },
          },
          d.inCorso ? "Aggiornamento in corso…" : "Aggiorna adesso",
        ),
      ),
    );
  }

  vista("ordini", (main) => {
    let chiusa = false;
    const carica = async () => {
      try {
        const d = await chiama("GET", "ordini");
        if (chiusa) return;
        main.replaceChildren();
        pagina(main, d);
      } catch (e) {
        if (!chiusa) main.replaceChildren(h("div", { class: "vuoto" }, `Ordini non disponibili: ${e.message}`));
      }
    };
    main.append(h("div", { class: "caricamento" }, "Ordini…"));
    carica();
    const timer = setInterval(carica, OGNI_PAGINA);
    return () => {
      chiusa = true;
      clearInterval(timer);
    };
  });
})();
