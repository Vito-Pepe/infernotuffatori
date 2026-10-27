# node:22-alpine e' multi-arch (amd64 + arm64): funziona su Raspberry Pi 5 senza modifiche
FROM node:22-alpine

WORKDIR /app
COPY server/ server/
COPY app/ app/

# Cartella dei dati (volume): dell'utente "node", con cui gira il server
RUN mkdir -p /data && chown node:node /data
USER node

ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server/server.js"]
