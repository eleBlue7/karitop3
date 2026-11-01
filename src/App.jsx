import { useEffect, useRef, useState } from "react";

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const STORAGE_KEY = "karitop3-active-job";

function saveBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

function formatSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readStoredJob() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function storeJob(id) {
  try {
    if (id) {
      sessionStorage.setItem(STORAGE_KEY, id);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // La app sigue funcionando si el navegador bloquea sessionStorage.
  }
}

async function readApiError(response) {
  const data = await response.json().catch(() => null);

  return (
    data?.error ||
    `El servidor respondió con error ${response.status}.`
  );
}

const delay = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState("single");

  const [jobId, setJobId] = useState(readStoredJob);
  const [job, setJob] = useState(null);

  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [connectionWarning, setConnectionWarning] = useState("");
  const [success, setSuccess] = useState("");

  const [downloadingId, setDownloadingId] = useState("");
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");

  // Evita iniciar dos descargas desde clics muy rápidos.
  const downloadLock = useRef(false);

  const processing =
    starting ||
    Boolean(jobId && !job) ||
    job?.status === "processing";

  const downloading = Boolean(downloadingId) || downloadingAll;
  const busy = processing || downloading;

  const files = job?.files || [];

  // Consulta el estado cada dos segundos.
  // También recupera la tanda si se recarga la página en la misma pestaña.
  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let timer;
    let controller;

    const poll = async () => {
      controller = new AbortController();

      try {
        const response = await fetch(
          `${API_URL}/api/jobs/${encodeURIComponent(jobId)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        );

        if (!response.ok) {
          const message = await readApiError(response);

          if (response.status === 404) {
            if (!cancelled) {
              setError(message);
              setJob(null);
              setJobId("");
              storeJob("");
            }
            return;
          }

          throw new Error(message);
        }

        const data = await response.json();

        if (cancelled) return;

        setJob(data);
        setConnectionWarning("");

        if (data.status !== "processing") {
          return;
        }
      } catch (err) {
        if (cancelled || err.name === "AbortError") return;

        setConnectionWarning(
          "Se perdió un momento la conexión. Estoy intentando reconectar; no hace falta volver a enviar el enlace."
        );
      }

      if (!cancelled) {
        timer = setTimeout(poll, 2000);
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [jobId]);

  // Es una advertencia: algunos navegadores móviles pueden ignorarla.
  useEffect(() => {
    if (!busy) return;

    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeLeaving);

    return () => {
      window.removeEventListener(
        "beforeunload",
        warnBeforeLeaving
      );
    };
  }, [busy]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (busy) return;

    setError("");
    setSuccess("");
    setConnectionWarning("");

    if (!url.trim()) {
      setError("lo pusiste malxd, falta el enlace 🙈");
      return;
    }

    setStarting(true);

    try {
      const response = await fetch(`${API_URL}/api/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: url.trim(),
          mode,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const data = await response.json();

      setJob(data);
      setJobId(data.id);
      storeJob(data.id);
      setUrl("");
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "No pude conectar con el servidor. Revisa tu conexión o espera a que Render despierte."
          : err.message
      );
    } finally {
      setStarting(false);
    }
  };

  const fetchAndSave = async (file) => {
    const response = await fetch(
      `${API_URL}${file.downloadPath}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error("El archivo llegó vacío.");
    }

    // El nombre viene de la lista del servidor.
    // No depende de leer Content-Disposition.
    saveBlob(blob, file.filename);
  };

  const downloadOne = async (file) => {
    if (downloadLock.current) return;

    downloadLock.current = true;

    setDownloadingId(file.id);
    setError("");
    setSuccess("");

    try {
      await fetchAndSave(file);

      setSuccess(
        `Le pedí al navegador guardar «${file.filename}» 🎶`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingId("");
      downloadLock.current = false;
    }
  };

  const downloadAll = async () => {
    if (
      downloadLock.current ||
      processing ||
      files.length === 0
    ) {
      return;
    }

    downloadLock.current = true;

    setDownloadingAll(true);
    setError("");
    setSuccess("");

    const failed = [];
    let requested = 0;

    try {
      // Secuencial: no carga todos los MP3 a la vez en memoria.
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];

        setDownloadProgress(
          `Enviando ${index + 1} de ${files.length}: ${file.title}`
        );

        try {
          await fetchAndSave(file);
          requested += 1;
        } catch {
          failed.push(file.filename);
        }

        await delay(1000);
      }

      setSuccess(
        `Solicité guardar ${requested} archivo(s). Revisa las descargas del navegador 🎶`
      );

      if (failed.length) {
        setError(
          `No pude descargar ${failed.length} archivo(s). Prueba sus botones individuales.`
        );
      }
    } finally {
      setDownloadProgress("");
      setDownloadingAll(false);
      downloadLock.current = false;
    }
  };

  const startAnother = () => {
    if (busy) return;

    setJob(null);
    setJobId("");
    setError("");
    setSuccess("");
    setConnectionWarning("");
    storeJob("");
  };

  const inputClass =
    "w-full rounded-2xl border-4 border-dashed border-pink-300 bg-pink-50 px-4 py-3 text-fuchsia-900 placeholder-pink-400 transition focus:border-solid focus:border-cyan-400 focus:bg-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-fuchsia-400 via-pink-400 to-orange-300 px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <span className="absolute -left-10 -top-10 h-48 w-48 rounded-full bg-yellow-300/60 blur-2xl motion-safe:animate-pulse" />
        <span className="absolute -right-16 top-1/3 h-64 w-64 rounded-full bg-cyan-300/50 blur-3xl motion-safe:animate-pulse" />
        <span className="absolute -bottom-16 left-1/4 h-56 w-56 rounded-full bg-lime-300/50 blur-3xl motion-safe:animate-pulse" />
      </div>

      <div className="relative w-full max-w-2xl">
        <header className="mb-8 text-center">
          <div
            aria-hidden="true"
            className="inline-block text-7xl motion-safe:animate-bounce"
          >
            🦩
          </div>

          <h1 className="mt-3 -rotate-2 text-5xl font-black text-white drop-shadow-[0_4px_0_rgba(190,24,93,1)] sm:text-6xl">
            Hola Jaz
          </h1>

          <p className="mt-4 inline-block rotate-1 rounded-full bg-white px-5 py-2 text-sm font-bold text-fuchsia-600 shadow-md">
            Karitop3  
          </p>
        </header>

        <main className="rounded-[2rem] bg-white p-5 shadow-2xl ring-4 ring-yellow-300 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <fieldset disabled={busy} className="space-y-5">
              <legend className="mb-3 text-lg font-extrabold text-fuchsia-600">
                communista 
              </legend>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  aria-pressed={mode === "single"}
                  onClick={() => setMode("single")}
                  className={`rounded-2xl border-2 px-3 py-3 font-black transition disabled:cursor-not-allowed ${
                    mode === "single"
                      ? "border-fuchsia-600 bg-fuchsia-600 text-white shadow-md"
                      : "border-pink-200 bg-pink-50 text-fuchsia-600 hover:bg-pink-100"
                  }`}
                >
                  Una canción 
                </button>

                <button
                  type="button"
                  aria-pressed={mode === "playlist"}
                  onClick={() => setMode("playlist")}
                  className={`rounded-2xl border-2 px-3 py-3 font-black transition disabled:cursor-not-allowed ${
                    mode === "playlist"
                      ? "border-fuchsia-600 bg-fuchsia-600 text-white shadow-md"
                      : "border-pink-200 bg-pink-50 text-fuchsia-600 hover:bg-pink-100"
                  }`}
                >
                  Playlist 📚
                </button>
              </div>

              <div>
                <label
                  htmlFor="youtube-url"
                  className="mb-2 block text-lg font-extrabold text-fuchsia-600"
                >
                  Pega la wea acá abajo jiji
                </label>

                <input
                  id="youtube-url"
                  type="url"
                  required
                  value={url}
                  onChange={(event) =>
                    setUrl(event.target.value)
                  }
                  placeholder={
                    mode === "playlist"
                      ? "https://www.youtube.com/playlist?list=..."
                      : "https://www.youtube.com/watch?v=..."
                  }
                  className={inputClass}
                />

                <p className="mt-2 text-xs font-semibold text-pink-500">
                  {mode === "playlist"
                    ? "Pega una playlist pública o no listada. Cada canción conserva su nombre."
                    : "El MP3 conserva el título del video y su miniatura como carátula."}
                </p>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 px-4 py-4 text-lg font-black text-white shadow-[0_6px_0_rgb(194,65,12)] transition-all hover:translate-y-0.5 hover:shadow-[0_4px_0_rgb(194,65,12)] active:translate-y-1.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {processing
                  ? "Trabajando... 🛠️"
                  : mode === "playlist"
                    ? "descargar"
                    : "descargar 2"}
              </button>
            </fieldset>
          </form>

          {processing && (
            <section
              role="status"
              aria-live="polite"
              className="mt-7 rounded-2xl border-4 border-yellow-400 bg-yellow-100 p-5 text-center shadow-lg"
            >
              <div
                aria-hidden="true"
                className="mb-3 text-5xl motion-safe:animate-bounce"
              >
                🚧
              </div>

              <p className="text-2xl font-black uppercase leading-tight text-fuchsia-700 sm:text-3xl">
                espere xfi y no aprete nada o se chinga
              </p>

              <p className="mt-3 text-sm font-semibold text-fuchsia-600">
                la vida es un carrusel...
              </p>

              <p className="mt-2 text-sm font-bold text-fuchsia-800">
                {job?.files?.length
                  ? `${job.files.length} canción(es) lista(s). Sigo con las demás 🎶`
                  : "Preparando. NO CIERREEEES LIKE SI CREES EN DIOS."}
              </p>

              <p className="mt-3 text-xs text-fuchsia-700">
                Las playlists grandes pueden tardar bastante.
              </p>
            </section>
          )}

          {connectionWarning && (
            <div
              role="status"
              className="mt-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900"
            >
              📡 {connectionWarning}
            </div>
          )}

          {(error || job?.error) && (
            <div
              role="alert"
              className="mt-5 rounded-2xl border-2 border-red-300 bg-red-100 p-4 text-sm font-semibold text-red-700"
            >
              😵 {error || job.error}
            </div>
          )}

          {success && (
            <div
              role="status"
              className="mt-5 rounded-2xl border-2 border-emerald-300 bg-emerald-100 p-4 text-sm font-semibold text-emerald-800"
            >
              {success}
            </div>
          )}

          {files.length > 0 && (
            <section className="mt-8">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-black text-fuchsia-700">
                  
                </h2>

                <span className="rounded-full bg-pink-100 px-3 py-1 text-xs font-bold text-fuchsia-700">
                  {files.length} lista(s)
                </span>
              </div>

              <button
                type="button"
                onClick={downloadAll}
                disabled={processing || downloading}
                className="mb-3 w-full rounded-2xl bg-cyan-500 px-4 py-3 font-black text-white shadow-md transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {downloadingAll
                  ? "descargando la musikita... "
                  : processing
                    ? "nose"
                    : "like y suscribiros"}
              </button>

            

              {downloadProgress && (
                <p
                  role="status"
                  className="mb-4 break-words rounded-xl bg-cyan-50 p-3 text-sm font-semibold text-cyan-800"
                >
                  {downloadProgress}
                </p>
              )}

              <ul className="space-y-3">
                {files.map((file, index) => (
                  <li
                    key={file.id}
                    className="flex flex-col gap-3 rounded-2xl border-2 border-pink-100 bg-pink-50 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-black text-fuchsia-600 shadow-sm"
                      >
                        {index + 1}
                      </span>

                      <div className="min-w-0">
                        <p className="break-words text-sm font-extrabold text-fuchsia-900">
                          {file.title}
                        </p>

                        <p className="mt-1 text-xs font-semibold text-pink-500">
                          MP3 · {formatSize(file.size)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => downloadOne(file)}
                      disabled={downloading}
                      className="shrink-0 rounded-xl bg-fuchsia-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {downloadingId === file.id
                        ? "descargandooooo... "
                        : "Descargar"}
                    </button>
                  </li>
                ))}
              </ul>

             
            </section>
          )}

          {job && !processing && (
            <button
              type="button"
              onClick={startAnother}
              disabled={downloading}
              className="mt-6 w-full rounded-2xl border-2 border-dashed border-fuchsia-300 px-4 py-3 font-bold text-fuchsia-600 transition hover:bg-fuchsia-50 disabled:opacity-50"
            >
              P
            </button>
          )}
        </main>

        <footer className="mt-7 text-center text-xs font-semibold text-white drop-shadow">
          ola 💗 
        </footer>
      </div>
    </div>
  );
}
