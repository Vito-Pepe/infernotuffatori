// Crea il catalogo di riserva che sta dentro l'immagine (app/dati/catalogo.json e app/icone/).
// Sul Pi l'app lo aggiorna da sola ogni giorno; questo serve quando si prepara una versione
// nuova dell'app, così chi la installa ha subito un catalogo recente anche senza rete.
// Uso: node strumenti/genera-catalogo.js [grezzo.json]   (grezzo da strumenti/scarica-wiki.js)
const fs = require("node:fs");
const path = require("node:path");
const { generaCatalogo } = require("../server/wiki/aggiornatore");
const { controlla } = require("../server/wiki/catalogo");
const { togliNonUsate } = require("../server/wiki/icone");

const radice = path.join(__dirname, "..");
const grezzo = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : undefined;

generaCatalogo({ cartellaIcone: path.join(radice, "app", "icone"), grezzo, avanzamento: (m) => console.log("·", m) })
  .then((c) => {
    const problemi = controlla(c, null);
    if (problemi.length) throw new Error(problemi.join("; "));
    fs.mkdirSync(path.join(radice, "app", "dati"), { recursive: true });
    fs.writeFileSync(path.join(radice, "app", "dati", "catalogo.json"), JSON.stringify(c));
    // Icone rimaste senza oggetto (oggetti tolti dalla wiki, immagini cambiate o non più
    // permesse): fuori dall'immagine
    const tolte = togliNonUsate(path.join(radice, "app", "icone"), c);
    const conImmagine = (l) => (l || []).filter((x) => x.icona).length;
    console.log(`Catalogo: ${c.oggetti.length} oggetti, ${c.nemici.length} nemici, ${c.armature?.length || 0} armature (${conImmagine(c.armature)} con immagine), ${c.elmi?.length || 0} elmi (${conImmagine(c.elmi)}), ${c.mantelli?.length || 0} mantelli (${conImmagine(c.mantelli)}), versione del gioco ${c.versioneGioco}`);
    if (c.avvisi.length) console.log("Avvisi:\n  " + c.avvisi.join("\n  "));
    if (tolte) console.log(`Icone non più usate tolte da app/icone: ${tolte}`);
  })
  .catch((e) => {
    console.error("Errore:", e.message);
    process.exit(1);
  });
