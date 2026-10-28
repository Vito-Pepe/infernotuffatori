// Ottimizzatore: la build con il punteggio più alto per una fazione (la potenza totale delle
// nostre metriche) e, per una build, i cambi che alzano di più il punteggio.
// Solo build che si possono portare in missione: al massimo uno zaino, un'arma di supporto
// e un veicolo (nei punteggi i veicoli si sommerebbero come se si guidassero insieme), e
// passiva e peso di un'armatura che esiste nel gioco.
// La ricerca: discese da più partenze (una costruita scegliendo ogni volta il pezzo che
// rende di più, le altre a caso ma sempre le stesse), cambiando un pezzo alla volta o due
// stratagemmi insieme finché il punteggio sale. A parità di catalogo il risultato è sempre
// lo stesso.
// Funziona nel browser (window.Ottimizzatore) e in Node (per i test).
(function (radice, crea) {
  if (typeof module === "object" && module.exports) module.exports = crea(require("./metriche.js"));
  else radice.Ottimizzatore = crea(radice.Metriche);
})(typeof self !== "undefined" ? self : this, function (M) {
  "use strict";

  // Posti della build nell'ordine dell'ottimizzatore: l'armatura è passiva e peso insieme
  const POSTI = ["primaria", "secondaria", "granata", "stratagemma", "stratagemma", "stratagemma", "stratagemma", "armatura", "potenziamento"];
  const STRAT = [3, 4, 5, 6];
  const PESI = ["leggera", "media", "pesante"];
  // Ordine degli stratagemmi scelti dall'ottimizzatore, come nelle schermate del gioco
  const ORDINE_TIPI = ["arma", "zaino", "aquila", "orbitale", "torretta", "postazione", "veicolo"];
  // Sotto questo guadagno un cambio non vale la pena (i punteggi si mostrano con un decimale)
  const MINIMO = 0.05;
  const EPS = 1e-9;
  const PARTENZE = 12;

  // Numeri casuali ripetibili (mulberry32)
  function casuale(seme) {
    let a = seme >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Passiva e peso come una voce sola
  function combo(t, passiva, peso) {
    const p = (passiva && t.voci.get(passiva)) || null;
    const nome = t.pesi[peso] ? peso : "media";
    const w = t.pesi[nome];
    return { o: p ? p.o : null, posto: "armatura", passiva: p ? passiva : null, peso: nome, kpm: [0, 0, 0], mano: false, s: w.s * (p ? p.s : 1), u: w.u * (p ? p.u : 1), c: p ? p.c : 1, d: p ? p.d : null, zaino: false, arma: false };
  }

  const cacheCandidati = new WeakMap();

  // Per ogni posto gli oggetti che ci vanno. Per l'armatura solo le coppie passiva e peso di
  // un'armatura vera, con i nomi delle armature (se il catalogo non le ha: tutte le coppie)
  function candidatiDi(t, catalogo) {
    if (cacheCandidati.has(t)) return cacheCandidati.get(t);
    const c = { primaria: [], secondaria: [], granata: [], stratagemma: [], armatura: [], potenziamento: [] };
    for (const v of t.voci.values()) if (c[v.posto] && v.posto !== "armatura") c[v.posto].push(v);
    const nomi = new Map();
    for (const a of catalogo.armature || []) {
      if (!a.passivaId || !t.voci.has(a.passivaId) || !t.pesi[a.peso]) continue;
      const k = `${a.passivaId}|${a.peso}`;
      if (!nomi.has(k)) nomi.set(k, []);
      nomi.get(k).push(a.nome);
    }
    for (const v of t.voci.values()) {
      if (v.posto !== "armatura") continue;
      for (const peso of PESI) {
        const k = `${v.o.id}|${peso}`;
        if (nomi.size && !nomi.has(k)) continue;
        c.armatura.push({ ...combo(t, v.o.id, peso), armature: nomi.get(k) || [] });
      }
    }
    const out = { ...c, nomiArmature: nomi };
    cacheCandidati.set(t, out);
    return out;
  }

  function armatureCon(cand, passiva, peso) {
    return (passiva && cand.nomiArmature.get(`${passiva}|${peso}`)) || [];
  }

  // Le voci di una build nei posti dell'ottimizzatore
  function sceltaDi(build, t) {
    const prendi = (id) => (id && t.voci.get(id)) || null;
    return [
      prendi(build.primaria),
      prendi(build.secondaria),
      prendi(build.granata),
      ...[0, 1, 2, 3].map((i) => prendi(build.stratagemmi?.[i])),
      combo(t, build.armatura?.passiva, build.armatura?.peso),
      prendi(build.potenziamento),
    ];
  }

  function restoDi(t, scelta, esclusi) {
    return M.sommaVoci(t, scelta.filter((v, i) => !esclusi.includes(i)));
  }

  const stessa = (a, b) => a === b || (a && b && a.posto === "armatura" && a.passiva === b.passiva && a.peso === b.peso);

  // Due stratagemmi che non stanno insieme: due zaini, due armi di supporto, due veicoli
  const insieme = (a, b) => !((a.zaino && b.zaino) || (a.arma && b.arma) || (a.veicolo && b.veicolo));

  // Uno stratagemma che si può aggiungere agli altri: non già scelto e che sta con tutti
  function ammesso(v, altri) {
    for (const a of altri) if (a === v || !insieme(v, a)) return false;
    return true;
  }

  const altriStrat = (scelta, esclusi) => STRAT.filter((j) => !esclusi.includes(j)).map((j) => scelta[j]).filter(Boolean);

  // Il cambio migliore di un pezzo solo (o di due stratagemmi insieme, con coppie = true)
  function mossaMigliore(t, cand, scelta, liberi, attuale, coppie) {
    let meglio = null;
    const prova = (x, cambi) => {
      if (x > (meglio ? meglio.x : attuale) + EPS) meglio = { x, cambi };
    };
    if (!coppie) {
      for (const i of liberi) {
        const r = restoDi(t, scelta, [i]);
        const strat = STRAT.includes(i);
        const altri = strat ? altriStrat(scelta, [i]) : null;
        for (const v of cand[POSTI[i]]) {
          if (stessa(v, scelta[i]) || (strat && !ammesso(v, altri))) continue;
          prova(M.totaleVoci(t, r, v), [[i, v]]);
        }
      }
      return meglio;
    }
    const libere = liberi.filter((i) => STRAT.includes(i));
    for (let a = 0; a < libere.length; a++) {
      for (let b = a + 1; b < libere.length; b++) {
        const i = libere[a];
        const j = libere[b];
        const r = restoDi(t, scelta, [i, j]);
        const altri = altriStrat(scelta, [i, j]);
        const lista = cand.stratagemma.filter((v) => ammesso(v, altri));
        for (let x = 0; x < lista.length; x++) {
          const v = lista[x];
          for (let y = x + 1; y < lista.length; y++) {
            const w = lista[y];
            if (!insieme(v, w)) continue;
            prova(M.totaleVoci(t, r, v, w), [[i, v], [j, w]]);
          }
        }
      }
    }
    return meglio;
  }

  // Discesa: si cambia il pezzo che rende di più finché si sale, poi si provano le coppie
  // di stratagemmi
  function discesa(t, cand, scelta, liberi) {
    let attuale = M.totaleVoci(t, M.sommaVoci(t, scelta));
    for (;;) {
      const m = mossaMigliore(t, cand, scelta, liberi, attuale, false) || mossaMigliore(t, cand, scelta, liberi, attuale, true);
      if (!m) return attuale;
      for (const [i, v] of m.cambi) scelta[i] = v;
      attuale = m.x;
    }
  }

  // Partenza costruita: ogni volta il pezzo che alza di più il punteggio
  function costruita(t, cand, scelta, liberi) {
    const vuoti = new Set(liberi.filter((i) => !scelta[i]));
    while (vuoti.size) {
      let meglio = null;
      const r = restoDi(t, scelta, []);
      for (const i of vuoti) {
        const strat = STRAT.includes(i);
        const altri = strat ? altriStrat(scelta, [i]) : null;
        for (const v of cand[POSTI[i]]) {
          if (strat && !ammesso(v, altri)) continue;
          const x = M.totaleVoci(t, r, v);
          if (!meglio || x > meglio.x + EPS) meglio = { x, i, v };
        }
      }
      if (!meglio) break;
      scelta[meglio.i] = meglio.v;
      vuoti.delete(meglio.i);
    }
    return scelta;
  }

  // Partenza a caso (ripetibile)
  function aCaso(cand, scelta, liberi, rnd) {
    for (const i of liberi) {
      const lista = STRAT.includes(i) ? cand.stratagemma.filter((v) => ammesso(v, altriStrat(scelta, [i]))) : cand[POSTI[i]];
      if (lista.length) scelta[i] = lista[Math.floor(rnd() * lista.length)];
    }
    return scelta;
  }

  function buildDi(fazione, scelta, base = {}) {
    const id = (v) => (v && v.o ? v.o.id : null);
    return {
      ...base,
      fazione,
      primaria: id(scelta[0]),
      secondaria: id(scelta[1]),
      granata: id(scelta[2]),
      stratagemmi: STRAT.map((i) => id(scelta[i])),
      armatura: { passiva: scelta[7]?.passiva || null, peso: scelta[7]?.peso || "media" },
      potenziamento: id(scelta[8]),
    };
  }

  // Stratagemmi scelti dall'ottimizzatore in ordine di tipo, nei posti liberi
  function ordinaStrat(scelta, liberi) {
    const posti = STRAT.filter((i) => liberi.includes(i));
    const presi = posti.map((i) => scelta[i]).filter(Boolean);
    const rango = (v) => {
      const r = ORDINE_TIPI.indexOf(v.o.tipo);
      return r < 0 ? ORDINE_TIPI.length : r;
    };
    presi.sort((a, b) => rango(a) - rango(b) || a.o.nome.localeCompare(b.o.nome));
    posti.forEach((i, k) => (scelta[i] = presi[k] || null));
  }

  // La build migliore per una fazione. Con fissi (una build) si tengono i pezzi già scelti:
  // armi, granata, stratagemmi e potenziamento; passiva e peso se c'è la passiva.
  function ottimizza(catalogo, fazione, { fissi = null, partenze = PARTENZE, seme = 1 } = {}) {
    const t = M.tavola(catalogo, fazione);
    const cand = candidatiDi(t, catalogo);
    const iniziale = fissi ? sceltaDi(fissi, t) : new Array(POSTI.length).fill(null);
    if (fissi && !iniziale[7].passiva) iniziale[7] = null;
    const liberi = POSTI.map((_, i) => i).filter((i) => !iniziale[i]);
    const rnd = casuale(seme);
    let meglio = null;
    for (let p = 0; p < Math.max(1, partenze); p++) {
      const scelta = p === 0 ? costruita(t, cand, [...iniziale], liberi) : aCaso(cand, [...iniziale], liberi, rnd);
      const x = discesa(t, cand, scelta, liberi);
      if (!meglio || x > meglio.x + EPS) meglio = { x, scelta };
    }
    const scelta = meglio.scelta;
    ordinaStrat(scelta, liberi);
    const build = buildDi(fazione, scelta, fissi ? { nome: fissi.nome, note: fissi.note, variante: fissi.variante } : {});
    return { build, punteggio: meglio.x, armature: armatureCon(cand, build.armatura.passiva, build.armatura.peso) };
  }

  // Per una build: per ogni posto il cambio che alza di più il punteggio (per gli
  // stratagemmi uno per posto, con oggetti diversi), dal più utile
  function consigli(build, catalogo) {
    const fazione = build.fazione || "terminidi";
    const t = M.tavola(catalogo, fazione);
    const cand = candidatiDi(t, catalogo);
    const scelta = sceltaDi(build, t);
    const base = M.totaleVoci(t, M.sommaVoci(t, scelta));
    const mosse = [];
    for (const i of [0, 1, 2, 7, 8]) {
      const r = restoDi(t, scelta, [i]);
      let meglio = null;
      for (const v of cand[POSTI[i]]) {
        if (stessa(v, scelta[i])) continue;
        const x = M.totaleVoci(t, r, v);
        if (!meglio || x > meglio.x + EPS) meglio = { x, v };
      }
      if (!meglio || meglio.x - base < MINIMO) continue;
      const m = { posto: POSTI[i], da: scelta[i]?.o?.id || null, a: meglio.v.o.id, guadagno: meglio.x - base };
      if (i === 7) Object.assign(m, { peso: meglio.v.peso, pesoPrima: scelta[7].peso, armature: meglio.v.armature });
      mosse.push(m);
    }
    const proposte = [];
    for (const i of STRAT) {
      const r = restoDi(t, scelta, [i]);
      const altri = altriStrat(scelta, [i]);
      for (const v of cand.stratagemma) {
        if (v === scelta[i] || !ammesso(v, altri)) continue;
        const x = M.totaleVoci(t, r, v);
        if (x - base >= MINIMO) proposte.push({ i, v, x });
      }
    }
    // Consigli che si possono seguire tutti: posti e oggetti diversi, che stanno insieme
    proposte.sort((a, b) => b.x - a.x);
    const posti = new Set();
    const presi = [];
    for (const p of proposte) {
      if (posti.has(p.i) || !ammesso(p.v, presi)) continue;
      posti.add(p.i);
      presi.push(p.v);
      mosse.push({ posto: "stratagemma", indice: p.i - 3, da: scelta[p.i]?.o.id || null, a: p.v.o.id, guadagno: p.x - base });
    }
    mosse.sort((a, b) => b.guadagno - a.guadagno);
    const a = build.armatura || {};
    return { punteggio: base, mosse, armature: armatureCon(cand, a.passiva, t.pesi[a.peso] ? a.peso : "media") };
  }

  // Punteggio della build con ogni oggetto di un posto al posto di quello che c'è (per gli
  // stratagemmi il posto numero indice; per l'armatura la passiva, con il peso scelto)
  function prova(build, catalogo, posto, indice = 0) {
    const t = M.tavola(catalogo, build.fazione || "terminidi");
    const scelta = sceltaDi(build, t);
    const i = posto === "stratagemma" ? STRAT[indice] : POSTI.indexOf(posto);
    const r = restoDi(t, scelta, [i]);
    const punteggi = new Map();
    for (const v of t.voci.values()) {
      if (v.posto !== posto) continue;
      punteggi.set(v.o.id, M.totaleVoci(t, r, posto === "armatura" ? combo(t, v.o.id, scelta[7].peso) : v));
    }
    const vuoto = posto === "armatura" ? combo(t, null, scelta[7].peso) : null;
    return { base: M.totaleVoci(t, M.sommaVoci(t, scelta)), senza: M.totaleVoci(t, r, vuoto), punteggi };
  }

  return { ottimizza, consigli, prova, MINIMO };
});
