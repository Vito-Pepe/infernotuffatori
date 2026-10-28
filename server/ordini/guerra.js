// Ordini della guerra galattica: il Major Order (anche più d'uno) e il Personal Order del
// giorno, con l'avanzamento di ogni obiettivo, i pianeti coinvolti, la ricompensa e la
// scadenza. Funzioni pure: qui niente rete (vedi fonti.js), solo dai dati del gioco al
// formato dell'app.
//
// Il gioco non spiega i suoi numeri: tipi di obiettivo e di valore vengono dalla
// documentazione della community (github.com/helldivers-2/json, assignments/), ricavata
// osservando il gioco. Per quelli che non conosciamo l'app mostra i numeri così come sono.

// Tipi di obiettivo (task.type)
const TIPI = {
  2: "estrazione",
  3: "eliminazione",
  7: "missioni",
  9: "operazioni",
  11: "liberazione",
  12: "difesa",
  13: "controllo",
  15: "espansione",
};
// Cosa vuol dire ogni valore del compito (task.valueTypes)
const VALORI = { 1: "fazione", 2: "sconosciuto", 3: "obiettivo", 4: "nemico", 5: "oggetto", 9: "difficolta", 11: "luogoTipo", 12: "luogo" };
// Fazioni del gioco (race)
const FAZIONI = { 1: "superterra", 2: "terminidi", 3: "automi", 4: "illuminati" };
const NOMI_FAZIONI = { superterra: "Super Terra", terminidi: "Terminidi", automi: "Automi", illuminati: "Illuminati" };
// Contro una fazione: "dai Terminidi", "dagli Automi", "dagli Illuminati"
const DALLA = { terminidi: "dai Terminidi", automi: "dagli Automi", illuminati: "dagli Illuminati", superterra: "da Super Terra" };
const CONTRO = { terminidi: "contro i Terminidi", automi: "contro gli Automi", illuminati: "contro gli Illuminati", superterra: "contro Super Terra" };
// Ricompense (reward.type): la community conosce solo le medaglie
const RICOMPENSE = { 1: "Medaglie" };
const DIFFICOLTA = ["", "Trivial", "Easy", "Medium", "Challenging", "Hard", "Extreme", "Suicide Mission", "Impossible", "Helldive", "Super Helldive"];

const numero = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : null);
const intero = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const testo = (v) => (typeof v === "string" ? v.replace(/<\/?i=?\d*>/g, "").replace(/\r\n/g, "\n").trim() : "");

// Il testo del gioco ha marcatori di colore come <i=1>Malevelon Creek</i>: si tolgono
function pulisci(v) {
  return testo(v).replace(/<[^>]{0,20}>/g, "");
}

// Valori del compito per significato: { obiettivo: 10, fazione: 2, luogo: 123, ... }
function valoriDi(t) {
  const out = {};
  const valori = Array.isArray(t?.values) ? t.values : [];
  const tipi = Array.isArray(t?.valueTypes) ? t.valueTypes : [];
  tipi.forEach((tipo, i) => {
    const nome = VALORI[tipo] || `valore${tipo}`;
    if (!(nome in out)) out[nome] = numero(valori[i]);
  });
  return out;
}

// Un pianeta con il suo stato attuale: proprietario, liberazione, difesa in corso, giocatori
function pianeta(indice, ctx) {
  if (indice == null) return null;
  const info = ctx.pianeti?.[indice] || null;
  const st = (ctx.stato?.planetStatus || []).find((p) => p.index === indice) || null;
  const statico = (ctx.info?.planetInfos || []).find((p) => p.index === indice) || null;
  const evento = (ctx.stato?.planetEvents || []).find((e) => e.planetIndex === indice) || null;
  const out = { indice, nome: info?.name || `Pianeta ${indice}`, settore: info?.sector || null };
  if (st) {
    out.proprietario = FAZIONI[st.owner] || null;
    out.giocatori = numero(st.players);
    const massimo = numero(statico?.maxHealth);
    if (massimo && out.proprietario !== "superterra") out.liberazione = Math.max(0, Math.min(100, (1 - numero(st.health) / massimo) * 100));
  }
  if (evento) {
    const salute = numero(evento.health);
    const massimo = numero(evento.maxHealth);
    out.difesa = {
      fazione: FAZIONI[evento.race] || null,
      percento: massimo ? Math.max(0, Math.min(100, (1 - salute / massimo) * 100)) : null,
      fine: oraDelGioco(evento.expireTime, ctx),
    };
  }
  return out;
}

