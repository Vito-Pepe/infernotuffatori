# Infernotuffatori

Build di **Helldivers 2** condivise tra amici, sul Raspberry Pi. Chi entra dalla tailnet crea le sue build e vede quelle di tutti. Per ogni build l'app calcola le prestazioni dai dati veri del gioco, presi dalla wiki, che si aggiorna da sola quando escono patch.

- Pagina: `https://infernotuffatori.<tailnet>.ts.net` (indirizzo della repo `ingressi-https`). Niente indirizzo `http://IP:porta`: l'app ascolta solo sul Pi, vedi **Sicurezza**.
- Si apre anche dal riquadro **Infernotuffatori** della homepage.
- Su iPhone: Safari → Condividi → "Aggiungi alla schermata Home".

## Cosa fa

- **Elenco delle build**, diviso per fazione (Terminidi, Automi, Illuminati), con le icone dell'equipaggiamento e la potenza totale.
  - Cerca per nome, autore o oggetto, filtra per autore o fazione.
  - Si riordinano trascinando la maniglia ⠿, col dito o col mouse; l'ordine vale per tutti.
- **Costruttore** con:
  - fazione, nome e note;
  - arma primaria, secondaria, granata;
  - 4 stratagemmi, sempre diversi tra loro;
  - passiva dell'armatura con il peso (leggera, media, pesante) e potenziamento.

  Gli oggetti si scelgono da una finestra con ricerca, categorie e ordinamento per efficacia contro leggeri, medi o pesanti. Le metriche si aggiornano a ogni scelta. Una build lasciata a metà su un dispositivo riparte da lì.
- **Pagina della build**:
  - ogni oggetto con descrizione, tratti, codice dello stratagemma e scheda (danno, perforazione, caricatore, ricarica, cadenza, chiamata, attesa, usi) e un link alla wiki;
  - **Modifica** ed **Elimina** solo per chi l'ha creata (e per gli amministratori), **Duplica** per tutti, **Copia link**.
- **Analisi**:
  - prestazioni (leggeri, medi, pesanti, sopravvivenza, utilità, controllo, obiettivi);
  - potenza totale (fuoco + supporto) e soglie di fuoco consigliate;
  - efficacia per distanza;
  - profilo (rumore, ritmo, impatto, pericolo per la squadra);
  - strutture della fazione che la build può distruggere;
  - peso di ogni oggetto e avvisi, per esempio due zaini, due armi di supporto, poco contro i pesanti.
- **Importa da democracy-hub**: si incollano i link di condivisione, uno per riga, con il nome davanti se si vuole. Le build arrivano nell'elenco: lì le build salvate restano solo nel browser di chi le ha fatte, qui stanno sul Pi.
- **Novità**: cosa è cambiato a ogni aggiornamento del catalogo, cioè oggetti nuovi, tolti o cambiati con i valori prima e dopo, e le build che li usano. C'è anche il pulsante **Aggiorna adesso dalla wiki**.
- **Come calcoliamo**: spiegazione del modello, con fonti e crediti.

## Il catalogo e l'aggiornamento automatico

