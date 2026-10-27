// Chi sta usando l'app, senza password: lo dice Tailscale. `tailscale serve` (repo
// ingressi-https) aggiunge a ogni richiesta l'utente della tailnet, anche per chi riceve il
// dispositivo condiviso, e toglie le stesse intestazioni se arrivano da fuori. Per questo
// l'app ascolta solo su 127.0.0.1: nessuno può arrivarci senza passare da lì.

// Valori con caratteri non ASCII arrivano codificati come da RFC 2047 ("=?utf-8?q?...?=")
function decodifica(valore) {
  return String(valore || "").replace(/=\?([^?]+)\?([QqBb])\?([^?]*)\?=/g, (tutto, charset, tipo, testo) => {
    try {
      const byte =
        tipo.toUpperCase() === "B"
          ? Buffer.from(testo, "base64")
          : Buffer.from(testo.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
      return new TextDecoder(/utf-?8/i.test(charset) ? "utf-8" : "latin1").decode(byte);
    } catch {
      return tutto;
    }
  });
}

function pulito(testo, max) {
  return decodifica(testo).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

function amministratori() {
  return String(process.env.AMMINISTRATORI || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

// { login, nome, foto, amministratore } oppure null se la richiesta non viene da Tailscale.
// In sviluppo (fuori dal Pi) IDENTITA_PROVA="login|Nome" fa finta di essere qualcuno.
function identita(req) {
  let login = pulito(req.headers["tailscale-user-login"], 200);
  let nome = pulito(req.headers["tailscale-user-name"], 80);
  if (!login && process.env.IDENTITA_PROVA) [login, nome] = process.env.IDENTITA_PROVA.split("|");
  if (!login) return null;
  const foto = pulito(req.headers["tailscale-user-profile-pic"], 500);
  return {
    login,
    nome: nome || login.split("@")[0],
    foto: /^https:\/\//.test(foto) ? foto : null,
    amministratore: amministratori().includes(login.toLowerCase()),
  };
}

module.exports = { identita, decodifica };
