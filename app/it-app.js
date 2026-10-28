// Avvio: testata, menu, dati dal Pi e navigazione.
(function () {
  "use strict";
  const { h, s, stato, carica, mostra, chiama, leggiLocale } = window.IT;

  const VOCI = [
    ["elenco", "#/", "Build"],
    ["wiki", "#/wiki", "Wiki"],
    ["ordini", "#/ordini", "Ordini"],
    ["nuova", "#/nuova", "Nuova"],
    ["importa", "#/importa", "Importa"],
    ["novita", "#/novita", "Novità"],
    ["teoria", "#/teoria", "Come calcoliamo"],
  ];

  function logo() {
    return s(
      "svg",
      { viewBox: "0 0 32 32", "aria-hidden": "true" },
      s("rect", { width: 32, height: 32, rx: 6, fill: "var(--giallo)" }),
      s("path", { d: "M16 5a9 9 0 0 0-9 9v4l3 3v4h12v-4l3-3v-4a9 9 0 0 0-9-9zm-4.5 9.5h4v4h-4zm5 0h4v4h-4z", fill: "#111", "fill-rule": "evenodd" }),
    );
  }

  function testata() {
    const chi = stato.io.login ? `${stato.io.amministratore ? "★ " : ""}${stato.io.nome}` : "ospite";
    document.querySelector(".testata").replaceChildren(
      h("a", { class: "marchio", href: "#/", "aria-label": "Infernotuffatori, elenco delle build" }, logo(), h("span", null, "Inferno", h("b", null, "tuffatori"))),
      h("span", { class: "spazio" }),
      h("span", { class: "chi", title: stato.io.login ? `${stato.io.login}${stato.io.amministratore ? " (amministratore)" : ""}` : "Non riconosciuto da Tailscale: sola lettura" }, chi),
    );
    document.querySelector(".menu").replaceChildren(...VOCI.map(([vista, href, nome]) => h("a", { href, dataset: { vista } }, nome)));
  }

  // Pallino rosso su "Novità" se ci sono cambiamenti che su questo dispositivo non sono stati visti
  async function badgeNovita() {
    try {
      const novita = await chiama("GET", "novita");
      const viste = leggiLocale("it-novita-viste", null);
      const nuove = novita.filter((n) => !viste || n.data > viste).length;
      const voce = document.querySelector('.menu a[data-vista="novita"]');
      if (!voce) return;
      voce.querySelector(".pallino")?.remove();
      if (nuove) voce.append(h("span", { class: "pallino", "aria-label": `${nuove} novità` }, String(nuove)));
    } catch {
      // nessun pallino
    }
  }

  async function avvia() {
    const main = document.querySelector("main");
    main.replaceChildren(h("div", { class: "caricamento" }, "Caricamento…"));
    try {
      await carica();
    } catch (e) {
      main.replaceChildren(h("div", { class: "vuoto" }, h("p", null, `Il Pi non risponde: ${e.message}`), h("button", { class: "pulsante", type: "button", onclick: avvia }, "Riprova")));
      return;
    }
    testata();
    badgeNovita();
    mostra();
  }

  window.addEventListener("hashchange", mostra);
  window.App = { badgeNovita };
  avvia();
})();