Il catalogo viene dalla [Helldivers Wiki](https://helldivers.wiki.gg) (licenza CC BY-NC-SA 4.0):
- **oggetti**: le pagine di armi, granate, stratagemmi, passive e potenziamenti;
- **numeri**: i dati estratti dal gioco che la wiki pubblica (danni, perforazione, esplosioni, munizioni, tempi);
- **nemici**: le schede con salute e corazza di ogni parte;
- **strutture**: la tabella della forza di demolizione.

**Aggiornamento sul Pi**:
- Il server controlla la wiki **una volta al giorno**: la prima volta pochi minuti dopo l'avvio, poi ogni 24 ore. Il controllo dura circa mezzo minuto.
- Scarica le icone che mancano.
- Se il catalogo nuovo supera i controlli, prende il posto di quello vecchio e i cambiamenti finiscono in **Novità**.
- I controlli verificano che ci siano abbastanza oggetti per posto, che nessun posto ne perda troppi, che i nemici ci siano e che le statistiche siano state lette. Se la wiki non risponde o cambia formato, resta il catalogo di prima.
- **Aggiorna adesso dalla wiki** fa partire un controllo subito, al massimo uno ogni 10 minuti.

**Catalogo di riserva**: dentro l'immagine c'è un catalogo di riserva (`app/dati/catalogo.json` e `app/icone/`), così l'app funziona anche senza rete. Si rigenera con `npm run catalogo` quando si prepara una versione nuova dell'app.

**Icone**:
- Le **armi** usano le immagini della wiki, in miniatura. Si saltano quelle la cui licenza vieta l'uso in contenuti ad accesso riservato.
- Gli **stratagemmi** usano la raccolta [nvigneux/Helldivers-2-Stratagems-icons-svg](https://github.com/nvigneux/Helldivers-2-Stratagems-icons-svg) ("Feel free to use them in your own projects"). Gli SVG vengono ripuliti prima di salvarli.
- **Passive, potenziamenti e fazioni** hanno emblemi disegnati per l'app.

## Come calcoliamo (in breve)

Tutto è in `app/comune/metriche.js`, con le costanti commentate; la spiegazione completa è nella pagina **Come calcoliamo**.

- **Potenza di fuoco**: per ogni oggetto e ogni nemico della fazione si contano i colpi che servono per abbatterlo, sulla parte più conveniente.
  - Perforazione e corazza: danno pieno se la perforazione supera la corazza, 65% se è uguale, niente se è minore.
  - Contano anche danno durevole, esplosioni, fuoco e gas.
  - Le parti difficili da colpire contano come più colpi.

  Poi entrano in conto cadenza, caricatore, ricarica, munizioni e quanti nemici prende un'esplosione, per arrivare alle uccisioni al minuto. Stratagemmi orbitali e aquile contano per uso, insieme ad attesa, riarmo e usi. Le armi in mano si usano una alla volta.
- **Classi dei nemici**:
  - **pesanti**: corazza 4 o più e almeno 1000 di salute, oppure 3000 di salute;
  - **medi**: corazza 2-3 o almeno 450 di salute;
  - **leggeri**: tutti gli altri.
- **Supporto**: regole sul tipo di oggetto e sui suoi effetti (scudi, rifornimenti, mobilità, stordimenti, fumo, gas). Per gli obiettivi conta la forza di demolizione che serve per ogni struttura.

È un modello nostro: non conosce la mira, la squadra o la difficoltà, e alcune stime sono scelte nostre. Dei punteggi di democracy-hub non si usa niente.

## I dati

Tutto sta nel volume Docker `infernotuffatori_dati`:
- `build.json`: le build e l'ordine degli elenchi. Ogni salvataggio scrive un file nuovo e poi lo sostituisce;
- `backup/`: una copia al giorno di `build.json`, le ultime 14;
- `catalogo/`: il catalogo aggiornato dalla wiki (`catalogo.json`), le icone scaricate (`icone/`), lo stato dell'ultimo controllo (`stato.json`) e le novità (`novita.json`).

Backup completo dal Pi:

```bash
docker run --rm -v infernotuffatori_dati:/data -v "$HOME":/backup alpine tar czf /backup/infernotuffatori-dati.tgz -C /data .
```

## Installazione sul Raspberry Pi

Prima l'ingresso HTTPS: il servizio `infernotuffatori` della repo `ingressi-https` crea la rete `ingresso-infernotuffatori`, che l'app usa. Senza, `docker compose up` si ferma con `network ingresso-infernotuffatori declared as external, but could not be found`. Poi:

```bash
cd ~
git clone https://github.com/Vito-Pepe/infernotuffatori.git
cd infernotuffatori
docker compose up -d --build
curl -s http://127.0.0.1:8091/api/salute
```

Risposta attesa: `{"ok":true}`.

Aggiornamento automatico dell'app ogni 5 minuti (senza sudo):

```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * cd $HOME/infernotuffatori && ./update.sh >> $HOME/infernotuffatori/update.log 2>&1") | crontab -
```

**Amministratori** (facoltativo): possono modificare ed eliminare le build di tutti. Il proprio login Tailscale si legge aprendo `https://infernotuffatori.<tailnet>.ts.net/api/io` (campo `login`). Va nel file `.env` della cartella, mai su git:

```bash
printf 'AMMINISTRATORI=%s\n' 'il-tuo-login-tailscale' >> .env && docker compose up -d
```

## Far entrare un amico

Non serve invitarlo nella tailnet: basta **condividergli solo il dispositivo dell'app**. Così vede questa app e nient'altro del Pi.

1. Pannello di Tailscale → **Machines** → `infernotuffatori` → **Share**, e manda l'invito al suo account Tailscale (gratuito).
2. Lui accetta e apre `https://infernotuffatori.<tailnet>.ts.net`. Con un dispositivo condiviso serve il nome completo.
3. Tailscale dice all'app chi è: le sue build portano il suo nome, e solo lui (o un amministratore) può modificarle.

## Sicurezza

- **Niente password**: chi sei lo dice Tailscale. `tailscale serve` (repo `ingressi-https`) aggiunge a ogni richiesta l'utente della tailnet, anche per chi riceve il dispositivo condiviso, e cancella le stesse intestazioni se arrivano da fuori.
- Per questo il container pubblica la porta **solo su `127.0.0.1:8091`**: nessuno, nemmeno dalla rete di casa, può arrivarci senza passare da Tailscale e fingersi un altro. Chi non è riconosciuto vede tutto ma non può scrivere.
- **L'ingresso ha una rete sua.** Gli altri ingressi di `ingressi-https` usano la rete del Pi, e in modalità utente Tailscale gira ogni porta del dispositivo sul `127.0.0.1` del Pi. Andrebbe bene per i tuoi dispositivi, non per uno condiviso: l'amico arriverebbe a tutte le porte del Pi. Quello di Infernotuffatori sta invece in una rete Docker a parte (`ingresso-infernotuffatori`), insieme solo all'app, e passa le richieste a `http://infernotuffatori-app:3000`. Chi riceve il dispositivo trova la 443 e nient'altro.
- **Container**: filesystem in sola lettura (si scrive solo nel volume dei dati e in `/tmp`), utente `node` senza privilegi, nessuna capacità di Linux, `no-new-privileges`, limite di processi.
- **Pagina**: non carica niente da altri siti (Content-Security-Policy `default-src 'self'`) e non usa cookie. Le icone SVG si servono con una politica che non lascia eseguire niente.
- **Scritture**: accettate solo in JSON, solo dalla pagina stessa e solo da utenti riconosciuti. Le build vengono controllate oggetto per oggetto.
- **Collegamenti verso Internet**, fatti solo dal server: la wiki (`helldivers.wiki.gg`) e la raccolta di icone (`raw.githubusercontent.com`), una volta al giorno.

## Sviluppo

Senza dipendenze: basta Node 22.

```bash
npm test                                                       # test di modello, wiki, importazione e server
DATA_DIR=/tmp/it AGGIORNA_WIKI=0 IDENTITA_PROVA="io|Io" PORT=3000 npm start   # http://localhost:3000
node strumenti/scarica-wiki.js /tmp/grezzo.json                # materiale grezzo della wiki in un file
npm run catalogo -- /tmp/grezzo.json                           # catalogo di riserva da quel file
```

## Crediti

- **Dati, statistiche e immagini delle armi**: Helldivers Wiki (wiki.gg) e gli utenti che le hanno caricate, CC BY-NC-SA 4.0. Il catalogo `app/dati/catalogo.json` e le immagini `app/icone/*.png` ne derivano e restano sotto la stessa licenza.
- **Icone degli stratagemmi** (`app/icone/*.svg`): nvigneux/Helldivers-2-Stratagems-icons-svg.
- Helldivers è un marchio di Sony Interactive Entertainment; il gioco è di Arrowhead Game Studios. App di appassionati, privata e senza scopo di lucro.

## Porte

| Uso | Porta |
|---|---|
| Pagina e API, solo dal Pi (prove con `curl`) | `127.0.0.1:8091` (8080–8090 sono di altre app) |
| Ingresso HTTPS (repo `ingressi-https`) | rete Docker `ingresso-infernotuffatori`, verso `infernotuffatori-app:3000` |