// Un istante nel tempo del gioco (secondi dall'inizio della guerra) come data vera
function oraDelGioco(secondi, ctx) {
  const adesso = numero(ctx.stato?.time);
  const s = numero(secondi);
  if (adesso == null || s == null) return null;
  return new Date(ctx.ora + (s - adesso) * 1000).toISOString();
}

function nomeOggetto(id, ctx) {
  if (id == null || !id) return null;
  return ctx.oggetti?.[id]?.name || null;
}

// Un compito: testo in italiano, obiettivo, quanto è fatto e quanto manca
function compito(t, fatto, ctx) {
  const v = valoriDi(t);
  const tipo = TIPI[t?.type] || null;
  const fazione = FAZIONI[v.fazione] || null;
  // luogoTipo 1 = un pianeta preciso; l'indice 0 vuol dire "pianeti qualsiasi"
  const p = v.luogo && (v.luogoTipo == null || v.luogoTipo === 1) ? pianeta(v.luogo, ctx) : null;
  const obiettivo = v.obiettivo != null && v.obiettivo > 0 ? v.obiettivo : null;
  const oggetto = nomeOggetto(v.oggetto, ctx);
  const difficolta = v.difficolta > 0 ? `a difficoltà ${v.difficolta}${DIFFICOLTA[v.difficolta] ? ` (${DIFFICOLTA[v.difficolta]})` : ""} o più` : null;
  const su = p ? `su ${p.nome}` : null;
  const conOggetto = oggetto ? `usando ${oggetto}` : v.oggetto ? "usando un oggetto preciso" : null;
  const contro = fazione && fazione !== "superterra" ? CONTRO[fazione] : null;
  let frase;
  switch (t?.type) {
    case 3:
      frase = [`Elimina ${obiettivo != null ? intero(obiettivo) : ""}`.trim(), v.nemico ? `nemici di un tipo preciso${fazione ? ` (${NOMI_FAZIONI[fazione]})` : ""}` : fazione ? NOMI_FAZIONI[fazione] : "nemici", conOggetto, su, difficolta];
      break;
    case 11:
      frase = [p ? `Libera ${p.nome}` : obiettivo > 1 ? `Libera ${intero(obiettivo)} pianeti` : "Libera il pianeta", !p && contro ? contro : null];
      break;
    case 12:
      frase = [p ? `Difendi ${p.nome}` : `Difendi ${obiettivo != null ? `${intero(obiettivo)} ${obiettivo === 1 ? "pianeta" : "pianeti"}` : "i pianeti"}`, fazione && fazione !== "superterra" ? DALLA[fazione] : null];
      break;
    case 13:
      frase = [p ? `Tieni ${p.nome} fino alla fine dell'ordine` : "Tieni i pianeti fino alla fine dell'ordine"];
      break;
    case 7:
      frase = [`Completa ${obiettivo != null ? intero(obiettivo) : ""} ${obiettivo === 1 ? "missione" : "missioni"}`.replace("  ", " "), contro, su, conOggetto, difficolta];
      break;
    case 9:
      frase = [`Completa ${obiettivo != null ? intero(obiettivo) : ""} ${obiettivo === 1 ? "operazione" : "operazioni"}`.replace("  ", " "), contro, su, difficolta];
      break;
    case 2:
      frase = [`Estrai ${obiettivo != null ? `${intero(obiettivo)} volte` : ""}`.trim(), conOggetto, contro, su, difficolta];
      break;
    case 15:
      frase = ["Libera più pianeti di quanti se ne perdono", contro];
      break;
    default:
      frase = [`Obiettivo (tipo ${t?.type ?? "?"} nei dati del gioco)`, obiettivo != null ? `traguardo ${intero(obiettivo)}` : null];
  }
  const f = numero(fatto) ?? 0;
  const out = { tipo, codice: t?.type ?? null, testo: frase.filter(Boolean).join(" "), fatto: f };
  if (fazione) out.fazione = fazione;
  if (p) out.pianeta = p;
  if (oggetto) out.oggetto = oggetto;
  if (v.difficolta > 0) out.difficolta = v.difficolta;
  // Liberare, difendere e tenere un pianeta: fatto è 0 o 1, l'avanzamento è quello del pianeta
  const unPianeta = p && (t?.type === 11 || t?.type === 12 || t?.type === 13);
  if (unPianeta) {
    out.obiettivo = 1;
    out.completato = t.type === 13 ? p.proprietario === "superterra" : f >= 1 || (t.type === 11 && p.proprietario === "superterra");
    if (t.type === 11) out.percento = out.completato ? 100 : p.liberazione ?? null;
    if (t.type === 12) out.percento = out.completato ? 100 : p.difesa?.percento ?? null;
    if (t.type === 13) out.percento = out.completato ? 100 : 0;
  } else if (obiettivo != null) {
    out.obiettivo = obiettivo;
    out.completato = f >= obiettivo;
    out.percento = Math.max(0, Math.min(100, (f / obiettivo) * 100));
    out.manca = Math.max(0, obiettivo - f);
  } else {
    out.completato = f >= 1;
  }
  return out;
}

