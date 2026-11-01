FROM node:20-slim

# ffmpeg para convertir el audio, python3 para ejecutar yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
       -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Solo las dependencias del servidor
RUN npm init -y >/dev/null && npm install express cors

COPY server.js ./

ENV PORT=10000
CMD ["node", "server.js"]
