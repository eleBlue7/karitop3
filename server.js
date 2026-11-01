import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(express.json());


const YT_REGEX = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i;

app.post("/api/youtube-to-mp3", (req, res) => {
  const { url } = req.body || {};

  if (!url || !YT_REGEX.test(url)) {
    return res.status(400).json({ error: "La URL de YouTube no es válida" });
  }

  const dir = path.join(os.tmpdir(), randomUUID());
  fs.mkdirSync(dir, { recursive: true });

  const args = [
    "-x",
    "--audio-format", "mp3",
    "--remote-components", "ejs:github",
    "--audio-quality", "0",
    "--no-playlist",
    "-o", path.join(dir, "%(title)s.%(ext)s"),
    url,
  ];

  const proc = spawn("yt-dlp", args);
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += d.toString()));

  proc.on("error", () => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (!res.headersSent) {
      res.status(500).json({ error: "yt-dlp no está instalado (brew install yt-dlp)" });
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
