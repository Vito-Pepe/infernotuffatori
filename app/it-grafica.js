// Disegni dell'app: emblemi delle fazioni, emblemi di passive e potenziamenti (nostri),
// icone degli oggetti e grafici delle metriche (SVG, niente librerie).
(function () {
  "use strict";
  const { h, s, numero } = window.IT;

  const FAZIONI = {
    terminidi: { nome: "Terminidi", colore: "var(--terminidi)" },
    automi: { nome: "Automi", colore: "var(--automi)" },
    illuminati: { nome: "Illuminati", colore: "var(--illuminati)" },
  };

  const ARMATURE = { leggera: "Leggera", media: "Media", pesante: "Pesante" };

  // Emblemi delle fazioni (disegni nostri, semplici)
  const SEGNI_FAZIONE = {
    terminidi: "M20 6c-6 0-10 4-10 10 0 4 2 7 5 9l-5 7 4 2 5-7h2l5 7 4-2-5-7c3-2 5-5 5-9 0-6-4-10-10-10zm-4 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm8 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM8 8l5 4-2 2-5-4zm24 0l2 2-5 4-2-2z",
    automi: "M20 3l3 6 6-3-1 7 7 1-5 5 5 5-7 1 1 7-6-3-3 6-3-6-6 3 1-7-7-1 5-5-5-5 7-1-1-7 6 3zm-5 13v4h4v-4zm6 0v4h4v-4zm-5 7v3h8v-3z",
    illuminati: "M20 4a16 16 0 1 0 0 32 12 12 0 0 1 0-32zm4 9c4 0 8 3 9 7-1 4-5 7-9 7s-8-3-9-7c1-4 5-7 9-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  };

  function emblemaFazione(fazione, props = {}) {
    const f = FAZIONI[fazione] || FAZIONI.terminidi;
    return s("svg", { viewBox: "0 0 40 40", class: props.class || "fazione-icona", "aria-label": f.nome, role: "img" }, s("path", { d: SEGNI_FAZIONE[fazione] || SEGNI_FAZIONE.terminidi, fill: f.colore, "fill-rule": "evenodd" }));
  }

  // Emblemi di passive e potenziamenti (24×24)
  const SEGNI = {
    scudo: "M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z",
    fuoco: "M12 2c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z",
    gas: "M7 18a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 8.3 4.9 4.9 0 0 1 17 18zM8 20h2v2H8zm4 0h2v2h-2zm4 0h2v2h-2z",
    fulmine: "M13 2L4 14h6l-1 8 9-12h-6z",
    esplosione: "M12 1l2.2 6.1L20 5l-2.9 5.6L23 12l-5.9 1.4L20 19l-5.8-2.1L12 23l-2.2-6.1L4 19l2.9-5.6L1 12l5.9-1.4L4 5l5.8 2.1z",
    cuore: "M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z",
    croce: "M9 3h6v6h6v6h-6v6H9v-6H3V9h6z",
    piede: "M7 2h7v9l7 4v5H3v-5l4-3z",
    occhio: "M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
    granata: "M10 2h4v3h-4zm5 1l4-1v2l-4 2zM12 6a7 7 0 1 1 0 14 7 7 0 0 1 0-14z",
    caricatore: "M8 2h8v5l2 15H6L8 7z",
    mirino: "M11 2h2v5h-2zm0 15h2v5h-2zM2 11h5v2H2zm15 0h5v2h-5zM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
    corsa: "M3 5h4l6 7-6 7H3l6-7zm8 0h4l6 7-6 7h-4l6-7z",
    sole: "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM11 1h2v4h-2zm0 18h2v4h-2zM1 11h4v2H1zm18 0h4v2h-4zM4 5.4L5.4 4l2.8 2.8-1.4 1.4zm11.8 11.8l1.4-1.4 2.8 2.8-1.4 1.4zM4 18.6l2.8-2.8 1.4 1.4L5.4 20zM15.8 6.8L18.6 4 20 5.4l-2.8 2.8z",
    bandiera: "M5 2h2v20H5zm3 1h12l-3 4.5 3 4.5H8z",
    rinforzi: "M8 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm8 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM2 20c0-5 3-8 6-8s6 3 6 8zm12 0c0-2-.5-4-1.5-5.5A5 5 0 0 1 16 12c3 0 6 3 6 8z",
    capsula: "M12 1l6 7v10l-6 5-6-5V8z",
    campioni: "M9 2h6v2h-1v5l5 9a2 2 0 0 1-2 3H7a2 2 0 0 1-2-3l5-9V4H9z",
    radar: "M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM6.3 6.3l1.4 1.4a6 6 0 0 0 0 8.6l-1.4 1.4a8 8 0 0 1 0-11.4zm11.4 0a8 8 0 0 1 0 11.4l-1.4-1.4a6 6 0 0 0 0-8.6zM3.5 3.5l1.4 1.4a10 10 0 0 0 0 14.2l-1.4 1.4a12 12 0 0 1 0-17zm17 0a12 12 0 0 1 0 17l-1.4-1.4a10 10 0 0 0 0-14.2z",
    navetta: "M2 13l8-2 3-8h2l-1 8 8 2v2l-8-1-1 5 2 2v1l-4-1-4 1v-1l2-2-1-5-6 1z",
    goccia: "M12 2s7 8 7 13a7 7 0 0 1-14 0c0-5 7-13 7-13z",
    razzo: "M12 2c3 2 5 6 5 10l2 3-3 1-1 3H9l-1-3-3-1 2-3c0-4 2-8 5-10zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
    stella: "M12 2l3 7h7l-5.6 4.4L18.5 21 12 16.6 5.5 21l2.1-7.6L2 9h7z",
  };

  function segno(nome, classe) {
    return s("svg", { viewBox: "0 0 24 24", class: classe, "aria-hidden": "true" }, s("path", { d: SEGNI[nome] || SEGNI.stella, fill: "currentColor", "fill-rule": "evenodd" }));
  }

  // Icona di un oggetto: immagine (armi, stratagemmi) o emblema (passive, potenziamenti)
  function iconaOggetto(o, { titolo = true, slot = null } = {}) {
    const nome = o ? o.nome : slot ? `Nessun${slot === "granata" || slot === "secondaria" || slot === "primaria" || slot === "armatura" ? "a" : ""} ${slot}` : "";
    const props = { class: "icona", title: titolo ? nome : null };
    if (!o) return h("span", { ...props, class: "icona vuota x", "aria-label": nome });
    if (o.slot === "potenziamento") {
      return h(
        "span",
        { ...props, class: "icona emblema esagono", "aria-label": o.nome, role: "img" },
        s("svg", { viewBox: "0 0 24 24", class: "fondo", "aria-hidden": "true" }, s("path", { d: "M12 1l10 5.5v11L12 23 2 17.5v-11z", fill: "var(--giallo)" })),
        segno(o.emblema, "segno"),
      );
    }
    if (o.slot === "armatura") return h("span", { ...props, class: "icona emblema", "aria-label": o.nome, role: "img" }, segno(o.emblema));
    if (!o.icona) return h("span", { ...props, class: "icona vuota", "aria-label": o.nome }, "?");
    const arma = ["primaria", "secondaria", "granata"].includes(o.slot);
    return h("span", { ...props, class: `icona${arma ? " arma" : ""}` }, h("img", { src: `/icone/${o.icona}`, alt: o.nome, loading: "lazy", decoding: "async" }));
  }

  // --- Grafici ---

  const VOCI = [
    ["leggeri", "Leggeri", "var(--leggeri)"],
    ["medi", "Medi", "var(--medi)"],
    ["pesanti", "Pesanti", "var(--pesanti)"],
    ["sopravvivenza", "Sopravv.", "var(--sopravvivenza)"],
    ["utilita", "Utilità", "var(--utilita)"],
    ["controllo", "Controllo", "var(--controllo)"],
    ["obiettivi", "Obiettivi", "var(--obiettivi)"],
  ];

  function barre(voci) {
    const L = 360;
    const A = 190;
    const basso = 160;
    const alto = 18;
    const passo = (L - 40) / VOCI.length;
    const y = (v) => basso - ((basso - alto) * Math.max(0, Math.min(10, v))) / 10;
    const svg = s("svg", { viewBox: `0 0 ${L} ${A}`, role: "img", "aria-label": `Prestazioni: ${VOCI.map(([k, n]) => `${n} ${numero(voci[k])}`).join(", ")}` });
    for (const v of [0, 5, 10]) {
      svg.append(s("line", { x1: 30, x2: L - 6, y1: y(v), y2: y(v), stroke: "#2a2a2a", "stroke-width": 1 }), s("text", { x: 22, y: y(v) + 4, fill: "#777", "font-size": 10, "text-anchor": "end" }, String(v)));
    }
    VOCI.forEach(([k, nome, colore], i) => {
      const x = 36 + i * passo;
      const v = voci[k] || 0;
      svg.append(
        s("rect", { x, y: y(v), width: passo - 10, height: Math.max(0, basso - y(v)), fill: colore, rx: 2 }),
        s("text", { x: x + (passo - 10) / 2, y: y(v) - 4, fill: "#ddd", "font-size": 11, "font-weight": 700, "text-anchor": "middle" }, numero(v)),
        s("text", { x: x + (passo - 10) / 2, y: A - 14, fill: "#999", "font-size": 9, "text-anchor": "middle" }, nome),
      );
    });
    return svg;
  }

  function potenza(p) {
    const tot = Math.max(p.totale, 0.01);
    return h(
      "div",
      { class: "potenza" },
      h("div", null, h("div", { class: "numero" }, numero(p.totale)), h("div", { class: "tenue piccolo" }, "potenza totale")),
      h(
        "div",
        { class: "dettagli" },
        h("div", { class: "barra-doppia", "aria-hidden": "true" }, h("span", { style: `width:${(100 * p.fuoco) / tot}%;background:var(--pesanti)` }), h("span", { style: `width:${(100 * p.supporto) / tot}%;background:var(--utilita)` })),
        h("div", null, h("b", { style: "color:var(--pesanti)" }, numero(p.fuoco)), " fuoco (leggeri + medi + pesanti)"),
        h("div", null, h("b", { style: "color:var(--utilita)" }, numero(p.supporto)), " supporto (sopravvivenza, utilità, controllo, obiettivi)"),
        h("div", { class: "tenue" }, "Massimo 70: ogni voce va da 0 a 10."),
      ),
    );
  }

  function anello(valore, colore) {
    const r = 30;
    const c = 2 * Math.PI * r;
    const quota = Math.max(0, Math.min(10, valore)) / 10;
    return s(
      "svg",
      { viewBox: "0 0 80 80", width: 80, height: 80, "aria-hidden": "true" },
      s("circle", { cx: 40, cy: 40, r, fill: "none", stroke: "#252525", "stroke-width": 9 }),
      s("circle", { cx: 40, cy: 40, r, fill: "none", stroke: colore, "stroke-width": 9, "stroke-dasharray": `${c * quota} ${c}`, transform: "rotate(-90 40 40)", "stroke-linecap": "round" }),
      s("text", { x: 40, y: 46, fill: "#eee", "font-size": 18, "font-weight": 900, "text-anchor": "middle" }, numero(valore)),
    );
  }

  function anelli(soglie) {
    const voci = [
      ["leggero", "Anti-leggeri", "var(--leggeri)"],
      ["medio", "Anti-medi", "var(--medi)"],
      ["pesante", "Anti-pesanti", "var(--pesanti)"],
    ];
    return h(
      "div",
      { class: "anelli" },
      voci.map(([k, nome, colore]) => {
        const v = soglie[k];
        const giudizio = v.valore >= v.sicuro ? ["si", "sicuro"] : v.valore >= v.minimo ? ["", "basta"] : ["no", "poco"];
        return h(
          "div",
          null,
          h("div", { class: "titolo", style: `color:${colore}` }, nome),
          anello(v.valore, colore),
          h("div", { class: "soglia" }, `minimo ${numero(v.minimo)} · sicuro ${numero(v.sicuro)}`),
          h("div", { class: `piccolo ${giudizio[0]}` }, giudizio[1]),
        );
      }),
    );
  }

  function gittata(g) {
    const L = 360;
    const A = 170;
    const sx = (d) => 34 + ((L - 44) * d) / 150;
    const sy = (v) => 140 - (120 * v) / 100;
    const svg = s("svg", { viewBox: `0 0 ${L} ${A}`, role: "img", "aria-label": `Efficacia per distanza: corta ${g.corta}%, media ${g.media}%, lunga ${g.lunga}%` });
    const fasce = [
      [0, 25, "CORTA", "rgba(34,197,94,.08)"],
      [25, 60, "MEDIA", "rgba(234,179,8,.07)"],
      [60, 150, "LUNGA", "rgba(239,68,68,.07)"],
    ];
    // I nomi delle fasce stanno sopra il grafico, così la linea non li copre
    for (const [a, b, nome, colore] of fasce) {
      svg.append(s("rect", { x: sx(a), y: 20, width: sx(b) - sx(a), height: 120, fill: colore }), s("text", { x: (sx(a) + sx(b)) / 2, y: 14, fill: "#777", "font-size": 10, "text-anchor": "middle", "letter-spacing": 1.5 }, nome));
    }
    for (const v of [0, 50, 100]) svg.append(s("text", { x: 28, y: sy(v) + 4, fill: "#777", "font-size": 10, "text-anchor": "end" }, `${v}%`), s("line", { x1: 34, x2: L - 10, y1: sy(v), y2: sy(v), stroke: "#262626" }));
    // L'ultima distanza allineata a destra, altrimenti esce dal riquadro
    for (const d of [0, 25, 60, 100, 150]) svg.append(s("text", { x: d === 150 ? L - 2 : sx(d), y: 156, fill: "#777", "font-size": 10, "text-anchor": d === 150 ? "end" : "middle" }, `${d} m`));
    if (g.punti.some((p) => p.efficacia > 0)) {
      const linea = g.punti.map((p, i) => `${i ? "L" : "M"}${sx(p.distanza).toFixed(1)},${sy(p.efficacia).toFixed(1)}`).join(" ");
      svg.append(s("path", { d: `${linea} L${sx(150)},${sy(0)} L${sx(0)},${sy(0)} Z`, fill: "rgba(255,214,10,.12)" }), s("path", { d: linea, fill: "none", stroke: "var(--giallo)", "stroke-width": 2.5, "stroke-linejoin": "round" }));
    }
    return svg;
  }

  function misura(nome, valore, sinistra, destra) {
    return h(
      "div",
      { class: "misura" },
      h("div", { class: "riga-misura" }, h("b", null, nome), h("span", null, `${valore}/100`)),
      h("div", { class: "scala", role: "img", "aria-label": `${nome} ${valore} su 100` }, h("i", { style: `left:${valore}%` })),
      h("div", { class: "riga-misura tenue piccolo" }, h("span", null, sinistra), h("span", null, destra)),
    );
  }

  function profilo(p) {
    return h(
      "div",
      { class: "misure" },
      misura("Rumore", p.rumore, "silenzioso", "si sente da lontano"),
      misura("Ritmo", p.ritmo, "lento, si resta fermi", "veloce, sempre in movimento"),
      misura("Impatto", p.impatto, "colpi singoli", "spazza le orde"),
      misura("Pericolo", p.pericolo, "sicuro per la squadra", "rischio di fuoco amico"),
    );
  }

  window.Grafica = { FAZIONI, ARMATURE, emblemaFazione, iconaOggetto, segno, barre, potenza, anelli, gittata, profilo, VOCI };
})();
