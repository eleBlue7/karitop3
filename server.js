// server.js — Backend de Karitop3 para correr en tu Mac
// Requisitos:  brew install yt-dlp ffmpeg cloudflared
//              npm i express   (y en package.json: "type": "module")
// Uso:         COOKIES_BROWSER=chrome ALLOWED_ORIGIN=http://localhost:5173 node server.js

import express from "express";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const PORT = Number(process.env.PORT || 3001);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const COOKIES_BROWSER = process.env.COOKIES_BROWSER || "chrome";
const COOKIES_FILE = process.env.COOKIES_FILE || "";
const TTL_MS = 2 * 60 * 60 * 1000; // los archivos viven 2 horas
const ROOT = path.join(os.tmpdir(), "karitop3");
const jobs = new Map();
const procs = new Map(); // id de tanda -> proceso yt-dlp

const app = express();
app.use(express.json({ limit: "10kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function isYouTube(value) {
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^(www|m)\./, "");
    return u.protocol === "https:" && ["youtube.com", "youtu.be", "music.youtube.com"].includes(host);
  } catch {
    return false;
  }
}

function safeName(text) {
  return (String(text).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)) || "cancion";
}

function runYtDlp(args, cwd, jobId) {
  return new Promise((resolve) => {
    const p = spawn("yt-dlp", args, { cwd, detached: true });
    procs.set(jobId, p);
    let err = "";
    p.stdout.on("data", () => {});
    p.stderr.on("data", (d) => { err = (err + d).slice(-8000); });
    p.on("error", (e) => { procs.delete(jobId); resolve({ code: -1, err: e.message }); });
    p.on("close", (code) => { procs.delete(jobId); resolve({ code, err }); });
  });
}

async function listFiles(job, dir) {
  const titles = new Map();
  try {
    const meta = await fsp.readFile(path.join(dir, "meta.txt"), "utf8");
    for (const line of meta.split("\n")) {
      const [id, ...rest] = line.split("\t");
      if (id && rest.length) titles.set(id.trim(), rest.join("\t").trim());
    }
  } catch { /* sin metadatos, usamos el id */ }

  const names = (await fsp.readdir(dir)).filter((n) => n.endsWith(".mp3"));
  const out = [];
  for (const diskName of names) {
    const id = diskName.slice(0, -4);
    const stat = await fsp.stat(path.join(dir, diskName));
    const title = titles.get(id) || id;
    if (!job.ids.has(diskName)) job.ids.set(diskName, randomUUID());
    const fileId = job.ids.get(diskName);
    out.push({
      id: fileId,
      diskName,
      title,
      filename: `${safeName(title)}.mp3`,
      size: stat.size,
      downloadPath: `/api/jobs/${job.id}/files/${fileId}`,
    });
  }
  return out;
}

async function processJob(job, url, mode) {
  const dir = path.join(ROOT, job.id);
  await fsp.mkdir(dir, { recursive: true });

  const cookieArgs = COOKIES_FILE
    ? ["--cookies", COOKIES_FILE]
    : ["--cookies-from-browser", COOKIES_BROWSER];

  const args = [
    ...cookieArgs,
    mode === "playlist" ? "--yes-playlist" : "--no-playlist",
    "-x", "--audio-format", "mp3", "--audio-quality", "0",
    "--embed-metadata",
    "--embed-thumbnail", "--convert-thumbnails", "jpg",
    "--ppa", "ThumbnailsConvertor+ffmpeg_o:-vf crop=ih:ih,scale=600:600",
    "--ignore-errors",
    "--no-overwrites",
    "--print-to-file", "%(id)s\t%(title)s", "meta.txt",
    "-o", "%(id)s.%(ext)s",
    "--", url,
  ];

  // Publica las canciones terminadas mientras yt-dlp sigue (tamaño estable entre revisiones).
  const sizes = new Map();
  const refresh = async (onlyStable) => {
    const found = await listFiles(job, dir);
    job.files = onlyStable
      ? found.filter((f) => {
          const stable = sizes.get(f.diskName) === f.size && f.size > 0;
          sizes.set(f.diskName, f.size);
          return stable;
        })
      : found;
  };
  let scanning = false;
  const timer = setInterval(async () => {
    if (scanning) return;
    scanning = true;
    try { await refresh(true); } catch { /* reintenta luego */ }
    finally { scanning = false; }
  }, 3000);

  const { err } = await runYtDlp(args, dir, job.id);
  clearInterval(timer);
  if (job.cancelled) {
    // Cancelada: se conserva lo ya convertido.
    job.status = "cancelled";
  }
  await refresh(false);

  if (job.cancelled) {
    job.status = "cancelled";
  } else if (job.files.length) {
    job.status = "done";
  } else {
    job.status = "error";
    job.error = /sign in|confirm you|cookies|authentication/i.test(err)
      ? "YouTube pidió verificación. Revisa que el navegador de la Mac tenga sesión iniciada en YouTube."
      : "No pude convertir ese enlace. Revisa que sea público y vuelve a intentarlo.";
  }
  job.expiresAt = Date.now() + TTL_MS;
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/jobs", (req, res) => {
  const url = String(req.body?.url || "").trim();
  const mode = req.body?.mode === "playlist" ? "playlist" : "single";
  if (!isYouTube(url)) {
    return res.status(400).json({ error: "Pega un enlace válido de YouTube (https://www.youtube.com/...)." });
  }
  if (mode === "playlist" && !/[?&]list=/.test(url)) {
    return res.status(400).json({ error: "Ese enlace no parece ser de una playlist (falta list=)." });
  }

  const job = { id: randomUUID(), status: "processing", cancelled: false, files: [], ids: new Map(), error: "", expiresAt: null };
  jobs.set(job.id, job);
  processJob(job, url, mode).catch((e) => {
    job.status = "error";
    job.error = e.message;
  });
  res.status(202).json(publicJob(job));
});

// Cancela la tanda: detiene yt-dlp y conserva las canciones ya listas.
app.post("/api/jobs/:id/cancel", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Esta tanda ya no existe." });
  if (job.status === "processing") {
    job.cancelled = true;
    job.status = "cancelled";
    const p = procs.get(job.id);
    if (p?.pid) {
      // Mata el grupo completo (yt-dlp + ffmpeg).
      try { process.kill(-p.pid, "SIGKILL"); } catch { try { p.kill("SIGKILL"); } catch { /* ya terminó */ } }
    }
    procs.delete(job.id);
  }
  res.json(publicJob(job));
});

function publicJob(job) {
  const { ids, cancelled, ...rest } = job;
  return rest;
}

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Esta tanda ya no existe. Vuelve a enviar el enlace." });
  res.json(publicJob(job));
});

app.get("/api/jobs/:id/files/:fileId", (req, res) => {
  const job = jobs.get(req.params.id);
  const file = job?.files.find((f) => f.id === req.params.fileId);
  if (!file) return res.status(404).json({ error: "Archivo no encontrado. Puede que ya haya expirado." });
  res.download(path.join(ROOT, job.id, file.diskName), file.filename, (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: "No pude leer el archivo." });
  });
});

// Limpieza: borra tandas vencidas cada 10 minutos
setInterval(async () => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.expiresAt && job.expiresAt < now) {
      jobs.delete(id);
      await fsp.rm(path.join(ROOT, id), { recursive: true, force: true });
    }
  }
}, 10 * 60 * 1000).unref();

app.listen(PORT, () => {
  console.log(`Karitop3 backend en http://localhost:${PORT}`);
  console.log(`Cookies desde: ${COOKIES_FILE || COOKIES_BROWSER}`);
});
