// Meccaniche del gioco spiegate in italiano: perforazione e corazza, danno durevole,
// esplosioni, parti dei nemici, effetti, stordimento, tipi di danno, distanza, demolizione,
// armatura degli Helldiver e difficoltà. Le regole vengono dalle pagine della wiki (Damage,
// Status Effects, Armor, Demolition, Difficulty); le tabelle si fanno con i dati del catalogo.
(function () {
  "use strict";
  const { h, monta, stato, numero } = window.IT;
  const W = window.Wiki;

  const p = (...x) => h("p", null, ...x);
  const li = (...x) => h("li", null, ...x);
  const ul = (...x) => h("ul", null, ...x);
  const b = (x) => h("b", null, x);
  const link = (href, testo) => h("a", { href }, testo);

  function esempi(voci, quante = 6) {
    if (!voci.length) return h("span", { class: "tenue" }, "–");
    return [voci.slice(0, quante).map((v, i) => [i ? ", " : "", v]), voci.length > quante ? h("span", { class: "tenue" }, ` e altri ${voci.length - quante}`) : null];
  }

  // --- Gradi di perforazione: armi del catalogo e parti dei nemici per ogni grado ---

  function tabellaGradi() {
    const c = stato.catalogo;
    const armi = new Map();
    for (const o of c.oggetti) {
      if (!o.combattimento?.colpi?.length) continue;
      const ap = W.perforazioneDi(o);
      if (ap == null) continue;
      if (!armi.has(ap)) armi.set(ap, []);
      armi.get(ap).push(link(`#/wiki/oggetto/${o.id}`, o.nome));
    }
    const parti = new Map();
    for (const n of c.nemici || []) {
      for (const pt of n.parti || []) {
        if (!parti.has(pt.av)) parti.set(pt.av, []);
        parti.get(pt.av).push(link(`#/wiki/nemico/${n.id}`, pt.main ? n.nome : `${n.nome} (${pt.nome})`));
      }
    }
    const righe = [];
    for (let g = -1; g <= 11; g++) {
      const a = armi.get(g) || [];
      const pt = parti.get(g) || [];
      if (g > 0 && g < 11 && !a.length && !pt.length && g !== 1) continue;
      righe.push(
        h(
          "tr",
          null,
          h("td", null, W.grado(g)),
          h("td", null, W.nomeGrado(g), g >= 5 && g <= 10 ? h("div", { class: "tenue piccolo" }, `corazza: ${W.nomeGrado(g, "AV")}`) : null),
          h("td", { class: "piccolo" }, esempi(a)),
          h("td", { class: "piccolo" }, esempi(pt)),
        ),
      );
    }
    return h(
      "div",
      { class: "scorre" },
      h(
        "table",
        { class: "tabella" },
        h("thead", null, h("tr", null, h("th", null, "Grado"), h("th", null, "Nome"), h("th", null, "Armi e stratagemmi con questa perforazione"), h("th", null, "Corpi e parti fatali con questa corazza"))),
        h("tbody", null, righe),
      ),
    );
  }

  // Armi la cui etichetta in gioco non dice il grado vero
  function etichetteDiverse() {
    const attesi = [
      [/light armou?r/i, 2, "Light"],
      [/medium armou?r/i, 3, "Medium"],
      [/heavy armou?r/i, 4, "Heavy"],
    ];
    const out = [];
    for (const o of stato.catalogo.oggetti) {
      const et = W.etichettaGioco(o);
      const ap = W.perforazioneDi(o);
      if (!et || ap == null || !o.combattimento?.colpi?.length) continue;
      const a = attesi.find(([re]) => re.test(et));
      const diverso = a ? ap !== a[1] : /anti-tank/i.test(et) && ap < 5;
      if (diverso) out.push({ o, et, ap });
    }
    if (!out.length) return null;
    return h(
      "div",
      null,
      p("Armi e stratagemmi dove l'etichetta del gioco non dice il grado vero (la tabella sopra usa quello vero):"),
      h(
        "div",
        { class: "scorre" },
        h(
          "table",
          { class: "tabella" },
          h("thead", null, h("tr", null, h("th", null, "Oggetto"), h("th", null, "In gioco"), h("th", null, "Grado vero"))),
          h(
            "tbody",
            null,
            out.slice(0, 20).map((x) => h("tr", null, h("td", null, link(`#/wiki/oggetto/${x.o.id}`, x.o.nome)), h("td", { class: "piccolo" }, x.et), h("td", null, W.grado(x.ap), ` ${W.nomeGrado(x.ap)}`))),
          ),
        ),
      ),
    );
  }

  // --- Esempio di danno durevole con i dati veri ---

  // Il Liberator contro una parte durevole che riesce a bucare (prima quelle del Charger)
  function esempioDurevole() {
    const arma = stato.catalogo.oggetti.find((o) => o.id === "ar-23-liberator");
    const colpo = arma && W.colpiPiatti(arma.combattimento).find((x) => x.tipo === "proiettile");
    if (!colpo) return null;
    const lista = [...(stato.catalogo.nemici || [])].sort((a, c) => Number(c.id === "charger") - Number(a.id === "charger"));
    for (const n of lista) {
      const parte = (n.parti || []).find((x) => x.av < colpo.ap && x.durevole > 0 && x.durevole < 1 && typeof x.salute === "number");
      if (!parte) continue;
      const d = Math.floor(colpo.danno * (1 - parte.durevole) + colpo.durevole * parte.durevole);
      return p(
        "Esempio con i dati del gioco: il ",
        link(`#/wiki/oggetto/${arma.id}`, arma.nome),
        ` fa ${colpo.danno} di danno normale e ${colpo.durevole} di durevole. Su ${parte.main ? "il corpo" : `la parte «${parte.nome}»`} di `,
        link(`#/wiki/nemico/${n.id}`, n.nome),
        `, durevole al ${W.percento(parte.durevole)}: ${colpo.danno} × ${numero(1 - parte.durevole, 2)} + ${colpo.durevole} × ${numero(parte.durevole, 2)} = ${d} per colpo.`,
      );
    }
    return null;
  }

  // --- Stordimento: soglie dei nemici dai dati ---

  function tabellaStordimento() {
    const lista = (stato.catalogo.nemici || []).filter((n) => n.stordimento != null).sort((a, b) => a.stordimento - b.stordimento);
    if (!lista.length) return null;
    const gruppi = new Map();
    for (const n of lista) {
      if (!gruppi.has(n.stordimento)) gruppi.set(n.stordimento, []);
      gruppi.get(n.stordimento).push(link(`#/wiki/nemico/${n.id}`, n.nome));
    }
    return h(
      "div",
      { class: "scorre" },
      h(
        "table",
        { class: "tabella" },
        h("thead", null, h("tr", null, h("th", { class: "num" }, "Forza che serve"), h("th", null, "Nemici"))),
        h("tbody", null, [...gruppi.entries()].map(([f, nomi]) => h("tr", null, h("td", { class: "num" }, String(f)), h("td", { class: "piccolo" }, esempi(nomi, 12))))),
      ),
    );
  }

  function tabellaFuoco() {
    const lista = (stato.catalogo.nemici || []).filter((n) => n.fuoco != null && n.fuoco !== 1).sort((a, b) => b.fuoco - a.fuoco);
    if (!lista.length) return null;
    const gruppi = new Map();
    for (const n of lista) {
      const k = numero(n.fuoco, 2);
      if (!gruppi.has(k)) gruppi.set(k, []);
      gruppi.get(k).push(link(`#/wiki/nemico/${n.id}`, n.nome));
    }
    return h(
      "div",
      { class: "scorre" },
      h(
        "table",
        { class: "tabella" },
        h("thead", null, h("tr", null, h("th", { class: "num" }, "Danno da fuoco"), h("th", null, "Nemici"))),
        h("tbody", null, [...gruppi.entries()].map(([k, nomi]) => h("tr", null, h("td", { class: "num" }, `×${k}`), h("td", { class: "piccolo" }, esempi(nomi, 12))))),
      ),
    );
  }

  // --- Armatura degli Helldiver: tabelle dai numeri della wiki ---

  function tabellaArmatura() {
    const a = stato.catalogo.meccaniche?.armatura || {};
    const valori = [...new Set([...Object.keys(a.fattori || {}).map(Number), ...(stato.catalogo.armature || []).map((x) => x.protezione).filter((x) => x != null)])].sort((x, y) => x - y);
    const salute = a.salute || 125;
    return h(
      "div",
      { class: "scorre" },
      h(
        "table",
        { class: "tabella" },
        h(
          "thead",
          null,
          h("tr", null, h("th", { class: "num" }, "Protezione"), h("th", { class: "num" }, "Fattore"), h("th", { class: "num" }, "Testa"), h("th", { class: "num" }, "Petto"), h("th", { class: "num" }, "Braccia e gambe"), h("th", { class: "num", title: `Danno da prendere sul petto per finire a terra, con ${salute} di salute` }, "Salute effettiva (petto)")),
        ),
        h(
          "tbody",
          null,
          valori.map((v) => {
            const petto = W.dannoSubito(v, "petto");
            return h(
              "tr",
              { class: v === 100 ? "principale" : "" },
              h("td", { class: "num" }, String(v)),
              h("td", { class: "num" }, numero(W.fattore(v), 3)),
              h("td", { class: "num" }, W.percento(W.dannoSubito(v, "testa"), 1)),
              h("td", { class: "num" }, W.percento(petto, 1)),
              h("td", { class: "num" }, W.percento(W.dannoSubito(v, "braccia"), 1)),
              h("td", { class: "num" }, numero(salute / petto, 0)),
            );
          }),
        ),
      ),
    );
  }

  function protezioniPerPeso() {
    const per = { leggera: new Set(), media: new Set(), pesante: new Set() };
    for (const x of stato.catalogo.armature || []) if (x.protezione != null) per[x.peso]?.add(x.protezione);
    return ul(
      ...Object.entries(per)
        .filter(([, s]) => s.size)
        .map(([peso, s]) => li(b(`${W.PESI[peso]}: `), [...s].sort((a, c) => a - c).join(", "))),
    );
  }

  function passiveConProtezione() {
    const per = new Map();
    for (const x of stato.catalogo.armature || []) {
      if (x.base == null || x.protezione == null || x.protezione <= x.base) continue;
      const k = `${x.passiva}|${x.protezione - x.base}`;
      per.set(k, (per.get(k) || 0) + 1);
    }
    if (!per.size) return null;
    return ul(
      ...[...per.entries()]
        .map(([k, n]) => ({ passiva: k.split("|")[0], bonus: Number(k.split("|")[1]), n }))
        .sort((a, c) => c.bonus - a.bonus || a.passiva.localeCompare(c.passiva))
        .map((x) => li(b(x.passiva), `: +${x.bonus} di protezione (${x.n} armatur${x.n === 1 ? "a" : "e"})`)),
    );
  }

  // --- Difficoltà: da quando compaiono i nemici ---

  function nemiciPerDifficolta() {
    const per = new Map();
    for (const n of stato.catalogo.nemici || []) {
      if (!n.difficolta) continue;
      if (!per.has(n.difficolta)) per.set(n.difficolta, []);
      per.get(n.difficolta).push(link(`#/wiki/nemico/${n.id}`, n.nome));
    }
    return h(
      "div",
      { class: "scorre" },
      h(
        "table",
        { class: "tabella" },
        h("thead", null, h("tr", null, h("th", { class: "num" }, "Livello"), h("th", null, "Nome"), h("th", null, "Nemici che compaiono da qui"))),
        h(
          "tbody",
          null,
          W.DIFFICOLTA.slice(1).map((nome, i) => h("tr", null, h("td", { class: "num" }, String(i + 1)), h("td", null, nome), h("td", { class: "piccolo" }, esempi(per.get(i + 1) || [], 14)))),
        ),
      ),
    );
  }

  // --- Le sezioni della guida ---

  function sezioni() {
    const a = stato.catalogo.meccaniche?.armatura || {};
    const parti = a.parti || { testa: 1.5, petto: 1, braccia: 0.85, gambe: 0.85 };
    return [
      {
        id: "perforazione",
        titolo: "Perforazione e corazza",
        corpo: [
          p("Ogni parte di ogni nemico ha una ", b("corazza"), " (AV, da 0 a 10; 11 vuol dire indistruttibile) e ogni attacco ha una ", b("perforazione"), " (AP, da −1 a 10). Il confronto decide il danno:"),
          ul(
            li(b("perforazione più alta della corazza"), ": danno pieno (segnale rosso sul mirino);"),
            li(b("uguale"), ": 65% del danno (segnale bianco);"),
            li(b("più bassa"), ": nessun danno, il colpo rimbalza."),
          ),
          p("Ogni arma ha in realtà ", b("quattro perforazioni"), ", secondo l'angolo con cui colpisce: dritto (sotto 25°), poco inclinato (26–60°), molto inclinato (61–80°) e di striscio (81–90°). Di solito le prime tre sono uguali e l'ultima più bassa: per questo i colpi di striscio rimbalzano. Le esplosioni hanno una sola perforazione, che nel raggio esterno scende di 1 (minimo 2)."),
          p(b("I gradi nascosti. "), "In gioco l'arma mostra solo un'etichetta: Light, Medium o Heavy Armor Penetrating, oppure Anti-Tank. Sotto ci sono i numeri della tabella: il grado 1 (Very Light) non ha etichetta, e Anti-Tank comprende sei gradi diversi, da Anti-Tank I (5) ad Anti-Tank VI (10). Un'arma Anti-Tank I non buca quello che buca un'Anti-Tank III. Nell'app ogni oggetto mostra il grado vero."),
          tabellaGradi(),
          etichetteDiverse(),
        ],
      },
      {
        id: "durevole",
        titolo: "Danno durevole",
        corpo: [
          p("Ogni attacco ha due danni: quello ", b("normale"), " e quello ", b("durevole"), ". Ogni parte dei nemici ha una ", b("durevolezza"), " da 0% a 100%, che dice quanto conta il danno durevole su quella parte:"),
          h("p", { class: "formula" }, "danno = normale × (1 − durevolezza) + durevole × durevolezza  (arrotondato per difetto)"),
          ul(li("durevolezza 0%: conta solo il danno normale;"), li("100%: conta solo il durevole;"), li("in mezzo: un po' e un po'. Le armi leggere hanno di solito poco danno durevole, quelle pesanti molto.")),
          esempioDurevole(),
          p(b("Parti molli. "), "Alcune parti hanno corazza 0 ma durevolezza altissima e tanta salute, come il sedere di Charger e Bile Spewer: tutte le armi le colpiscono, ma conta quasi solo il danno durevole. Lì le esplosioni sono le migliori."),
        ],
      },
      {
        id: "esplosioni",
        titolo: "Esplosioni",
        corpo: [
          ul(
            li("Le esplosioni ", b("ignorano la durevolezza"), ": fanno sempre tutto il loro danno."),
            li("Possono colpire più parti insieme: ogni parte prende il suo danno e ne passa una quota al corpo, e questo passaggio ignora la corazza del corpo. Per questo un'esplosione può fare al corpo più danno di un colpo singolo."),
            li("Le parti immuni alle esplosioni girano il danno al corpo: succede una volta sola per esplosione, anche se ne colpisce tante, e solo se la perforazione dell'esplosione è almeno pari alla corazza del corpo."),
            li(b("Resistenza alle esplosioni"), " (ExDR): ogni parte ne ha una. Al 100% la parte è immune e il danno va al corpo; sotto, una quota del danno si perde (gli scafi dei carri, per esempio, ne hanno il 35%)."),
          ),
          p("Ogni esplosione ha tre raggi:"),
          ul(
            li(b("interno"), ": danno, stordimento, perforazione e demolizione pieni; passa anche dietro gli ostacoli;"),
            li(b("esterno"), ": danno e demolizione calano fino a zero verso il bordo, la perforazione scende di 1 (minimo 2); gli ostacoli lo fermano;"),
            li(b("onda d'urto"), ": nessun danno, solo stordimento."),
          ),
          p("Per i Helldiver: le esplosioni fanno ", b(`×${numero(a.esplosioni ?? 0.5, 2)}`), " del danno (la passiva Fortified dimezza ancora), e stando sdraiati o in ragdoll il danno del raggio esterno cala del 90%."),
        ],
      },
      {
        id: "parti",
        titolo: "Parti dei nemici",
        corpo: [
          p("Un nemico muore quando ", b("la salute del corpo arriva a zero"), " oppure quando distruggi una sua ", b("parte fatale"), " (di solito testa e punti deboli). Nella Wiki ogni nemico ha la tabella completa delle parti."),
          ul(
            li(b("Danno al corpo"), ": una quota del danno fatto a una parte arriva anche al corpo. Di solito si ferma alla salute che la parte aveva; alcune parti passano anche il danno in eccesso. Esempio della wiki: il braccio di un Trooper ha 65 di salute e passa il 50% al corpo; un colpo da 300 del Deadeye fa 150 al corpo, che ne ha 125, e lo uccide."),
            li(b("Sanguinamento"), ": quando il corpo arriva a zero (o si distrugge una parte che fa sanguinare) il nemico resta a terra e perde salute nel tempo fino a morire. Il Charger, per esempio, ha 750 punti che calano di 100 al secondo."),
            li(b("Corazze rompibili"), ": Charger, Bile Titan, Impaler, Factory Strider, Harvester, Overseer e altri hanno piastre con una salute loro. Prima vanno rotte, e il danno in eccesso non passa sotto."),
            li(b("Sovrappenetrazione"), ": un proiettile attraversa più parti o più nemici se la sua perforazione supera la corazza di almeno 2. Per ogni parte attraversata perde 1 di perforazione e rallenta. Per attraversare una corazza rompibile serve almeno il triplo della sua corazza."),
          ),
        ],
      },
      {
        id: "effetti",
        titolo: "Danno nel tempo ed effetti",
        corpo: [
          p("Fuoco, gas, acido, termite, spine e sanguinamento fanno ", b("danno nel tempo"), ". Questo danno colpisce ", b("solo la salute del corpo"), " e deve bucarne la corazza, con la stessa regola del 65%: il fuoco ha perforazione 4, quindi sul corpo di un Charger (corazza 4) fa il 65%."),
          p("Gli effetti non partono per forza al primo colpo. Ogni colpo aggiunge un po' di ", b("intensità"), ": sopra una soglia minima l'effetto può partire, alla soglia massima parte di sicuro, e se smetti l'intensità cala. I nemici grandi e i robot hanno soglie più alte."),
          p("Il danno da fuoco cambia con la taglia: per esempio ×0,8 sui Warrior, ×1,5 sui Charger, ×1,7 sui Bile Titan. Dai dati:"),
          tabellaFuoco(),
          p("Gli effetti principali:"),
          ul(
            li(b("Fuoco"), ": 3 secondi, perforazione 4. Sui Helldiver si spegne tuffandosi o sdraiandosi."),
            li(b("Panico da fuoco e rallentamento"), ": solo dai getti diretti (lanciafiamme, Torcher, torretta a fiamme, Meltagun). I nemici grandi che non sono Terminidi ne sono immuni."),
            li(b("Fuoco pesante"), ": dal napalm (aquila, orbitale, Expendable Napalm). Fa molto più danno ma dura solo 1 secondo."),
            li(b("Gas"), ": danno al corpo per 6 secondi (Mk1) o 10 (Mk2, Sterilizer e Dog Breath). Poi c'è la ", b("confusione"), " per 5 o 9 secondi: i nemici attaccano a caso e sono rallentati del 25%."),
            li(b("Stordimento (stun)"), ": i nemici non si muovono e non attaccano per 1,5 s (Blitzer, Arc Thrower, torre Tesla…), 3 s (mortaio EMS, Pummeler, Pacifier), 5 s (granata Stun, Urchin, Halt, Stun Lance) o 10 s (booster Stun Pods). I Helldiver storditi rallentano molto."),
            li(b("Acido"), ": rallenta e può fare danno nel tempo, per 4 secondi."),
          ),
        ],
      },
      {
        id: "stordimento",
        titolo: "Stordimento e ragdoll",
        corpo: [
          p("Ogni attacco ha una ", b("forza di stordimento"), ". Se arriva alla soglia del nemico lo spinge indietro, di solito lo ferma, e può interrompere alcuni suoi attacchi e la chiamata dei rinforzi. A differenza degli effetti, la forza ", b("non si accumula"), ": conta il singolo colpo. Ogni pallettone di un fucile a pompa ha la forza piena, quindi ne basta uno."),
          p("Soglie dei nemici, dai dati:"),
          tabellaStordimento(),
          p(b("Helldiver"), ": ogni colpo fa sobbalzare la mira. Da forza ", b("10"), " sei stordito (si interrompe per esempio lo stim). Da ", b("25"), " vai in ", b("ragdoll"), ": vieni scaraventato e perdi il controllo, ma intanto le esplosioni ti fanno il 90% in meno. La passiva Rock Solid riduce lo stordimento del 30%: vai in ragdoll solo da 36."),
        ],
      },
      {
        id: "tipi",
        titolo: "Tipi di danno",
        corpo: [
          ul(
            li(b("Balistico"), ": proiettili di ogni tipo."),
            li(b("Esplosivo"), ": tutto quello che colpisce un'area. Ignora la durevolezza, e alcune parti lo resistono. I Helldiver ne prendono la metà, e con Fortified ancora la metà."),
            li(b("Fuoco"), ": incendia anche i Helldiver. Lo resistono Inflammable, Acclimated, Desert Stormer e Kinetic Displacement Mitigation."),
            li(b("Elettrico"), " (archi): lo resistono Electrical Conduit, Acclimated e Desert Stormer."),
            li(b("Gas"), ": lo resistono Advanced Filtration, Acclimated e Desert Stormer."),
            li(b("Acido"), " (bile dei Terminidi): rallenta e fa danno nel tempo. Lo resistono Acclimated e Desert Stormer."),
            li(b("Laser"), " (raggi): possono anche dare fuoco ai Helldiver."),
            li(b("Corpo a corpo"), ": artigli, lame, calci."),
            li(b("Impatto"), " (cadute e urti): lo resistono Kinetic Displacement Mitigation e Blunt-Force Mitigation."),
          ),
          p("Le resistenze precise delle passive sono nelle loro pagine: ", link("#/wiki/passive", "Passive delle armature"), "."),
        ],
      },
      {
        id: "distanza",
        titolo: "Danno e distanza",
        corpo: [
          ul(
            li("Il danno di un proiettile segue la sua velocità: se rallenta (attrito, gravità) fa meno danno, se va più veloce della partenza ne fa di più. Si guadagna sparando in tuffo, col Jump Pack o dal FRV in corsa."),
            li("Calibro e attrito aumentano il calo, la massa lo riduce. Le armi con attrito zero non perdono danno."),
            li("I missili guidati (Spear, Commando, Missile Pistol, Warrant, W.A.S.P.) riaccelerano da soli e non perdono danno."),
            li("L'esplosione di un proiettile non dipende da quanta strada ha fatto il proiettile."),
          ),
        ],
      },
      {
        id: "demolizione",
        titolo: "Demolizione e strutture",
        corpo: [
          p("Ogni struttura distruttibile ha una soglia da 0 a 60. La distrugge un attacco con ", b("forza di demolizione"), " almeno pari alla soglia, e qui perforazione e danno non contano. I generatori di nemici (Bug Hole, fabbriche degli Automi, navi degli Illuminati a terra) vogliono anche che sia un'", b("esplosione"), ": i proiettili non bastano mai."),
          p("Tutte le strutture, con quanti oggetti bastano per ognuna: ", link("#/wiki/strutture", "Strutture"), "."),
        ],
      },
      {
        id: "armatura",
        titolo: "Armatura degli Helldiver",
        corpo: [
          p("Un Helldiver ha ", b(`${a.salute || 125} di salute`), ". Ogni parte del corpo ha un moltiplicatore: testa ", b(`×${numero(parti.testa, 2)}`), ", petto ", b(`×${numero(parti.petto, 2)}`), ", braccia e gambe ", b(`×${numero(parti.braccia, 2)}`), ". Poi conta la ", b("protezione"), " dell'armatura:"),
          h("p", { class: "formula" }, "fino a 150: danno × (1,5 − protezione ÷ 200)     sopra 150: danno × (1,05 − protezione ÷ 500)"),
          p("Quindi 50 di protezione fa prendere il 125% del danno, 100 il 100%, 150 il 75%, 200 il 65%. Sulla ", b("testa"), " l'armatura conta solo sopra 100: con 100 o meno la testa prende sempre ×1,5. Gli ", link("#/wiki/elmi", "elmi"), " non cambiano niente (valgono tutti 100) e i ", link("#/wiki/mantelli", "mantelli"), " sono estetici."),
          p("Danno subito per ogni protezione delle armature del gioco (rispetto al danno del colpo):"),
          tabellaArmatura(),
          p("Altri moltiplicatori: esplosioni ", b(`×${numero(a.esplosioni ?? 0.5, 2)}`), ", passiva Fortified ", b(`×${numero(a.fortified ?? 0.5, 2)}`), " in più sulle esplosioni, booster Vitality Enhancement ", b(`×${numero(a.vitality ?? 0.9, 2)}`), "."),
          p(b("Leggere, medie e pesanti non hanno una protezione sola. "), "Il peso è una categoria, ma dentro ci sono valori diversi:"),
          protezioniPerPeso(),
          p("Una parte della protezione può venire dalla ", b("passiva"), ". ", b("Velocità"), " e ", b("stamina"), " dipendono solo dalla protezione di base: velocità = 600 − base; rigenerazione della stamina = 200 − base (da 100 in su) oppure 150 − base ÷ 2 (sotto 100). Le passive che aggiungono protezione, dai dati:"),
          passiveConProtezione(),
          p("Tutte le armature, con protezione, danno subito, velocità e stamina: ", link("#/wiki/armature", "Armature"), "."),
        ],
      },
      {
        id: "difficolta",
        titolo: "Difficoltà",
        corpo: [
          p("Si sceglie da 1 a 10. Salendo:"),
          ul(
            li("aumentano i premi: requisizioni ed esperienza da +25% a livello 3 fino a +300% al 10;"),
            li("arrivano più nemici e più forti, e le pattuglie sono più frequenti;"),
            li("si aggiungono modificatori della missione (uno da 5, due da 8);"),
            li("servono più obiettivi, le basi nemiche sono più grandi e le mappe più ampie."),
          ),
          p("Da quando compaiono i nemici, dai dati della wiki:"),
          nemiciPerDifficolta(),
        ],
      },
    ];
  }

  function disegna(main, scelta) {
    const elenco = sezioni();
    const pagine = stato.catalogo.meccaniche?.pagine || [];
    monta(
      main,
      W.indietro("#/wiki", "Wiki"),
      h("h1", { style: "margin:6px 0 10px" }, "Meccaniche del gioco"),
      h(
        "div",
        { class: "pannello indice-guida" },
        h("div", { class: "tenue piccolo", style: "margin-bottom:6px" }, "In italiano, dalle regole della wiki. Le tabelle si aggiornano da sole con i dati."),
        h("div", { class: "chips avvolte" }, elenco.map((s) => h("a", { class: "chip", href: `#/wiki/meccaniche/${s.id}` }, s.titolo))),
      ),
      elenco.map((s) => h("section", { id: `m-${s.id}`, class: "sezione-guida" }, h("h2", null, s.titolo), h("div", { class: "pannello testo-lungo" }, s.corpo))),
      pagine.length
        ? h(
            "section",
            { id: "m-pagine" },
            h("h2", null, "Le pagine della wiki (in inglese)"),
            h("div", { class: "pannello" }, ul(...pagine.map((x) => li(link(`#/wiki/pagina/${x.id}`, x.titolo))))),
          )
        : null,
    );
    if (scelta) {
      const el = document.getElementById(`m-${scelta}`);
      if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
    }
  }

  window.Meccaniche = { disegna };
})();
