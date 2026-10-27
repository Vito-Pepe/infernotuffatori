// Importazione delle build dai link di condivisione di democracy-hub.net
// (builder.php?v=...). Il parametro v è un elenco in JSON, in base64 per URL:
// [fazione (0 Terminidi, 1 Automi, 2 Illuminati), variante, primaria, secondaria, granata,
//  4 stratagemmi, armatura "PASSIVA (PESO)", potenziamento], con i nomi in maiuscolo.
// Funziona nel browser (window.Democracy) e in Node (per i test).
(function (radice, crea) {
  if (typeof module === "object" && module.exports) module.exports = crea();
  else radice.Democracy = crea();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const FAZIONI = ["terminidi", "automi", "illuminati"];
  const PESI = { LIGHT: "leggera", MEDIUM: "media", HEAVY: "pesante" };

  // Confronto tollerante: maiuscole, grafia inglese/americana, niente punteggiatura
  function normalizza(nome) {
    return String(nome || "")
      .toUpperCase()
      .replace(/[“”"']/g, "")
      .replace(/ARMOUR/g, "ARMOR")
      .replace(/ISATION/g, "IZATION")
      .replace(/ISER\b/g, "IZER")
      .replace(/SABRE/g, "SABER")
      .replace(/([A-Z])LLER\b/g, "$1LER")
      .replace(/&/g, "AND")
      .replace(/[^A-Z0-9]/g, "");
  }

  function senzaSigla(nome) {
    const pezzi = String(nome).trim().split(/\s+/);
    return pezzi.length > 1 && /[\d/]/.test(pezzi[0]) ? pezzi.slice(1).join(" ") : String(nome).trim();
  }

  function base64url(testo) {
    let b = String(testo).replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    if (typeof atob === "function") return decodeURIComponent(escape(atob(b)));
    return Buffer.from(b, "base64").toString("utf8");
  }

  // Tutti i link nel testo incollato, con il nome scritto prima del link sulla stessa riga
  function estrai(testo) {
    const out = [];
    for (const riga of String(testo || "").split(/\r?\n/)) {
      const m = riga.match(/https?:\/\/\S*[?&]v=([A-Za-z0-9_\-+/=%]+)/);
      if (!m) continue;
      const nome = riga
        .slice(0, m.index)
        .replace(/[:\-–|]+\s*$/, "")
        .trim()
        .slice(0, 60);
      try {
        const dati = JSON.parse(base64url(decodeURIComponent(m[1])));
        if (Array.isArray(dati)) out.push({ nome, dati, link: m[0] });
        else out.push({ nome, errore: "link non valido" });
      } catch {
        out.push({ nome, errore: "link non valido", link: m[0] });
      }
    }
    return out;
  }

  function cerca(nome, slot, catalogo) {
    if (!nome || /^NO\s/i.test(nome)) return null;
    const candidati = (catalogo.oggetti || []).filter((o) => o.slot === slot);
    for (const prova of [normalizza(nome), normalizza(senzaSigla(nome))]) {
      const o = candidati.find((x) => normalizza(x.nome) === prova) || candidati.find((x) => normalizza(senzaSigla(x.nome)) === prova);
      if (o) return o;
    }
    return null;
  }

  // Da un elenco di democracy-hub a una build dell'app. `mancanti`: nomi non trovati nel catalogo.
  function aBuild(voce, catalogo) {
    const d = voce.dati;
    const mancanti = [];
    const prendi = (nome, slot) => {
      const o = cerca(nome, slot, catalogo);
      if (nome && !o && !/^NO\s/i.test(nome)) mancanti.push(nome);
      return o ? o.id : null;
    };
    let armatura = { passiva: null, peso: "media" };
    const testoArmatura = d[9];
    if (testoArmatura && !/^NO\s/i.test(testoArmatura)) {
      const m = String(testoArmatura).match(/^(.*?)\s*\((LIGHT|MEDIUM|HEAVY)\)\s*$/i);
      armatura = { passiva: prendi(m ? m[1] : testoArmatura, "armatura"), peso: m ? PESI[m[2].toUpperCase()] : "media" };
    }
    const build = {
      nome: voce.nome || "Build importata",
      fazione: FAZIONI[d[0]] || "terminidi",
      variante: typeof d[1] === "string" && d[1] !== "NORMAL" ? d[1].slice(0, 40) : null,
      primaria: prendi(d[2], "primaria"),
      secondaria: prendi(d[3], "secondaria"),
      granata: prendi(d[4], "granata"),
      stratagemmi: [d[5], d[6], d[7], d[8]].map((n) => prendi(n, "stratagemma")),
      armatura,
      potenziamento: prendi(d[10], "potenziamento"),
      note: "",
    };
    // Lo stesso stratagemma due volte non è possibile: si tiene il primo
    build.stratagemmi = build.stratagemmi.map((id, i) => (id && build.stratagemmi.indexOf(id) === i ? id : null));
    return { build, mancanti };
  }

  return { estrai, aBuild, normalizza };
});
