// Scarica il materiale grezzo dalla wiki in un file (per lavorare al catalogo senza rete).
// Uso: node strumenti/scarica-wiki.js <file.json>
const fs = require("node:fs");
const { scaricaTutto } = require("../server/wiki/sorgenti");

const destinazione = process.argv[2];
if (!destinazione) {
  console.error("Uso: node strumenti/scarica-wiki.js <file.json>");
  process.exit(1);
}
scaricaTutto({ avanzamento: (m) => console.log("·", m) })
  .then((grezzo) => {
    fs.writeFileSync(destinazione, JSON.stringify(grezzo));
    console.log(`Salvato ${destinazione}: ${Object.keys(grezzo.pagine).length} pagine, ${grezzo.iconeStratagemmi.length} icone`);
  })
  .catch((e) => {
    console.error("Errore:", e.message);
    process.exit(1);
  });
