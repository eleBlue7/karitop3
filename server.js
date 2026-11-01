import express from "express";
import cors from "cors";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const app = express();

const PORT = process.env.PORT || 4000;
const FILE_TTL_MS = 60 * 60 * 1000;
const JOB_TIMEOUT_MS = 45 * 60 * 1000;

// Los trabajos se guardan en memoria.
// Si Render reinicia el servidor, estos trabajos dejan de estar disponibles.
const jobs = new Map();

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "*",
    exposedHeaders: ["Content-Disposition"],
  })
);

app.use(express.json({ limit: "8kb" }));

app.get("/", (_req, res) => {
  res.json({ ok: true, message: "Karitop3 funcionando 🎶" });
});

function removeJob(job) {
  fs.rmSync(job.dir, { recursive: true, force: true });
  jobs.delete(job.id);
}

// Elimina archivos vencidos, pero no mientras se están enviando.
const cleanupTimer = setInterval(() => {
  const now = Date.now();

  for (const job of jobs.values()) {
    if (
      job.finishedAt &&
      now - job.finishedAt > FILE_TTL_MS &&
      job.activeDownloads === 0
    ) {
      removeJob(job);
    }
  }
}, 60_000);

cleanupTimer.unref();

function publicJob(job) {
  return {
    id: job.id,
    mode: job.mode,
    status: job.status,
    message: job.message,
    error: job.error,
    expiresAt: job.finishedAt
      ? new Date(job.finishedAt + FILE_TTL_MS).toISOString()
      : null,
    files: job.files.map(({ id, title, filename, size }) => ({
      id,
      title,
      filename,
      size,
      downloadPath: `/api/jobs/${job.id}/files/${id}`,
    })),
  };
}

// Solo acepta enlaces de YouTube y construye una URL canónica.
// No envía una URL arbitraria al descargador.
function normalizeYoutubeUrl(value, mode) {
  if (typeof value !== "string" || value.length > 4096) {
    throw new Error("Pega un enlace válido de YouTube.");
  }

  let parsed;

  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("El enlace debe empezar con https://");
  }

  if (
    !["https:", "http:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw new Error("El enlace de YouTube no es válido.");
  }

  const host = parsed.hostname.toLowerCase();

  const allowedHosts = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
  ]);

  if (!allowedHosts.has(host)) {
    throw new Error("Solo se aceptan enlaces de YouTube.");
  }

  if (mode === "playlist") {
    const list = parsed.searchParams.get("list");

    if (!list || !/^[a-zA-Z0-9_-]{2,200}$/.test(list)) {
      throw new Error(
        "Ese enlace no incluye una playlist. Copia su enlace completo."
      );
    }

    return `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`;
  }

  let videoId = parsed.searchParams.get("v");

  if (host === "youtu.be") {
    videoId = parsed.pathname.split("/").filter(Boolean)[0];
  } else {
    const parts = parsed.pathname.split("/").filter(Boolean);

    if (["shorts", "live", "embed"].includes(parts[0])) {
      videoId = parts[1];
    }
  }

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new Error(
      "No encontré un video en ese enlace. Prueba copiándolo desde Compartir."
    );
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
}