function ricompense(setting) {
  const elenco = [...(Array.isArray(setting?.rewards) ? setting.rewards : []), ...(setting?.reward ? [setting.reward] : [])].filter((r) => r && numero(r.amount) > 0);
  const viste = new Set();
  const out = [];
  for (const r of elenco) {
    const chiave = `${r.type}:${r.id32 ?? ""}:${r.amount}`;
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    out.push({ tipo: numero(r.type), nome: RICOMPENSE[r.type] || `ricompensa (tipo ${r.type} nei dati del gioco)`, quantita: numero(r.amount) });
  }
  return out;
}

// Elenco di ordini del gioco (Assignment) → ordini dell'app. `genere`: "maggiore" o "personale".
// ctx: { ora (ms), stato (Status), info (WarInfo), pianeti, oggetti }
function leggiOrdini(lista, genere, ctx) {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((a) => a && a.setting)
    .map((a) => {
      const s = a.setting;
      const progressi = Array.isArray(a.progress) ? a.progress : [];
      const compiti = (Array.isArray(s.tasks) ? s.tasks : []).map((t, i) => compito(t, progressi[i], ctx));
      const scadenza = numero(a.expiresIn) != null ? new Date(ctx.ora + numero(a.expiresIn) * 1000).toISOString() : null;
      return {
        id: String(a.id32 ?? ""),
        genere,
        titolo: pulisci(s.overrideTitle) || (genere === "personale" ? "Ordine personale" : "Ordine maggiore"),
        briefing: pulisci(s.overrideBrief) || null,
        descrizione: pulisci(s.taskDescription) || null,
        scadenza,
        compiti,
        completato: compiti.length > 0 && compiti.every((c) => c.completato),
        ricompense: ricompense(s),
      };
    });
}

// Ultimi dispacci (notizie del gioco), dal più recente
function leggiDispacci(lista, ctx, quanti = 5) {
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((n) => n && pulisci(n.message))
    .sort((a, b) => (numero(b.published) ?? 0) - (numero(a.published) ?? 0))
    .slice(0, quanti)
    .map((n) => ({ id: String(n.id ?? ""), data: oraDelGioco(n.published, ctx), testo: pulisci(n.message) }));
}

// Helldiver in gioco: la somma dei giocatori su ogni pianeta
function giocatori(stato) {
  const l = Array.isArray(stato?.planetStatus) ? stato.planetStatus : [];
  return l.length ? l.reduce((n, p) => n + (numero(p.players) || 0), 0) : null;
}

module.exports = { leggiOrdini, leggiDispacci, giocatori, compito, valoriDi, pianeta, pulisci, TIPI, VALORI, FAZIONI };
