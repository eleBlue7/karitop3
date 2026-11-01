import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "*",
    exposedHeaders: ["Content-Disposition"],
  })
);

app.use(express.json());

// Cookies de YouTube (archivo secreto de Render). Se copian a una carpeta
// temporal porque /etc/secrets es de solo lectura y yt-dlp intenta escribir en el archivo.
let cookiesPath = null;
if (process.env.COOKIES_FILE && fs.existsSync(process.env.COOKIES_FILE)) {
  cookiesPath = path.join(os.tmpdir(), "cookies.txt");
  fs.copyFileSync(process.env.COOKIES_FILE, cookiesPath);
}

const YT_REGEX = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;

app.post("/api/youtube-to-mp3", (req, res) => {
  const { url, nombre } = req.body || {};

  if (!url || !YT_REGEX.test(url)) {
    return res.status(400).json({ error: "La URL de YouTube no es válida" });
  }

  // Quita caracteres prohibidos en nombres de archivo (incluidas comillas, para
  // poder usar el nombre dentro de --postprocessor-args) y escapa el % de yt-dlp
  const nombreLimpio = (nombre || "")
    .replace(/[\\/:*?"<>|%]/g, "")
    .trim()
    .slice(0, 120);
  const plantilla = nombreLimpio || "%(title)s";

  const dir = path.join(os.tmpdir(), randomUUID());
  fs.mkdirSync(dir, { recursive: true });

  const args = [
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "--embed-thumbnail",
    "--convert-thumbnails", "jpg",
    "--embed-metadata",
    "--remote-components", "ejs:github",
    "--no-playlist",
    "-o", path.join(dir, `${plantilla}.%(ext)s`),
  ];

  // Si pusieron nombre, también lo guardamos como título dentro del MP3
  if (nombreLimpio) {
    args.push("--postprocessor-args", `ffmpeg:-metadata title="${nombreLimpio}"`);
  }

  args.push(url);
  if (cookiesPath) args.unshift("--cookies", cookiesPath);

  const proc = spawn("yt-dlp", args);
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d.toString()));

  proc.on("error", () => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (!res.headersSent) {
      res.status(500).json({ error: "yt-dlp no está instalado en el servidor" });
    }
  });

  proc.on("close", (code) => {
    const file = fs.existsSync(dir)
      ? fs.readdirSync(dir).find((f) => f.endsWith(".mp3"))
      : null;

    if (code !== 0 || !file) {
      fs.rmSync(dir, { recursive: true, force: true });
      if (!res.headersSent) {
        return res.status(500).json({
          error: "No se pudo convertir el video",
          detalle: stderr.slice(-300),
        });
      }
      return;
    }

    res.download(path.join(dir, file), file, () => {
      fs.rmSync(dir, { recursive: true, force: true });
    });
  });
});

app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
