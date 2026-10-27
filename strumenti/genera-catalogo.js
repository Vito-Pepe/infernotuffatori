// Crea il catalogo di riserva che sta dentro l'immagine (app/dati/catalogo.json e app/icone/).
// Sul Pi l'app lo aggiorna da sola ogni giorno; questo serve quando si prepara una versione
// nuova dell'app, così chi la installa ha subito un catalogo recente anche senza rete.
// Uso: node strumenti/genera-catalogo.js [grezzo.json]   (grezzo da strumenti/scarica-wiki.js)
const fs = require("node:fs");
const path = require("node:path");
const { generaCatalogo } = require("../server/wiki/aggiornatore");
const { controlla } = require("../server/wiki/catalogo");

const radice = path.join(__dirname, "..");
const grezzo = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : undefined;

generaCatalogo({ cartellaIcone: path.join(radice, "app", "icone"), grezzo, avanzamento: (m) => console.log("·", m) })
  .then((c) => {
    const problemi = controlla(c, null);
    if (problemi.length) throw new Error(problemi.join("; "));
    fs.mkdirSync(path.join(radice, "app", "dati"), { recursive: true });
    fs.writeFileSync(path.join(radice, "app", "dati", "catalogo.json"), JSON.stringify(c));
    // Icone rimaste senza oggetto (oggetti tolti dalla wiki): si possono cancellare a mano
    const usate = new Set(c.oggetti.map((o) => o.icona).filter(Boolean));
    const orfane = fs.readdirSync(path.join(radice, "app", "icone")).filter((f) => !usate.has(f));
    console.log(`Catalogo: ${c.oggetti.length} oggetti, ${c.nemici.length} nemici, versione del gioco ${c.versioneGioco}`);
    if (c.avvisi.length) console.log("Avvisi:\n  " + c.avvisi.join("\n  "));
    if (orfane.length) console.log("Icone non usate:", orfane.join(", "));
  })
  .catch((e) => {
    console.error("Errore:", e.message);
    process.exit(1);
  });
