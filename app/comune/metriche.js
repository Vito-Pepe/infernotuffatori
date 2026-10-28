// Metriche di una build, calcolate dai dati del gioco presi dalla wiki (nessun voto a mano):
// - potenza di fuoco contro nemici leggeri, medi e pesanti: quante uccisioni al minuto
//   riesce a fare ogni oggetto, colpo per colpo, contro l'anatomia vera dei nemici
//   (salute e corazza di ogni parte, perforazione, danno durevole, esplosioni, fuoco);
// - sopravvivenza, utilità e controllo: regole sul tipo di oggetto e sui suoi effetti;
// - obiettivi: quante strutture della fazione si possono distruggere (forza di demolizione);
// - gittata, rumore, ritmo, impatto e pericolo.
// Le costanti qui sotto sono le nostre scelte: sono spiegate nella pagina "Come calcoliamo".
// Funziona nel browser (window.Metriche) e in Node (per i test).
(function (radice, crea) {
  if (typeof module === "object" && module.exports) module.exports = crea();
  else radice.Metriche = crea();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CLASSI = ["leggero", "medio", "pesante"];

  // Uccisioni al minuto che valgono 5 su 10 (metà scala) per ogni classe di nemico
  const RIFERIMENTO = { leggero: 30, medio: 8, pesante: 1 };
  // Secondi per passare al bersaglio successivo (trovarlo, mirare)
  const TEMPO_BERSAGLIO = { leggero: 0.6, medio: 1, pesante: 1.5 };
  // Nemici per metro quadro dove c'è uno scontro, e quanti al massimo ne prende un'esplosione
  const DENSITA = { leggero: 0.04, medio: 0.012, pesante: 0 };
  const MAX_BERSAGLI = { leggero: 10, medio: 4, pesante: 1 };
  const MAX_BERSAGLI_STRATAGEMMA = { leggero: 18, medio: 6, pesante: 1.5 };
  // Minuti coperti dalle munizioni che si portano (poi si fa rifornimento) e durata di una missione
  const FINESTRA = 3;
  const MISSIONE = 40;
  // Quanto conta ogni posto nella potenza di fuoco
  const PESO = { primaria: 1, secondaria: 0.35, granata: 1, stratagemma: 1 };
  // Parti difficili da colpire: si conta come se servissero più colpi. Le parti interne
  // (carne sotto la corazza) non contano: prima bisogna togliere la corazza.
  // Per i pesanti (che caricano, si muovono, sono grandi bersagli che colpiscono forte) i
  // punti deboli e il retro sono più difficili da prendere.
  const DIFFICOLTA = {
    debole: { leggero: 1.35, medio: 1.35, pesante: 2 },
    retro: { leggero: 2, medio: 3, pesante: 4 },
    altra: { leggero: 1.2, medio: 1.2, pesante: 1.5 },
  };
  const PARTI_NASCOSTE = /inner|flesh|internal|exposed/i;
  const PARTI_DEBOLI = /head|eye|pilot|weak/i;
  const PARTI_RETRO = /butt|heatsink|vent|engine|rear|underside|sac/i;
  // Oltre questi secondi per abbattere un nemico lo scontro diventa un problema
  // (il nemico arriva, chiama rinforzi, colpisce): l'efficacia cala col quadrato,
  // col cubo per i pesanti
  const TEMPO_MASSIMO = { leggero: 2, medio: 5, pesante: 4 };
  const ESPONENTE = { leggero: 2, medio: 2, pesante: 3 };
  // Contro un pesante, un'arma che non perfora la corazza del corpo e deve puntare ai
  // punti deboli rende un terzo
  const SOLO_PUNTI_DEBOLI = 1 / 3;
  // I droni degli zaini sparano peggio di chi li porta; torrette e postazioni restano dove
  // sono e prendono solo i nemici che passano di lì
  const RESA_DRONE = 0.5;
  const RESA_TORRETTA = 0.5;
  const DURATA_TORRETTA = 60;
  // Armi in mano: se ne usa una alla volta (conta la migliore e un quarto della seconda)
  const SECONDA_ARMA = 0.25;
  // Pallettoni che arrivano a segno, a distanza da combattimento
  const PALLETTONI_A_SEGNO = 0.75;
  // Getti (lanciafiamme): colpi al secondo se la wiki non dà i DPS
  const GETTI_AL_SECONDO = 75;
  // Raggi a colpi (Meltagun): quanto dura un colpo, in secondi
  const DURATA_COLPO_RAGGIO = 0.5;
  // Colpi per uso degli stratagemmi senza questo dato (tappeti di bombe, mine)
  const IMPATTI_STIMATI = [
    [/cluster/i, 18],
    [/strafing/i, 25],
    [/airstrike|napalm airstrike|gas airstrike/i, 5],
    [/rocket pods/i, 4],
    [/mine/i, 10],
  ];
  // Soglie consigliate (minimo e sicuro) per la potenza di fuoco
  const SOGLIE = { leggero: [4, 6], medio: [4, 6], pesante: [3, 5] };

  const PESI_ARMATURA = {
    leggera: { nome: "Leggera", valore: 50, velocita: 550, sopravvivenza: 2.5, utilita: 2, ritmo: 75 },
    media: { nome: "Media", valore: 100, velocita: 500, sopravvivenza: 3.5, utilita: 1, ritmo: 60 },
    pesante: { nome: "Pesante", valore: 150, velocita: 450, sopravvivenza: 4.5, utilita: 0, ritmo: 45 },
  };

  const satura = (x, rif) => (x <= 0 ? 0 : (10 * x) / (x + rif));
  const limita = (x, a, b) => Math.max(a, Math.min(b, x));
  const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  // Somma con rendimenti decrescenti: due cose da 5 fanno 7,5, non 10
  const combina = (valori) => 10 * (1 - valori.reduce((p, v) => p * (1 - limita(v, 0, 10) / 10), 1));

  function moltiplicatore(ap, av) {
    return ap > av ? 1 : ap === av ? 0.65 : 0;
  }

  // --- Dal catalogo alle "fonti di danno" ---

  // Componenti che colpiscono il bersaglio (senza il ritorno di fiamma dei lanciarazzi)
  function colpiPiatti(c) {
    return (c?.colpi || []).filter((x) => x.tipo !== "arma" && !x.retro);
  }

  // Armi monouso (EAT): due lanciatori a ogni chiamata
  const LANCIATORI_PER_CHIAMATA = 2;

  function dpsDichiarati(o) {
    const m = String(o.scheda?.danno || "").match(/([\d,.]+)\s*DPS/i);
    return m ? Number(m[1].replace(/,/g, "")) : null;
  }

  // Modalità di fuoco: ogni attacco di primo livello con quello che ne discende (il
  // proiettile e la sua esplosione). Due proiettili di primo livello sono due modalità
  // (munizioni diverse, colpo caricato): si sceglie la migliore, non si sommano.
  function modi(componenti) {
    if (!componenti.some((x) => x.attacco)) return [componenti];
    const nomi = new Set(componenti.map((x) => x.attacco));
    const radici = componenti.filter((x) => !x.padre || !nomi.has(x.padre));
    const discendenti = (r, visti) =>
      componenti
        .filter((y) => y.padre === r.attacco && !visti.has(y))
        .flatMap((y) => {
          visti.add(y);
          return [y, ...discendenti(y, visti)];
        });
    const sciolti = radici.filter((r) => r.tipo === "stato");
    const gruppi = radici.filter((r) => r.tipo !== "stato").map((r) => [r, ...discendenti(r, new Set([r])), ...sciolti]);
    // Modalità uguali (stessi numeri) contano una volta
    const viste = new Set();
    const uniche = gruppi.filter((g) => {
      const firma = JSON.stringify(g.map((x) => [x.tipo, x.danno, x.ap, x.raggi]));
      if (viste.has(firma)) return false;
      viste.add(firma);
      return true;
    });
    return uniche.length ? uniche : [componenti];
  }

  // Ogni fonte: le modalità di un colpo e il ritmo con cui si spara
  function fonti(o) {
    const c = o.combattimento;
    if (!c) return [];
    const out = [];
    const base = colpiPiatti(c);
    const armi = (c.colpi || []).filter((x) => x.tipo === "arma");
    if (base.some((x) => x.tipo !== "stato")) out.push(fonte(o, c, base, true));
    for (const a of armi) {
      const comp = colpiPiatti(a);
      if (comp.some((x) => x.tipo !== "stato")) out.push(fonte(o, a, comp, false));
    }
    return out;
  }

  // Colpo caricato (Railgun, Epoch): si conta la carica a metà tra minima e massima
  function carica(dati) {
    const m = dati.carica?.proj_multipliers?.damage_mod;
    const tempi = (dati.carica?.charge || []).map((x) => x.charge_time).filter((x) => x > 0);
    const molt = Array.isArray(m) && Math.max(...m) > 1 ? (Math.min(...m) + Math.max(...m)) / 2 : 1;
    return { molt, tempo: tempi.length ? tempi[Math.floor(tempi.length / 2)] : 0 };
  }

  function fonte(o, dati, componenti, principale) {
    const s = o.scheda || {};
    const caricatore = dati.caricatore || (principale ? s.caricatore : null) || null;
    const calore = dati.munizioni === "heat";
    // Un raggio con caricatore (Meltagun) spara colpi brevi, non un raggio continuo
    const raggioAColpi = !calore && caricatore && componenti.some((x) => x.tipo === "raggio");
    const continuo = !raggioAColpi && componenti.some((x) => x.tipo === "raggio" || x.tipo === "spruzzo");
    const c = carica(dati);
    const dichiarati = principale ? dpsDichiarati(o) : null;
    const comp = componenti.map((x) => {
      if (x.tipo === "spruzzo") {
        // Getti: un "colpo" è un secondo di fuoco
        const dps = dichiarati && x.danno < 20 ? dichiarati : x.danno < 20 ? x.danno * GETTI_AL_SECONDO : x.danno;
        return { ...x, danno: dps, durevole: dps * (x.durevole / Math.max(x.danno, 1e-9)) };
      }
      if (x.tipo === "raggio" && raggioAColpi) return { ...x, danno: x.danno * DURATA_COLPO_RAGGIO, durevole: x.durevole * DURATA_COLPO_RAGGIO };
      if ((x.tipo === "proiettile" || x.tipo === "raggio") && c.molt > 1) return { ...x, danno: x.danno * c.molt, durevole: x.durevole * c.molt };
      return x;
    });
    const cadenza = continuo ? 60 : (principale && s.cadenza) || dati.cadenza || 60;
    let riserva = dati.riserva ?? (principale ? s.riserva : null) ?? null;
    // Armi che si ricaricano un colpo alla volta (fucili a pompa, Evictor, Autocannon): la
    // wiki dà i colpi di riserva, non i caricatori (la Punisher ne ha 16 nel tubo e 60 di
    // riserva). Qui la riserva si conta in caricatori. Per l'arma principale vale la scheda
    // (i dati a volte danno i colpi di un rifornimento), per quelle annidate (lanciagranate
    // sotto la canna) i dati; senza nessuno dei due (armi a nastro) niente riserva
    if (dati.munizioni === "rounds" && caricatore) riserva = ((principale ? s.riserva : dati.riserva) ?? 0) / caricatore;
    // Monouso: i colpi disponibili dipendono da quante volte si richiama l'arma
    const monouso = (o.tratti || []).includes("Expendable");
    if (monouso && caricatore) {
      const chiamate = (FINESTRA * 60) / ((s.attesa || 70) + (s.chiamata || 3));
      riserva = Math.max(0, chiamate * LANCIATORI_PER_CHIAMATA - 1);
    }
    const insieme = o.slot === "granata" || (o.slot === "stratagemma" && !["arma", "zaino"].includes(o.tipo));
    return {
      componenti: comp,
      modi: insieme ? [comp] : modi(comp),
      cadenza,
      intervallo: Math.max(60 / cadenza, c.tempo),
      continuo,
      caricatore,
      riserva,
      calore,
      ricarica: monouso ? 3 : (principale && s.ricarica) || 2.5,
    };
  }

  // --- Danno contro un nemico ---

  function partePrincipale(n) {
    return n.parti.find((p) => p.main) || n.parti[0];
  }

  function difficolta(p, classe = "medio") {
    if (p.main) return 1;
    if (PARTI_RETRO.test(p.nome)) return DIFFICOLTA.retro[classe];
    if (PARTI_DEBOLI.test(p.nome)) return DIFFICOLTA.debole[classe];
    return DIFFICOLTA.altra[classe];
  }

  // Danno di un colpo su una parte: { parte: alla salute della parte, main: alla salute principale }
  function dannoSuParte(componenti, p, main, pallettoni = true) {
    let parte = 0;
    let principale = 0;
    for (const x of componenti) {
      if (x.tipo === "stato") continue;
      if (x.tipo === "esplosione") {
        // Le esplosioni ignorano la durevolezza e colpiscono la salute principale
        principale += x.danno * moltiplicatore(x.ap, main.av) * (1 - (main.resistenzaEsplosioni || 0));
        continue;
      }
      const m = moltiplicatore(x.ap, p.av);
      if (!m) continue;
      const n = (x.proiettili || 1) * (pallettoni && x.proiettili > 1 ? PALLETTONI_A_SEGNO : 1);
      const d = (x.danno * (1 - p.durevole) + x.durevole * p.durevole) * m * n;
      if (p.main) principale += d;
      else if (p.salute === "main") principale += d * (p.versoMain ?? 1);
      else {
        parte += d;
        principale += d * (p.versoMain ?? 0);
      }
    }
    return { parte, principale };
  }

  // Danno nel tempo (fuoco, gas): una volta per nemico, solo sulla salute principale
  function dannoNelTempo(componenti, n) {
    const main = partePrincipale(n);
    let tot = 0;
    for (const x of componenti) {
      if (x.tipo !== "stato" || !x.dps || !x.durata) continue;
      const fuoco = /fire|burn/i.test(x.nome) ? n.fuoco ?? 1 : 1;
      tot += x.dps * x.durata * fuoco * moltiplicatore(x.ap ?? 0, main.av);
    }
    return tot;
  }

  // Colpi per uccidere un nemico, scegliendo la parte più conveniente
  function colpiPerUccidere(componenti, n) {
    const main = partePrincipale(n);
    const salute = Math.max(1, n.salute - dannoNelTempo(componenti, n));
    let migliore = { colpi: Infinity, pesati: Infinity, parte: null };
    for (const p of n.parti) {
      if (!p.main && PARTI_NASCOSTE.test(p.nome)) continue;
      const d = dannoSuParte(componenti, p, main);
      let colpi = d.principale > 0 ? Math.ceil(salute / d.principale) : Infinity;
      if (!p.main && p.fatale && typeof p.salute === "number" && d.parte > 0) colpi = Math.min(colpi, Math.ceil(p.salute / d.parte));
      const pesati = colpi * difficolta(p, n.classe);
      if (pesati < migliore.pesati) migliore = { colpi, pesati, parte: p.nome };
    }
    // Perfora la corazza del corpo? (altrimenti si vive di punti deboli)
    migliore.perfora = componenti.some((x) => x.tipo !== "stato" && (x.danno > 0 || x.durevole > 0) && (x.ap || 0) >= main.av);
    return migliore;
  }

  function raggioEsplosione(componenti) {
    return Math.max(0, ...componenti.filter((x) => x.tipo === "esplosione" && x.danno > 0).map((x) => x.raggi?.[1] || 0));
  }

  // Nemici colpiti insieme: esplosioni, archi a catena, getti, pallettoni che attraversano
  function bersagli(componenti, classe) {
    const r = raggioEsplosione(componenti);
    let b = 1 + Math.min(MAX_BERSAGLI[classe] - 1, DENSITA[classe] * Math.PI * r * r);
    const arco = componenti.find((x) => x.tipo === "arco");
    if (arco) b = Math.max(b, Math.min(MAX_BERSAGLI[classe], 1 + (arco.catena || 1)));
    if (componenti.some((x) => x.tipo === "spruzzo") && classe !== "pesante") b = Math.max(b, classe === "leggero" ? 3 : 1.5);
    return b;
  }

  // Uccisioni al minuto di un'arma contro un nemico: la modalità di fuoco migliore
  function uccisioniArma(f, n, munizioniLimitate = true) {
    let migliore = { kpm: 0, colpi: Infinity, parte: null };
    for (const componenti of f.modi || [f.componenti]) {
      const u = uccisioniModo(f, componenti, n, munizioniLimitate);
      if (u.kpm > migliore.kpm) migliore = u;
    }
    return migliore;
  }

  function uccisioniModo(f, componenti, n, munizioniLimitate) {
    const k = colpiPerUccidere(componenti, n);
    if (!Number.isFinite(k.colpi)) return { kpm: 0, colpi: Infinity, parte: null };
    const classe = n.classe;
    // Tempo per uccidere (contando i colpi a vuoto sui punti difficili) e tempo di
    // esposizione: per le armi lente si conta un secondo per colpo, non l'attesa tra i colpi
    let ricariche = 0;
    if (f.caricatore && !f.calore && k.pesati > f.caricatore) ricariche = Math.floor((k.pesati - 1) / f.caricatore) * f.ricarica;
    if (f.calore && f.caricatore && k.pesati > f.caricatore) ricariche = (k.pesati / f.caricatore) * f.ricarica * 0.5;
    // Ogni colpo costa un intervallo: un'arma lenta non uccide più in fretta della sua cadenza
    const tempo = f.continuo ? k.pesati : k.pesati * f.intervallo + ricariche;
    const esposizione = f.continuo ? k.pesati : k.pesati * Math.min(f.intervallo, 1) + ricariche;
    const b = bersagli(componenti, classe);
    let kpm = (60 / (tempo + TEMPO_BERSAGLIO[classe])) * b;
    if (esposizione > TEMPO_MASSIMO[classe]) kpm *= (TEMPO_MASSIMO[classe] / esposizione) ** ESPONENTE[classe];
    if (classe === "pesante" && !k.perfora) kpm *= SOLO_PUNTI_DEBOLI;
    // Munizioni: non si uccide più di quanto permettono i colpi che si hanno in FINESTRA minuti
    if (munizioniLimitate && f.caricatore && !f.calore && !f.continuo) {
      const colpiTotali = f.caricatore * ((f.riserva ?? 2) + 1);
      kpm = Math.min(kpm, ((colpiTotali / k.pesati) * b) / FINESTRA);
    }
    return { kpm, colpi: k.colpi, parte: k.parte };
  }

  // --- Stratagemmi a uso ---

  function usiAlMinuto(o) {
    const s = o.scheda || {};
    const ciclo = (s.attesa || 120) + (s.chiamata || 3);
    if (o.tipo === "aquila" && s.usi && s.riarmo) return (s.usi / (s.riarmo + s.usi * ciclo)) * 60;
    const libero = 60 / ciclo;
    return s.usi ? Math.min(libero, s.usi / MISSIONE) : libero;
  }

  function impattiPerUso(o) {
    const c = o.combattimento || {};
    if (c.bombe || c.salve) return (c.bombe || 1) * (c.salve || 1);
    const stima = IMPATTI_STIMATI.find(([re]) => re.test(o.nome));
    return stima ? stima[1] : 1;
  }

  // Uccisioni per uso di un attacco d'area (orbitale, aquila, mine) contro un nemico
  // Tutti i componenti, anche delle armi annidate (aerei, silo)
  function tuttiComponenti(c) {
    return (c?.colpi || []).flatMap((x) => (x.tipo === "arma" ? tuttiComponenti(x) : x.retro ? [] : [x]));
  }

  function uccisioniPerUso(o, n) {
    const tutti = tuttiComponenti(o.combattimento);
    const continui = tutti.filter((x) => x.tipo === "spruzzo" || x.tipo === "raggio");
    const colpo = tutti.filter((x) => !continui.includes(x));
    const main = partePrincipale(n);
    const classe = n.classe;
    const r = Math.max(raggioEsplosione(colpo), 2);
    const area = Math.max(o.combattimento?.area || 0, r);
    const presenti = classe === "pesante" ? 1 : Math.min(MAX_BERSAGLI_STRATAGEMMA[classe], 1 + DENSITA[classe] * Math.PI * area * area);
    let uccisi = 0;
    if (colpo.some((x) => x.tipo !== "stato")) {
      // Ogni nemico nella zona prende in media impatti × (raggio/zona)²; sui pesanti si
      // mira, quindi almeno un colpo pieno
      const impatti = impattiPerUso(o);
      const copertura = Math.min(1, (r * r) / (area * area));
      const attesi = Math.max(1, impatti * copertura);
      const k = colpiPerUccidere(colpo, n);
      if (Number.isFinite(k.colpi)) uccisi += presenti * Math.min(1, attesi / k.colpi);
    }
    if (continui.length) {
      // Laser e getti dall'orbita: danno al secondo per tutta la durata, distribuito sui
      // nemici della zona
      const durata = o.combattimento?.durata || 10;
      const dps = continui.reduce((s, x) => s + (x.tipo === "spruzzo" && x.danno < 100 ? x.danno * GETTI_AL_SECONDO : x.danno) * moltiplicatore(x.ap, main.av), 0);
      const max = { leggero: 25, medio: 8, pesante: 3 }[classe];
      uccisi += Math.min(max, (dps * durata + dannoNelTempo(tutti, n)) / n.salute);
    }
    return Math.min(uccisi, classe === "pesante" ? 3 : 30);
  }

  // --- Potenza di un oggetto contro i nemici di una fazione ---

  // I nemici di una fazione per i punteggi: quelli di sempre. Le sotto-fazioni (Cyborg Legion,
  // Jet Brigade, Predator Strain...) compaiono solo in alcune missioni: stanno nella Wiki, non qui
  function nemiciDi(catalogo, fazione) {
    return (catalogo.nemici || []).filter((n) => n.fazione === fazione && !n.sottofazione && n.parti?.length);
  }

  function analizzaOggetto(o, nemici) {
    const perClasse = { leggero: [], medio: [], pesante: [] };
    const dettagli = [];
    const lista = fonti(o);
    if (!lista.length) return { leggero: 0, medio: 0, pesante: 0, kpm: { leggero: 0, medio: 0, pesante: 0 }, dettagli };
    const strat = o.slot === "stratagemma";
    // Senza cadenza né caricatore nei dati: si usa una volta per chiamata (mine, Hellbomb
    // portatile, silo di missili), come un attacco d'area
    const senzaRitmo = !lista.some((f) => f.continuo || f.caricatore || (o.combattimento?.cadenza ?? o.scheda?.cadenza));
    const area = strat && (["orbitale", "aquila"].includes(o.tipo) || (senzaRitmo && o.tipo !== "torretta"));
    const mina = false;
    const usi = strat ? usiAlMinuto(o) : 1;
    for (const n of nemici) {
      let kpm = 0;
      let nota = null;
      let parte = null;
      if (area || mina) {
        kpm = uccisioniPerUso(o, n) * usi;
      } else if (o.slot === "granata") {
        const per = uccisioniPerUso({ ...o, combattimento: { ...o.combattimento, area: 0 } }, n);
        const lanci = o.combattimento?.iniziali || o.scheda?.quantita || 3;
        kpm = Math.min((per * lanci) / FINESTRA, per * 20);
      } else if (strat && ["torretta", "postazione", "veicolo"].includes(o.tipo)) {
        // Torrette, postazioni e mezzi: sparano finché durano (al più un minuto per le
        // torrette, che i nemici distruggono presto) o finché hanno colpi
        const durata = o.tipo === "veicolo" ? o.combattimento?.durata || 150 : Math.min(o.combattimento?.durata || 60, DURATA_TORRETTA);
        let perUso = 0;
        for (const f of lista) {
          const u = uccisioniArma(f, n, false);
          const colpiTotali = (f.caricatore || 100) * ((o.tipo === "veicolo" ? f.riserva : 0) + 1);
          perUso += Math.min((u.kpm * durata) / 60, Number.isFinite(u.colpi) ? (colpiTotali / u.colpi) * bersagli(f.componenti, n.classe) : 0);
        }
        if (o.tipo !== "veicolo") perUso *= RESA_TORRETTA;
        kpm = perUso * usi;
        if (o.tipo === "veicolo") kpm = Math.max(kpm, perUso / Math.max(1, MISSIONE / Math.max(1, o.scheda?.usi || 1)));
      } else {
        // Armi in mano (e droni): la fonte migliore
        for (const f of lista) {
          const u = uccisioniArma(f, n);
          if (u.kpm > kpm) {
            kpm = u.kpm;
            nota = u.colpi;
            parte = u.parte;
          }
        }
        if (o.tipo === "zaino") kpm *= RESA_DRONE;
      }
      perClasse[n.classe].push(kpm);
      // Colpi e parte migliore (dove mirare) solo per le armi in mano: servono alla wiki
      dettagli.push({ nemico: n.nome, classe: n.classe, kpm: Math.round(kpm * 10) / 10, colpi: nota, parte });
    }
    const kpm = Object.fromEntries(CLASSI.map((c) => [c, media(perClasse[c])]));
    return { ...Object.fromEntries(CLASSI.map((c) => [c, satura(kpm[c], RIFERIMENTO[c])])), kpm, dettagli };
  }

  // --- Regole per sopravvivenza, utilità, controllo ---

  function stati(o) {
    const nomi = [];
    const visita = (c) => (c?.colpi || []).forEach((x) => (x.tipo === "arma" ? visita(x) : x.tipo === "stato" && nomi.push(x.nome)));
    visita(o.combattimento);
    return nomi;
  }

  function maxCampo(o, campo) {
    let m = 0;
    const visita = (c) => (c?.colpi || []).forEach((x) => (x.tipo === "arma" ? visita(x) : !x.retro && (m = Math.max(m, x[campo] || 0))));
    visita(o.combattimento);
    return m;
  }

  const EMBLEMA_SOPRAVVIVENZA = { scudo: 3, esplosione: 2.5, cuore: 3, bandiera: 3, croce: 3, fuoco: 1.5, gas: 1.5, fulmine: 1.5, sole: 1.5, piede: 1.5, occhio: 1.5, corsa: 1, mirino: 0.5, granata: 0.5, caricatore: 0.5, rinforzi: 1.5, radar: 1, capsula: 0.5 };
  const EMBLEMA_UTILITA = { occhio: 2, granata: 2, caricatore: 2, corsa: 1.5, mirino: 1, croce: 1, rinforzi: 3, capsula: 2.5, radar: 2.5, campioni: 1.5, navetta: 1.5, goccia: 1, razzo: 2 };

  function disponibilita(o) {
    if (o.slot === "stratagemma") {
      if (o.tipo === "zaino" || o.tipo === "arma" || o.tipo === "veicolo") return 1;
      return limita(120 / ((o.scheda?.attesa || 120) + (o.scheda?.chiamata || 3)), 0.25, 1);
    }
    return o.slot === "granata" ? 0.8 : o.slot === "secondaria" ? 0.6 : 1;
  }

  function sopravvivenza(o) {
    const n = o.nome;
    if (o.slot === "armatura" || o.slot === "potenziamento") return EMBLEMA_SOPRAVVIVENZA[o.emblema] || 0;
    if (/shield generator pack/i.test(n)) return 5;
    if (/ballistic shield|directional shield/i.test(n)) return 3.5;
    if (/shield generator relay/i.test(n)) return 3;
    if (/supply pack/i.test(n)) return 2;
    if (/stim pistol/i.test(n)) return 2;
    if (/smoke/i.test(n)) return 2;
    if (o.slot === "granata" && /shield/i.test(n)) return 3;
    if (o.tipo === "veicolo") return (o.combattimento?.salute || 0) >= 1500 ? 3 : 1.5;
    if (o.tipo === "torretta" || o.tipo === "postazione") return 1;
    if (o.tipo === "zaino" && fonti(o).length) return 1;
    if (stati(o).some((s) => /^Stun/.test(s))) return 1;
    return 0;
  }

  function utilita(o) {
    const n = o.nome;
    if (o.slot === "armatura" || o.slot === "potenziamento") return EMBLEMA_UTILITA[o.emblema] || 0;
    if (/supply pack/i.test(n)) return 5;
    if (/supply frv/i.test(n)) return 4;
    if (/jump pack|hover pack|warp pack/i.test(n)) return 4;
    if (o.tipo === "veicolo") return /frv|maelstrom|bastion/i.test(n) ? 3 : 1;
    if (/c4 pack|hellbomb|breaching hammer|defoliation/i.test(n)) return 2;
    if (/one true flag/i.test(n)) return 1.5;
    return 0;
  }

  function controllo(o) {
    if (o.slot === "armatura" || o.slot === "potenziamento") return /stun pods|motivational/i.test(o.nome) ? 1.5 : 0;
    let c = 0;
    const s = stati(o).join(" ");
    if (/Stun (Large|Massive)/.test(s)) c += 5;
    else if (/Stun/.test(s)) c += 3.5;
    if (/Confusion/.test(s)) c += 3.5;
    if (/Blind/.test(s)) c += 3;
    if (/Slowed|Rooted/.test(s)) c += 1.5;
    if (/Electric/.test(s)) c += 1.5;
    if (/Fire_Panic/.test(s)) c += 1;
    const stordimento = maxCampo(o, "stordimento");
    c += stordimento >= 50 ? 2.5 : stordimento >= 30 ? 1.5 : stordimento >= 20 ? 0.5 : 0;
    if (raggioEsplosione(colpiPiatti(o.combattimento)) >= 6) c += 1;
    if (o.tipo === "torretta" || o.tipo === "postazione") c += 2;
    if (/smoke/i.test(o.nome) && !/Blind/.test(s)) c += 3;
    return limita(c, 0, 10) * disponibilita(o);
  }

  // --- Obiettivi: strutture della fazione che si possono distruggere ---

  function usiPerDieciMinuti(o) {
    if (o.slot === "granata") return o.combattimento?.iniziali || o.scheda?.quantita || 3;
    if (o.slot === "stratagemma" && !["arma", "zaino", "veicolo"].includes(o.tipo)) return usiAlMinuto(o) * 10;
    return 6;
  }

  // --- Demolizione: chi distrugge una struttura ---
  // Basta un attacco con forza di demolizione almeno pari a quella della struttura e, se la
  // struttura lo chiede (buchi dei nidi, prese d'aria delle fabbriche, navi atterrate), che
  // sia un'esplosione. Fonti: i dati del gioco e la tabella della wiki ("Demolition Force
  // Sources"). Gli attacchi che capitano solo in casi particolari (contraccolpo,
  // sovraccarico, l'oggetto che esplode o viene distrutto) sono segnati come tali.
  function fontiDemolizione(o, catalogo) {
    const out = [];
    const visita = (c, arma) =>
      (c?.colpi || []).forEach((x) => {
        if (x.tipo === "arma") visita(x, x.nome || arma);
        else if (x.tipo !== "stato" && (x.demolizione || 0) > 0) out.push({ forza: x.demolizione, esplosiva: x.tipo === "esplosione", tipo: x.tipo, arma: arma || null, situazionale: Boolean(x.retro) });
      });
    visita(o?.combattimento, null);
    for (const d of catalogo?.demolizioni || []) {
      if (d.id && d.id === o?.id) out.push({ forza: d.forza, esplosiva: Boolean(d.esplosiva), attacco: d.attacco || null, situazionale: Boolean(d.situazionale), wiki: true });
    }
    return out;
  }

  // L'attacco migliore che distrugge la struttura (null se nessuno): prima quelli normali,
  // poi i casi particolari; prima le esplosioni (basta prendere la struttura nel raggio),
  // poi i colpi diretti; a parità la forza più alta
  function demolizione(o, struttura, catalogo) {
    const buoni = fontiDemolizione(o, catalogo).filter((f) => f.forza >= struttura.forza && (!struttura.balistica || f.esplosiva));
    buoni.sort((a, b) => Number(a.situazionale) - Number(b.situazionale) || Number(b.esplosiva) - Number(a.esplosiva) || b.forza - a.forza);
    return buoni[0] || null;
  }

  function demolisce(o, struttura, catalogo) {
    const d = demolizione(o, struttura, catalogo);
    return Boolean(d && !d.situazionale);
  }

  function obiettivi(oggetti, catalogo, fazione) {
    const strutture = (catalogo.strutture || []).filter((s) => s.fazione === fazione || s.fazione === "tutte");
    if (!strutture.length) return { valore: 0, elenco: [] };
    // Le varianti della stessa struttura ("Bug Hole (Inner)" e "(Outer)") sono modi diversi
    // di distruggerla: basta uno, conta il migliore
    const gruppi = new Map();
    for (const s of strutture) {
      const nome = s.nome.replace(/\s*\([^)]*\)\s*$/, "");
      const servono = s.balistica ? 4 : 1;
      const copertura = 1 - oggetti.reduce((p, o) => (demolisce(o, s, catalogo) ? p * (1 - Math.min(1, usiPerDieciMinuti(o) / servono)) : p), 1);
      const con = oggetti.filter((o) => demolisce(o, s, catalogo)).map((o) => o.nome);
      const prima = gruppi.get(nome);
      if (!prima || copertura > prima.copertura) gruppi.set(nome, { nome, forza: s.forza, copertura, con });
    }
    const elenco = [...gruppi.values()];
    return { valore: 10 * media(elenco.map((e) => e.copertura)), elenco };
  }

  // --- Gittata ---

  const PROFILI = {
    mischia: [[0, 1], [3, 1], [6, 0]],
    spruzzo: [[0, 1], [15, 1], [25, 0.2], [30, 0]],
    raggio: [[0, 1], [80, 1], [150, 0.75]],
    granata: [[0, 0.3], [8, 1], [30, 1], [45, 0.2], [60, 0]],
    pallettoni: [[0, 1], [15, 1], [30, 0.55], [50, 0.25], [80, 0.08], [150, 0]],
    smg: [[0, 1], [20, 1], [40, 0.65], [80, 0.3], [150, 0.1]],
    pistola: [[0, 1], [20, 1], [40, 0.6], [80, 0.25], [150, 0.1]],
    fucile: [[0, 0.85], [10, 1], [60, 1], [100, 0.7], [150, 0.45]],
    precisione: [[0, 0.6], [20, 1], [120, 1], [150, 0.85]],
    esplosivo: [[0, 0.15], [8, 0.6], [15, 1], [80, 1], [120, 0.7], [150, 0.5]],
    anticarro: [[0, 0.5], [15, 1], [150, 1]],
    attacco: [[0, 0.1], [15, 0.4], [25, 1], [70, 1], [110, 0.6], [150, 0.35]],
    torretta: [[0, 1], [60, 1], [100, 0.7], [150, 0.4]],
    mina: [[0, 1], [25, 0.8], [40, 0.3], [60, 0]],
    veicolo: [[0, 1], [80, 1], [150, 0.7]],
  };

  function tipoGittata(o) {
    const comp = colpiPiatti(o.combattimento);
    const tutti = [...comp, ...(o.combattimento?.colpi || []).filter((x) => x.tipo === "arma").flatMap((a) => colpiPiatti(a))];
    if (o.slot === "granata") return { tipo: "granata" };
    if (o.slot === "stratagemma") {
      if (o.tipo === "orbitale" || o.tipo === "aquila") return { tipo: "attacco" };
      if (o.tipo === "torretta") return { tipo: "torretta" };
      if (o.tipo === "postazione") return { tipo: tutti.some((x) => x.tipo === "proiettile") ? "torretta" : "mina" };
      if (o.tipo === "veicolo") return { tipo: "veicolo" };
    }
    if (tutti.some((x) => x.tipo === "mischia")) return { tipo: "mischia" };
    if (tutti.some((x) => x.tipo === "spruzzo")) return { tipo: "spruzzo" };
    const arco = tutti.find((x) => x.tipo === "arco");
    if (arco) {
      const g = arco.gittata || 40;
      return { tipo: "arco", punti: [[0, 1], [g * 0.6, 1], [g, 0.1], [Math.max(g + 10, 150), 0]] };
    }
    if (tutti.some((x) => x.tipo === "raggio")) return { tipo: "raggio" };
    if (tutti.some((x) => (x.proiettili || 1) >= 4)) return { tipo: "pallettoni" };
    if (raggioEsplosione(tutti) >= 2) return { tipo: "esplosivo" };
    const ap = Math.max(0, ...tutti.map((x) => x.ap || 0));
    if (o.slot === "stratagemma" && ap >= 5) return { tipo: "anticarro" };
    const t = String(o.tipo || "");
    if (/submachine/i.test(t)) return { tipo: "smg" };
    if (/pistol/i.test(t) || o.tratti?.includes("One Handed")) return { tipo: "pistola" };
    if (/marksman|sniper/i.test(t)) return { tipo: "precisione" };
    return { tipo: "fucile" };
  }

  function valoreProfilo(punti, d) {
    if (d <= punti[0][0]) return punti[0][1];
    for (let i = 1; i < punti.length; i++) {
      const [x1, y1] = punti[i];
      const [x0, y0] = punti[i - 1];
      if (d <= x1) return y0 + ((y1 - y0) * (d - x0)) / (x1 - x0 || 1);
    }
    return punti[punti.length - 1][1];
  }

  function gittata(contributi) {
    const passi = [];
    const totale = contributi.reduce((s, c) => s + c.peso, 0);
    for (let d = 0; d <= 150; d += 5) {
      const v = totale ? contributi.reduce((s, c) => s + c.peso * valoreProfilo(c.punti, d), 0) / totale : 0;
      passi.push({ distanza: d, efficacia: Math.round(v * 100) });
    }
    const fascia = (a, b) => Math.round(media(passi.filter((p) => p.distanza >= a && p.distanza <= b).map((p) => p.efficacia)));
    return { punti: passi, corta: fascia(0, 20), media: fascia(25, 60), lunga: fascia(65, 150) };
  }

  // --- Profilo: rumore, ritmo, impatto, pericolo ---

  const RUMORI = { none: 0, weapon_silenced: 0.5, weapon_small: 1, weapon_medium: 2, weapon_large: 3, weapon_huge: 4 };

  function rumore(o) {
    let r = RUMORI[o.combattimento?.rumore] ?? null;
    for (const x of colpiPiatti(o.combattimento)) {
      if (x.rumore) r = Math.max(r ?? 0, /large/.test(x.rumore) ? 5 : /medium/.test(x.rumore) ? 4 : /small/.test(x.rumore) ? 3 : 0);
    }
    if (r == null && o.slot === "granata") r = 3;
    return r;
  }

  function pericolo(o) {
    const comp = colpiPiatti(o.combattimento);
    const r3 = Math.max(0, ...comp.filter((x) => x.tipo === "esplosione" && x.danno > 0).map((x) => x.raggi?.[2] || 0));
    const s = stati(o).join(" ");
    let p = 0;
    if ((o.combattimento?.colpi || []).some((x) => x.retro)) p += 8;
    if (["primaria", "secondaria"].includes(o.slot) && r3 >= 6) p += 25;
    else if (o.slot === "stratagemma" && o.tipo === "arma" && r3 >= 6) p += 15;
    if (/Fire/.test(s) && o.slot !== "granata" && !["orbitale", "aquila"].includes(o.tipo)) p += 15;
    if (comp.some((x) => x.tipo === "arco")) p += 15;
    if (["orbitale", "aquila"].includes(o.tipo) && r3 >= 15) p += 8;
    if (o.tipo === "postazione" && !comp.some((x) => x.tipo === "proiettile")) p += 10;
    if (/hellbomb/i.test(o.nome)) p += 20;
    if (/Gas/.test(s)) p += 6;
    return p;
  }

  function impatto(o) {
    const comp = colpiPiatti(o.combattimento);
    const r = raggioEsplosione([...comp, ...(o.combattimento?.colpi || []).filter((x) => x.tipo === "arma").flatMap((a) => colpiPiatti(a))]);
    let a = r >= 15 ? 9 : r >= 10 ? 7 : r >= 6 ? 5 : r >= 3 ? 3 : r > 0 ? 1.5 : 0;
    if (comp.some((x) => x.durataArea > 0)) a += 2;
    if (comp.some((x) => x.tipo === "spruzzo" || x.tipo === "arco")) a += 2;
    if (o.slot === "stratagemma" && ["orbitale", "aquila"].includes(o.tipo)) a *= limita(impattiPerUso(o) / 5, 0.6, 1.5);
    return limita(a, 0, 10) * disponibilita(o);
  }

  // --- La build ---

  function oggettiDellaBuild(build, catalogo) {
    const indice = new Map((catalogo.oggetti || []).map((o) => [o.id, o]));
    const presi = [];
    const aggiungi = (id, posto) => {
      const o = id && indice.get(id);
      if (o) presi.push({ o, posto });
    };
    aggiungi(build.primaria, "primaria");
    aggiungi(build.secondaria, "secondaria");
    aggiungi(build.granata, "granata");
    (build.stratagemmi || []).forEach((id) => aggiungi(id, "stratagemma"));
    aggiungi(build.armatura?.passiva, "armatura");
    aggiungi(build.potenziamento, "potenziamento");
    return presi;
  }

  function haZaino(o) {
    return o.slot === "stratagemma" && (o.tipo === "zaino" || (o.tratti || []).includes("Backpack"));
  }

  const cacheNemici = new WeakMap();

  // Potenza dell'oggetto contro la fazione, con una cache per catalogo
  function potenza(o, catalogo, fazione) {
    let perCatalogo = cacheNemici.get(catalogo);
    if (!perCatalogo) cacheNemici.set(catalogo, (perCatalogo = new Map()));
    const chiave = `${fazione}|${o.id}`;
    if (!perCatalogo.has(chiave)) perCatalogo.set(chiave, analizzaOggetto(o, nemiciDi(catalogo, fazione)));
    return perCatalogo.get(chiave);
  }

  function analizza(build, catalogo) {
    const fazione = build.fazione || "terminidi";
    const presi = oggettiDellaBuild(build, catalogo);
    const peso = PESI_ARMATURA[build.armatura?.peso] || PESI_ARMATURA.media;

    // Potenza di fuoco: le armi in mano (primaria, secondaria, armi di supporto) si usano
    // una alla volta: per ogni classe di nemico conta la migliore più un quarto della
    // seconda. Granate e stratagemmi si aggiungono (lavorano insieme alle armi).
    const kpm = { leggero: 0, medio: 0, pesante: 0 };
    const contributi = [];
    const supporto = presi.filter(({ o }) => o.slot === "stratagemma" && o.tipo === "arma");
    const inMano = ({ o, posto }) => posto === "primaria" || posto === "secondaria" || (posto === "stratagemma" && o.tipo === "arma");
    const pesiInMano = new Map();
    for (const c of CLASSI) {
      const valori = presi
        .filter(inMano)
        .map((x) => ({ x, v: potenza(x.o, catalogo, fazione).kpm[c] * (PESO[x.posto] || 1) }))
        .sort((a, b) => b.v - a.v);
      valori.forEach((e, i) => {
        const fattore = i === 0 ? 1 : i === 1 ? SECONDA_ARMA : 0;
        kpm[c] += e.v * fattore;
        pesiInMano.set(e.x, Math.max(pesiInMano.get(e.x) || 0, fattore * (PESO[e.x.posto] || 1)));
      });
    }
    for (const x of presi) {
      const { o, posto } = x;
      if (posto === "armatura" || posto === "potenziamento") continue;
      const p = potenza(o, catalogo, fazione);
      let fattore = PESO[posto] || 1;
      if (inMano(x)) fattore = pesiInMano.get(x) || 0;
      else for (const c of CLASSI) kpm[c] += p.kpm[c] * fattore;
      contributi.push({ id: o.id, nome: o.nome, posto, leggero: p.leggero, medio: p.medio, pesante: p.pesante, kpm: p.kpm, fattore });
    }
    const fuoco = Object.fromEntries(CLASSI.map((c) => [c, satura(kpm[c], RIFERIMENTO[c])]));

    const tutti = presi.map((x) => x.o);
    const valoriSopr = [peso.sopravvivenza, ...tutti.map(sopravvivenza)];
    const valoriUtil = [peso.utilita, ...tutti.map(utilita)];
    const valoriCtrl = tutti.map(controllo);
    const obi = obiettivi(tutti.filter((o) => o.combattimento), catalogo, fazione);

    const voci = {
      leggeri: fuoco.leggero,
      medi: fuoco.medio,
      pesanti: fuoco.pesante,
      sopravvivenza: combina(valoriSopr),
      utilita: combina(valoriUtil),
      controllo: combina(valoriCtrl),
      obiettivi: obi.valore,
    };
    const tondo = (x) => Math.round(x * 10) / 10;
    const potenzaFuoco = voci.leggeri + voci.medi + voci.pesanti;
    const potenzaSupporto = voci.sopravvivenza + voci.utilita + voci.controllo + voci.obiettivi;

    // Gittata: ogni arma pesa per quanto contribuisce al fuoco
    const perGittata = contributi
      .map((c) => {
        const o = tutti.find((x) => x.id === c.id);
        const t = tipoGittata(o);
        return { peso: (c.leggero + c.medio + c.pesante) * c.fattore, punti: t.punti || PROFILI[t.tipo], tipo: t.tipo };
      })
      .filter((c) => c.peso > 0);

    // Profilo
    const pesiRumore = { primaria: 0.5, secondaria: 0.15, granata: 0.1, stratagemma: 0.25 };
    let somR = 0;
    let pesR = 0;
    for (const { o, posto } of presi) {
      const r = rumore(o);
      if (r == null || !(posto in pesiRumore)) continue;
      const w = posto === "stratagemma" ? (o.tipo === "arma" ? 0.25 : 0.06) : pesiRumore[posto];
      somR += r * w;
      pesR += w;
    }
    let valoreRumore = pesR ? (somR / pesR) * 20 : 0;
    if (tutti.some((o) => o.slot === "armatura" && o.emblema === "occhio")) valoreRumore *= 0.8;

    let ritmo = peso.ritmo;
    for (const o of tutti) {
      if (/jump pack|hover pack|warp pack/i.test(o.nome)) ritmo += 12;
      else if (o.tipo === "veicolo" && /frv/i.test(o.nome)) ritmo += 10;
      if (o.tipo === "torretta" || (o.tipo === "postazione" && /emplacement|relay|tower/i.test(o.nome))) ritmo -= 7;
      if (o.tipo === "arma" && (o.combattimento?.ergonomia ?? 50) < 30) ritmo -= 6;
      if (o.slot === "potenziamento" && o.emblema === "corsa") ritmo += 6;
    }
    const attese = tutti.filter((o) => o.slot === "stratagemma" && o.scheda?.attesa).map((o) => o.scheda.attesa);
    if (media(attese) > 300) ritmo -= 5;

    const valoreImpatto = combina(tutti.map(impatto)) * 10;
    let valorePericolo = tutti.reduce((s, o) => s + pericolo(o), 0);
    if (tutti.some((o) => o.slot === "armatura" && /inflammable|fortified|acclimated|concussive/i.test(o.nome))) valorePericolo *= 0.75;

    // Avvisi
    const avvisi = [];
    const mancano = [];
    if (!build.primaria) mancano.push("primaria");
    if (!build.secondaria) mancano.push("secondaria");
    if (!build.granata) mancano.push("granata");
    const strat = (build.stratagemmi || []).filter(Boolean).length;
    if (strat < 4) mancano.push(`${4 - strat} stratagemm${4 - strat === 1 ? "a" : "i"}`);
    if (!build.armatura?.passiva) mancano.push("armatura");
    if (!build.potenziamento) mancano.push("potenziamento");
    if (mancano.length) avvisi.push({ livello: "info", testo: `Da scegliere: ${mancano.join(", ")}.` });
    const zaini = tutti.filter(haZaino);
    if (zaini.length > 1) avvisi.push({ livello: "attenzione", testo: `${zaini.length} oggetti con lo zaino (${zaini.map((o) => o.nome).join(", ")}): se ne porta uno alla volta.` });
    if (supporto.length > 1) avvisi.push({ livello: "attenzione", testo: `${supporto.length} armi di supporto: se ne porta una alla volta (nei punteggi conta la migliore).` });
    const veicoli = tutti.filter((o) => o.slot === "stratagemma" && o.tipo === "veicolo");
    if (veicoli.length > 1) avvisi.push({ livello: "attenzione", testo: `${veicoli.length} veicoli (${veicoli.map((o) => o.nome).join(", ")}): se ne guida uno alla volta, ma nei punteggi contano tutti come se lavorassero insieme.` });
    if (voci.pesanti < SOGLIE.pesante[0]) avvisi.push({ livello: "attenzione", testo: "Poco contro i nemici pesanti: serve un'arma anticarro o uno stratagemma che li abbatta." });
    if (voci.leggeri < SOGLIE.leggero[0]) avvisi.push({ livello: "attenzione", testo: "Poco contro le orde di nemici leggeri." });
    if (voci.medi < SOGLIE.medio[0]) avvisi.push({ livello: "attenzione", testo: "Poco contro i nemici medi (corazza media)." });
    if (voci.obiettivi < 3 && tutti.length >= 5) avvisi.push({ livello: "info", testo: "Pochi strumenti per chiudere nidi e fabbriche e per le strutture degli obiettivi." });
    if (valorePericolo >= 60) avvisi.push({ livello: "info", testo: "Build pericolosa anche per la squadra: occhio al fuoco amico." });

    return {
      fazione,
      voci: Object.fromEntries(Object.entries(voci).map(([k, v]) => [k, tondo(v)])),
      potenza: { fuoco: tondo(potenzaFuoco), supporto: tondo(potenzaSupporto), totale: tondo(potenzaFuoco + potenzaSupporto) },
      soglie: Object.fromEntries(CLASSI.map((c) => [c, { valore: tondo(fuoco[c]), minimo: SOGLIE[c][0], sicuro: SOGLIE[c][1] }])),
      uccisioni: Object.fromEntries(CLASSI.map((c) => [c, tondo(kpm[c])])),
      contributi: contributi.map((c) => ({ ...c, leggero: tondo(c.leggero), medio: tondo(c.medio), pesante: tondo(c.pesante) })),
      gittata: gittata(perGittata),
      profilo: {
        rumore: Math.round(limita(valoreRumore, 0, 100)),
        ritmo: Math.round(limita(ritmo, 0, 100)),
        impatto: Math.round(limita(valoreImpatto, 0, 100)),
        pericolo: Math.round(limita(valorePericolo, 0, 100)),
      },
      obiettivi: obi.elenco,
      armatura: peso,
      avvisi,
    };
  }

  // --- Punteggio veloce, per l'ottimizzatore ---
  // Lo stesso totale di analizza (potenza.totale, senza arrotondare: lo controlla un test),
  // con i valori di ogni oggetto calcolati una volta per fazione, perché l'ottimizzatore
  // prova centinaia di migliaia di build. Per ogni oggetto una "voce" con:
  // - le uccisioni al minuto già pesate per il suo posto;
  // - i fattori (1 − valore/10) di sopravvivenza, utilità e controllo;
  // - per ogni struttura della fazione quanto resta scoperto (1 se non la distrugge).
  // Se cambia il calcolo di analizza, va cambiato anche qui.

  const cacheTavole = new WeakMap();

  function voceDi(o, catalogo, fazione, strutture) {
    const posto = o.slot;
    const conta = posto !== "armatura" && posto !== "potenziamento";
    const p = conta ? potenza(o, catalogo, fazione) : null;
    let d = null;
    if (o.combattimento) {
      const resta = strutture.map((s) => (demolisce(o, s, catalogo) ? 1 - Math.min(1, usiPerDieciMinuti(o) / (s.balistica ? 4 : 1)) : 1));
      if (resta.some((x) => x < 1)) d = resta;
    }
    return {
      o,
      posto,
      kpm: CLASSI.map((c) => (p ? p.kpm[c] * (PESO[posto] || 1) : 0)),
      mano: posto === "primaria" || posto === "secondaria" || (posto === "stratagemma" && o.tipo === "arma"),
      s: 1 - limita(sopravvivenza(o), 0, 10) / 10,
      u: 1 - limita(utilita(o), 0, 10) / 10,
      c: 1 - limita(controllo(o), 0, 10) / 10,
      d,
      zaino: haZaino(o),
      arma: posto === "stratagemma" && o.tipo === "arma",
      veicolo: posto === "stratagemma" && o.tipo === "veicolo",
    };
  }

  // Le voci di tutti gli oggetti contro una fazione, con le strutture divise in gruppi
  // (le varianti di una struttura contano come una, la migliore) e il peso dell'armatura
  // come una voce a parte
  function tavola(catalogo, fazione) {
    let perCatalogo = cacheTavole.get(catalogo);
    if (!perCatalogo) cacheTavole.set(catalogo, (perCatalogo = new Map()));
    if (perCatalogo.has(fazione)) return perCatalogo.get(fazione);
    const strutture = (catalogo.strutture || []).filter((s) => s.fazione === fazione || s.fazione === "tutte");
    const gruppi = new Map();
    strutture.forEach((s, j) => {
      const nome = s.nome.replace(/\s*\([^)]*\)\s*$/, "");
      if (!gruppi.has(nome)) gruppi.set(nome, []);
      gruppi.get(nome).push(j);
    });
    const voci = new Map((catalogo.oggetti || []).map((o) => [o.id, voceDi(o, catalogo, fazione, strutture)]));
    const pesi = Object.fromEntries(
      Object.entries(PESI_ARMATURA).map(([k, p]) => [k, { posto: "peso", kpm: [0, 0, 0], mano: false, s: 1 - p.sopravvivenza / 10, u: 1 - p.utilita / 10, c: 1, d: null }]),
    );
    const t = { fazione, voci, pesi, gruppi: [...gruppi.values()], strutture: strutture.length };
    perCatalogo.set(fazione, t);
    return t;
  }

  // Somma di più voci: le armi in mano tengono le due migliori per classe di nemico, il resto
  // si somma; i fattori si moltiplicano
  function sommaVoci(t, voci) {
    const r = { k: [0, 0, 0], a1: [0, 0, 0], a2: [0, 0, 0], s: 1, u: 1, c: 1, d: new Array(t.strutture).fill(1) };
    for (const v of voci) if (v) aggiungiVoce(r, v);
    return r;
  }

  function aggiungiVoce(r, v) {
    for (let i = 0; i < 3; i++) {
      const x = v.kpm[i];
      if (!v.mano) r.k[i] += x;
      else if (x > r.a1[i]) {
        r.a2[i] = r.a1[i];
        r.a1[i] = x;
      } else if (x > r.a2[i]) r.a2[i] = x;
    }
    r.s *= v.s;
    r.u *= v.u;
    r.c *= v.c;
    if (v.d) for (let j = 0; j < v.d.length; j++) r.d[j] *= v.d[j];
  }

  const RIF = CLASSI.map((c) => RIFERIMENTO[c]);

  // Totale di una somma più una o due voci (senza toccare la somma)
  function totaleVoci(t, r, v1 = null, v2 = null) {
    let tot = 0;
    for (let i = 0; i < 3; i++) {
      let k = r.k[i];
      let a1 = r.a1[i];
      let a2 = r.a2[i];
      for (const v of [v1, v2]) {
        if (!v) continue;
        const x = v.kpm[i];
        if (!v.mano) k += x;
        else if (x > a1) {
          a2 = a1;
          a1 = x;
        } else if (x > a2) a2 = x;
      }
      k += a1 + SECONDA_ARMA * a2;
      if (k > 0) tot += (10 * k) / (k + RIF[i]);
    }
    tot += 10 * (1 - r.s * (v1 ? v1.s : 1) * (v2 ? v2.s : 1));
    tot += 10 * (1 - r.u * (v1 ? v1.u : 1) * (v2 ? v2.u : 1));
    tot += 10 * (1 - r.c * (v1 ? v1.c : 1) * (v2 ? v2.c : 1));
    if (t.gruppi.length) {
      const d1 = v1 && v1.d;
      const d2 = v2 && v2.d;
      let obi = 0;
      for (const g of t.gruppi) {
        let meglio = 0;
        for (const j of g) {
          const coperta = 1 - r.d[j] * (d1 ? d1[j] : 1) * (d2 ? d2[j] : 1);
          if (coperta > meglio) meglio = coperta;
        }
        obi += meglio;
      }
      tot += (10 * obi) / t.gruppi.length;
    }
    return tot;
  }

  // Le voci di una build (oggetti che non sono nel catalogo: niente) e il suo totale
  function vociDellaBuild(build, t) {
    const prendi = (id) => (id && t.voci.get(id)) || null;
    return [
      prendi(build.primaria),
      prendi(build.secondaria),
      prendi(build.granata),
      ...[0, 1, 2, 3].map((i) => prendi(build.stratagemmi?.[i])),
      prendi(build.armatura?.passiva),
      prendi(build.potenziamento),
      t.pesi[build.armatura?.peso] || t.pesi.media,
    ];
  }

  function punteggio(build, catalogo) {
    const t = tavola(catalogo, build.fazione || "terminidi");
    return totaleVoci(t, sommaVoci(t, vociDellaBuild(build, t)));
  }

  function somma(p) {
    return p.leggero + p.medio + p.pesante;
  }

  return {
    analizza,
    punteggio,
    tavola,
    sommaVoci,
    aggiungiVoce,
    totaleVoci,
    potenza,
    analizzaOggetto,
    nemiciDi,
    demolizione,
    fontiDemolizione,
    colpiPerUccidere,
    moltiplicatore,
    tipoGittata,
    PESI_ARMATURA,
    SOGLIE,
    RIFERIMENTO,
    COSTANTI: { TEMPO_BERSAGLIO, DENSITA, MAX_BERSAGLI, FINESTRA, MISSIONE, PESO, PALLETTONI_A_SEGNO },
  };
});
