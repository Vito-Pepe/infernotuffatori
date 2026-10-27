// Importazione da democracy-hub, novità del catalogo (aggiornamenti dalla wiki) e la
// pagina che spiega come calcoliamo le metriche.
(function () {
  "use strict";
  const { h, monta, stato, oggetto, chiama, avviso, vista, vai, data, numero, usaCatalogo, leggiLocale, scriviLocale } = window.IT;
  const G = window.Grafica;
  const M = window.Metriche;

  // --- Importa ---

  vista("importa", (main) => {
    const area = h("textarea", {
      rows: 7,
      placeholder: "fire https://democracy-hub.net/builder/builder.php?v=...\ngas https://democracy-hub.net/builder/builder.php?v=...",
      "aria-label": "Link da importare",
    });
    const anteprima = h("div", { class: "anteprima" });
    let voci = [];

    const leggi = () => {
      voci = window.Democracy.estrai(area.value).map((v) => (v.errore ? v : { ...v, ...window.Democracy.aBuild(v, stato.catalogo), scelta: true }));
      if (!voci.length) {
        anteprima.replaceChildren(h("p", { class: "tenue" }, "Nessun link di democracy-hub trovato nel testo."));
        return;
      }
      const pulsante = h("button", { class: "pulsante primo", type: "button", disabled: !stato.io.login }, "");
      const conta = () => (pulsante.textContent = `Importa ${voci.filter((v) => v.scelta).length} build`);
      anteprima.replaceChildren(
        ...voci.map((v, i) => {
          if (v.errore) return h("div", { class: "avviso attenzione" }, `${v.nome || `Link ${i + 1}`}: ${v.errore}`);
          const nome = h("input", { type: "text", value: v.build.nome, maxlength: 60, "aria-label": "Nome della build", oninput: (e) => (v.build.nome = e.target.value) });
          const casella = h("input", { type: "checkbox", checked: true, "aria-label": "Da importare", onchange: (e) => ((v.scelta = e.target.checked), conta()) });
          return h(
            "div",
            { class: "riga" },
            casella,
            G.emblemaFazione(v.build.fazione),
            h("div", { class: "testo" }, nome, v.mancanti.length ? h("div", { class: "mancanti" }, `Non trovati nel catalogo: ${v.mancanti.join(", ")}`) : null),
            h("div", { class: "icone" }, window.Elenco.oggettiDi(v.build).map((id) => G.iconaOggetto(oggetto(id)))),
          );
        }),
        h("div", { class: "pulsanti", style: "margin-top:10px" }, pulsante),
      );
      conta();
      pulsante.addEventListener("click", async () => {
        pulsante.disabled = true;
        let fatte = 0;
        for (const v of voci.filter((x) => x.scelta && !x.errore)) {
          try {
            const r = await chiama("POST", "build", { ...v.build, nome: v.build.nome.trim() || "Build importata" });
            stato.build.push(r);
            stato.ordine[r.fazione] = [r.id, ...stato.ordine[r.fazione]];
            fatte++;
          } catch (e) {
            avviso(`${v.build.nome}: ${e.message}`, "errore");
          }
        }
        avviso(`${fatte} build importate`, "ok");
        vai("/");
      });
    };

    monta(main, 
      h("h1", { style: "margin-bottom:10px" }, "Importa da democracy-hub"),
      h(
        "div",
        { class: "testo-lungo" },
        h("p", null, "Su democracy-hub le build salvate restano solo nel browser di chi le ha fatte. Per portarle qui: apri la build nel loro costruttore, premi il pulsante per condividerla e copia il link."),
        h("p", null, "Incolla qui sotto un link per riga. Il nome, se lo scrivi prima del link sulla stessa riga, diventa il nome della build."),
      ),
      stato.io.login ? null : h("div", { class: "avviso attenzione" }, "Per importare apri l'app dal suo indirizzo Tailscale."),
      area,
      h("div", { class: "pulsanti", style: "margin:10px 0 16px" }, h("button", { class: "pulsante", type: "button", onclick: leggi }, "Leggi i link")),
      anteprima,
    );
  });

  // --- Novità ---

  function voceCambio(m) {
    const valore = (v) => (v == null ? "—" : typeof v === "number" ? numero(v, 2) : String(v));
    return h("li", { class: "cambio" }, `${m.campo}: `, h("del", null, valore(m.prima)), " → ", h("ins", null, valore(m.dopo)));
  }

  // Nemici e strutture cambiati: nome (con la fazione) e l'elenco prima → dopo
  function gruppoCambi(titolo, voci) {
    if (!voci?.length) return null;
    const fazione = (f) => (f === "tutte" ? "tutte le fazioni" : G.FAZIONI[f]?.nome || f);
    return h(
      "div",
      { style: "margin-top:6px" },
      h("b", null, titolo),
      voci.map((x) => h("div", { style: "margin-top:6px" }, h("div", null, x.nome, h("span", { class: "tenue piccolo" }, ` · ${fazione(x.fazione)}`)), h("ul", null, x.modifiche.slice(0, 12).map(voceCambio)))),
    );
  }

  function buildCon(ids) {
    const insieme = new Set(ids);
    return stato.build.filter((b) => window.Elenco.oggettiDi(b).some((id) => insieme.has(id)));
  }

  vista("novita", (main) => {
    const statoBox = h("div", { class: "pannello" });
    const elenco = h("div");
    let timer = null;

    const disegnaStato = (s) => {
      if (!s) return;
      const pulsante = h("button", { class: "pulsante", type: "button", disabled: s.inCorso || !stato.io.login, onclick: avvia }, s.inCorso ? "Aggiornamento in corso…" : "Aggiorna adesso dalla wiki");
      statoBox.replaceChildren(
        h("div", null, h("b", null, "Catalogo: "), `${s.oggetti} oggetti, versione del gioco ${s.versioneGioco || "?"}, dati della wiki del ${data(s.generato)}.`),
        h(
          "div",
          { class: "tenue piccolo", style: "margin:6px 0 10px" },
          s.ultimoTentativo ? `Ultimo controllo: ${new Date(s.ultimoTentativo).toLocaleString("it-IT")} — ${s.esito === "ok" ? `riuscito${s.cambiamenti ? `, ${s.cambiamenti} cambiamenti` : ", niente di nuovo"}` : `non riuscito (${s.errore || "errore"}), resta il catalogo di prima`}.` : "Nessun controllo ancora: il primo parte da solo poco dopo l'avvio, poi uno al giorno.",
        ),
        pulsante,
      );
    };

    const carica = async () => {
      const [s, novita] = await Promise.all([chiama("GET", "aggiornamento"), chiama("GET", "novita")]);
      stato.aggiornamento = s;
      disegnaStato(s);
      scriviLocale("it-novita-viste", novita[0]?.data || null);
      window.App?.badgeNovita();
      elenco.replaceChildren(
        ...(novita.length
          ? novita.map((n) => {
              const interessate = buildCon([...n.cambiati, ...n.rimossi].map((x) => x.id));
              return h(
                "div",
                { class: "pannello novita-voce" },
                h("h3", null, `${new Date(n.data).toLocaleString("it-IT")}${n.versioneGioco ? ` · versione ${n.versioneGioco}` : ""}`),
                n.aggiunti.length ? h("div", null, h("b", null, "Nuovi: "), n.aggiunti.map((x) => x.nome).join(", ")) : null,
                n.rimossi.length ? h("div", null, h("b", null, "Tolti: "), n.rimossi.map((x) => x.nome).join(", ")) : null,
                n.cambiati.length
                  ? h(
                      "div",
                      null,
                      h("b", null, "Cambiati:"),
                      n.cambiati.map((x) => h("div", { style: "margin-top:6px" }, h("div", null, x.nome), h("ul", null, x.modifiche.slice(0, 12).map(voceCambio)))),
                    )
                  : null,
                gruppoCambi("Nemici:", n.nemici),
                gruppoCambi("Strutture:", n.strutture),
                interessate.length ? h("div", { class: "piccolo", style: "margin-top:8px" }, "Build che usano oggetti cambiati: ", interessate.map((b, i) => [i ? ", " : "", h("a", { href: `#/build/${b.id}` }, b.nome)])) : null,
              );
            })
          : [h("div", { class: "vuoto" }, "Ancora nessun cambiamento rispetto al catalogo iniziale.")]),
      );
    };

    async function avvia() {
      try {
        disegnaStato(await chiama("POST", "aggiornamento", {}));
        const controlla = async () => {
          const s = await chiama("GET", "aggiornamento");
          if (s.inCorso) {
            disegnaStato(s);
            timer = setTimeout(controlla, 3000);
            return;
          }
          usaCatalogo(await chiama("GET", "catalogo"));
          await carica();
          avviso(s.esito === "ok" ? "Catalogo aggiornato" : `Aggiornamento non riuscito: ${s.errore}`, s.esito === "ok" ? "ok" : "errore");
        };
        timer = setTimeout(controlla, 3000);
      } catch (e) {
        avviso(e.message, "errore");
      }
    }

    monta(main, h("h1", { style: "margin-bottom:10px" }, "Novità dalla wiki"), statoBox, h("h2", null, "Cambiamenti"), elenco);
    carica().catch((e) => avviso(e.message, "errore"));
    return () => clearTimeout(timer);
  });

  // --- Come calcoliamo ---

  vista("teoria", (main) => {
    const R = M.RIFERIMENTO;
    const p = (...x) => h("p", null, ...x);
    const li = (...x) => h("li", null, ...x);
    monta(main, 
      h(
        "div",
        { class: "testo-lungo" },
        h("h1", { style: "margin-bottom:10px" }, "Come calcoliamo"),
        p("Ogni numero viene dai dati del gioco pubblicati dalla wiki di Helldivers 2: danni, perforazione, esplosioni, munizioni, tempi di chiamata e di attesa, e l'anatomia dei nemici (salute e corazza di ogni parte). Niente voti dati a mano: quando un aggiornamento del gioco cambia un'arma, la wiki la aggiorna e qui cambiano i punteggi."),
        h("h2", null, "Potenza di fuoco: leggeri, medi, pesanti"),
        p("Per ogni oggetto e ogni nemico della fazione contiamo quanti colpi servono per abbatterlo, scegliendo la parte più conveniente da colpire:"),
        h(
          "ul",
          null,
          li("perforazione maggiore della corazza: danno pieno; uguale: 65%; minore: niente (regole della wiki);"),
          li("le parti durevoli prendono il danno durevole dell'arma; le esplosioni colpiscono il corpo e ignorano la durevolezza, ma alcune parti le resistono;"),
          li("fuoco e gas aggiungono danno nel tempo, una volta per nemico;"),
          li("le parti piccole o sul retro (testa, punti deboli, dissipatori) sono più difficili da colpire: contano come più colpi, di più contro i pesanti; la carne sotto la corazza non conta finché la corazza c'è."),
        ),
        p("Dai colpi, con cadenza, caricatore e ricarica, viene il tempo per abbattere ogni nemico e quindi le uccisioni al minuto. Le esplosioni e gli archi colpiscono più nemici insieme se sono in gruppo. Le munizioni contano: non si uccide più di quanto permettono i colpi che si portano in 3 minuti (poi si fa rifornimento). Se abbattere un nemico richiede troppo tempo esposti (oltre 2 secondi per un leggero, 5 per un medio, 4 per un pesante) l'efficacia cala in fretta; contro un pesante un'arma che non perfora la corazza del corpo vale un terzo."),
        p("Stratagemmi orbitali e aquile: quanti nemici prendono a ogni uso, per quante volte si possono usare al minuto (attesa, riarmo, usi per missione). Torrette e postazioni sparano per al più un minuto e rendono la metà (restano dove sono); i droni degli zaini rendono la metà di chi spara."),
        p(`Le armi in mano si usano una alla volta: per ogni classe di nemico conta la migliore più un quarto della seconda; granate e stratagemmi si aggiungono. Il punteggio da 0 a 10 vale 5 a ${R.leggero} uccisioni al minuto contro i leggeri, ${R.medio} contro i medi e ${R.pesante} contro i pesanti, e si avvicina a 10 senza mai arrivarci.`),
        p("Classi dei nemici: pesanti quelli con corazza 4 o più e almeno 1000 di salute, o con 3000 di salute (Charger, Bile Titan, Hulk, carri, Harvester); medi quelli con corazza 2 o 3 o almeno 450 di salute; leggeri gli altri. Navi e boss degli eventi non contano."),
        h("h2", null, "Supporto: sopravvivenza, utilità, controllo, obiettivi"),
        h(
          "ul",
          null,
          li("Sopravvivenza: peso dell'armatura (leggera 2,5, media 3,5, pesante 4,5), passiva e potenziamento secondo il loro effetto, zaini scudo, generatore di scudi, mezzi, torrette, fumo, stordimenti."),
          li("Utilità: rifornimenti (zaino, FRV), mobilità (jump pack, hover, warp, mezzi, armatura leggera), potenziamenti di squadra (rinforzi, capsule piene, radar, campioni)."),
          li("Controllo: dagli effetti negli attacchi (stordimento, confusione del gas, accecamento del fumo, rallentamento, elettricità), dalla forza di stordimento dei colpi e dalle esplosioni grandi; gli stratagemmi con attese lunghe contano meno."),
          li("Obiettivi: le strutture della fazione (nidi, fabbriche, torri, jammer, navi) e la forza di demolizione che serve per ognuna, dalla tabella della wiki. Nidi e fabbriche si chiudono solo con esplosioni."),
        ),
        p("Le voci di supporto si sommano con rendimenti decrescenti: due cose da 5 fanno 7,5, non 10."),
        h("h2", null, "Gittata, rumore, ritmo, impatto, pericolo"),
        h(
          "ul",
          null,
          li("Efficacia per distanza: ogni arma ha un profilo secondo il tipo (pallettoni, mischia, getti, archi, raggi, esplosivi, precisione, stratagemmi), pesato per quanto conta nel fuoco della build."),
          li("Rumore: dai dati del gioco sul rumore di ogni arma ed esplosione."),
          li("Ritmo: peso dell'armatura, mobilità, torrette e postazioni (si resta fermi), armi pesanti da maneggiare, attese lunghe."),
          li("Impatto: quanto la build spazza le orde con esplosioni grandi, fuoco e archi. Pericolo: esplosioni vicine, fuoco, archi che rimbalzano sui compagni, mine, Hellbomb."),
        ),
        h("h2", null, "Cosa non sappiamo"),
        p("È un modello: non conosce la mira di chi gioca, i compagni, la difficoltà, il pianeta. Alcuni valori sono stime nostre (densità dei nemici, quante bombe cadono con certe aquile, quanto dura un colpo del Meltagun). Per gli oggetti appena aggiunti la wiki può non avere ancora tutti i dati: lì i punteggi sono più bassi del vero finché la wiki non si aggiorna."),
        h("h2", null, "Fonti e crediti"),
        h(
          "ul",
          null,
          li("Dati, statistiche e immagini delle armi: ", h("a", { href: "https://helldivers.wiki.gg", target: "_blank", rel: "noopener noreferrer" }, "Helldivers Wiki"), " (wiki.gg), licenza CC BY-NC-SA 4.0. Le immagini delle armi sono degli utenti che le hanno caricate."),
          li("Icone degli stratagemmi: ", h("a", { href: "https://github.com/nvigneux/Helldivers-2-Stratagems-icons-svg", target: "_blank", rel: "noopener noreferrer" }, "nvigneux/Helldivers-2-Stratagems-icons-svg"), "."),
          li("Emblemi di passive, potenziamenti e fazioni: disegnati per questa app."),
          li("Helldivers è un marchio di Sony Interactive Entertainment; il gioco è di Arrowhead Game Studios. App di appassionati, privata e senza scopo di lucro."),
        ),
      ),
    );
  });
})();
