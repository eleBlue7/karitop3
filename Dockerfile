FROM node:20-slim

# ffmpeg para el audio, python3 para yt-dlp, unzip para deno
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 curl ca-certificates unzip \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# deno: runtime de JavaScript que yt-dlp usa para YouTube
ENV DENO_INSTALL=/usr/local
RUN curl -fsSL https://deno.land/install.sh | sh

WORKDIR /app

RUN npm init -y >/dev/null && npm install express cors

COPY server.js ./

ENV PORT=10000
CMD ["node", "server.js"]