function startJob(job, youtubeUrl) {
  let cookiesPath = null;

  try {
    // Cada trabajo recibe su propia copia para evitar que dos procesos
    // escriban en el mismo archivo de cookies.
    if (process.env.COOKIES_FILE) {
      if (!fs.existsSync(process.env.COOKIES_FILE)) {
        throw new Error(
          "COOKIES_FILE está configurada, pero el archivo no existe."
        );
      }

      cookiesPath = path.join(job.dir, "cookies.txt");

      fs.copyFileSync(process.env.COOKIES_FILE, cookiesPath);
      fs.chmodSync(cookiesPath, 0o600);
    }
  } catch (error) {
    console.error("No se pudieron preparar las cookies:", error.message);

    job.status = "failed";
    job.error =
      "El servidor no pudo leer el archivo de cookies. Revisa COOKIES_FILE.";
    job.finishedAt = Date.now();
    return;
  }

  const outputTemplate =
    job.mode === "playlist"
      ? "%(playlist_index)03d - %(title).150B.%(ext)s"
      : "%(title).150B.%(ext)s";

  const args = [
    "--ignore-config",
    "--no-progress",
    "--no-colors",

    "-f",
    "bestaudio/best",

    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",

    "--embed-metadata",
    "--embed-thumbnail",
    "--convert-thumbnails",
    "jpg",

    // Recorte centrado y carátula cuadrada.
    "--postprocessor-args",
    `ThumbnailsConvertor+ffmpeg_o:-vf "crop='min(iw,ih)':'min(iw,ih)',scale=600:600,setsar=1"`,

    "--remote-components",
    "ejs:github",

    "--socket-timeout",
    "30",
    "--retries",
    "3",
    "--fragment-retries",
    "3",

    "-o",
    path.join(job.dir, outputTemplate),

    // Solo anuncia el archivo después de terminar los postprocesadores.
    "--print",
    "after_move:__KARITOP3__%(filepath)j",
  ];

  if (job.mode === "playlist") {
    args.push("--yes-playlist", "--ignore-errors");
  } else {
    args.push("--no-playlist");
  }

  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  args.push("--", youtubeUrl);

  job.status = "processing";
  job.message = "Preparando la música...";

  const proc = spawn("yt-dlp", args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  let processError = false;
  let timedOut = false;
  let settled = false;
  let killTimer = null;

  // Evita que el proceso quede trabajando indefinidamente.
  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGTERM");

    killTimer = setTimeout(() => {
      proc.kill("SIGKILL");
    }, 5000);

    killTimer.unref();
  }, JOB_TIMEOUT_MS);

  timeout.unref();

  const output = readline.createInterface({
    input: proc.stdout,
    crlfDelay: Infinity,
  });

  output.on("line", (line) => {
    const marker = "__KARITOP3__";
    const position = line.indexOf(marker);

    if (position === -1) return;

    try {
      const filePath = JSON.parse(
        line.slice(position + marker.length).trim()
      );

      if (typeof filePath !== "string") return;

      const absolutePath = path.resolve(filePath);

      // Solo publica MP3 que estén dentro de la carpeta de este trabajo.
      if (
        path.dirname(absolutePath) !== path.resolve(job.dir) ||
        path.extname(absolutePath).toLowerCase() !== ".mp3" ||
        !fs.existsSync(absolutePath)
      ) {
        return;
      }

      if (job.files.some((file) => file.path === absolutePath)) {
        return;
      }

      const filename = path.basename(absolutePath);
      const stats = fs.statSync(absolutePath);

      job.files.push({
        id: randomUUID(),
        path: absolutePath,
        filename,
        title: filename.replace(/\.mp3$/i, ""),
        size: stats.size,
      });

      job.message = `${job.files.length} canción(es) lista(s).`;
    } catch {
      // Ignora líneas de salida que no sean un archivo anunciado válido.
    }
  });

  proc.stderr.on("data", (chunk) => {
    // Guarda un fragmento limitado para el diagnóstico del servidor.
    stderr = (stderr + chunk.toString()).slice(-12_000);
  });

  proc.on("error", (error) => {
    processError = true;
    console.error("No se pudo iniciar yt-dlp:", error.message);
  });

  proc.on("close", (code) => {
    if (settled) return;
    settled = true;

    clearTimeout(timeout);
    if (killTimer) clearTimeout(killTimer);
    output.close();

    // Ya no necesitamos la copia local de las cookies.
    if (cookiesPath) {
      fs.rmSync(cookiesPath, { force: true });
    }

    job.finishedAt = Date.now();

    if (processError) {
      job.status = "failed";
      job.error =
        "No se pudo iniciar yt-dlp. Revisa su instalación en el servidor.";
    } else if (timedOut) {
      job.status = job.files.length ? "partial" : "failed";
      job.error =
        "Se alcanzó el tiempo máximo de procesamiento. Puedes descargar las canciones que sí quedaron listas.";
    } else if (code !== 0 || /(^|\n)ERROR:/m.test(stderr)) {
      job.status = job.files.length ? "partial" : "failed";
      job.error = job.files.length
        ? "Algunas canciones fallaron o no están disponibles. Las demás sí se pueden descargar."
        : "No se pudo convertir. Puede ser un bloqueo de YouTube, una sesión vencida o un video no disponible.";
    } else if (job.files.length === 0) {
      job.status = "failed";
      job.error = "No se encontraron canciones disponibles para descargar.";
    } else {
      job.status = "completed";
      job.message = "¡Tu música está lista!";
    }

    if (job.status !== "completed" && stderr) {
      console.error(`[Trabajo ${job.id}]\n${stderr}`);
    }
  });
}

// Crea un trabajo y responde inmediatamente con su identificador.
app.post("/api/jobs", (req, res) => {
  const { url, mode = "single" } = req.body || {};

  if (!["single", "playlist"].includes(mode)) {
    return res.status(400).json({ error: "Modo no válido." });
  }

  let youtubeUrl;

  try {
    youtubeUrl = normalizeYoutubeUrl(url, mode);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  // Una tanda a la vez para no saturar el servidor.
  const busy = [...jobs.values()].some(
    (job) => job.status === "processing"
  );

  if (busy) {
    return res.status(429).json({
      error:
        "El servidor ya está preparando otra tanda. Espera a que termine e inténtalo de nuevo.",
    });
  }

  const id = randomUUID();
  const dir = path.join(os.tmpdir(), `karitop3-${id}`);

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    return res.status(500).json({
      error: "No se pudo crear la carpeta temporal.",
    });
  }

  const job = {
    id,
    dir,
    mode,
    status: "processing",
    message: "Iniciando...",
    error: "",
    files: [],
    finishedAt: null,
    activeDownloads: 0,
  };

  jobs.set(id, job);
  startJob(job, youtubeUrl);

  res.status(202).json(publicJob(job));
});

// Consulta el progreso y la lista de canciones disponibles.
app.get("/api/jobs/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      error:
        "Esta tanda ya no está disponible. Puede haber vencido o el servidor se reinició.",
    });
  }

  res.setHeader("Cache-Control", "no-store");
  res.json(publicJob(job));
});

// Descarga un MP3 concreto.
app.get("/api/jobs/:jobId/files/:fileId", (req, res) => {
  const job = jobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      error: "La tanda venció o el servidor se reinició.",
    });
  }

  const file = job.files.find(
    (item) => item.id === req.params.fileId
  );

  if (!file || !fs.existsSync(file.path)) {
    return res.status(404).json({
      error: "El archivo ya no está disponible.",
    });
  }

  job.activeDownloads += 1;

  let released = false;

  const release = () => {
    if (released) return;
    released = true;
    job.activeDownloads -= 1;
  };

  res.once("close", release);
  res.setHeader("Cache-Control", "no-store");

  res.download(file.path, file.filename, (error) => {
    release();

    if (error && !res.headersSent && !res.destroyed) {
      res.status(500).json({
        error: "No se pudo enviar el archivo.",
      });
    }
  });
});

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});
