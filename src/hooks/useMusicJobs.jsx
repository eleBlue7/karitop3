import { useState, useRef, useEffect } from "react";
import { API, POLL_MS } from "../lib/config";
import { apiError, isPlaylistUrl, save, sleep } from "../lib/utils";
import { remember, recover } from "../lib/storage";

// Lógica de tandas.
// Endpoints: POST /api/jobs, GET /api/jobs/:id,
// POST /api/jobs/:id/cancel, GET /api/jobs/:id/files/:fileId
export function useMusicJobs() {
  const [jobId, setJobId] = useState(recover);
  const [job, setJob] = useState(null);
  const [kind, setKind] = useState("single");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [success, setSuccess] = useState("");
  const [downloadingId, setDownloadingId] = useState("");
  const [all, setAll] = useState(false);
  const [progress, setProgress] = useState("");
  const lock = useRef(false);

  const processing = starting || Boolean(jobId && !job) || job?.status === "processing";
  const downloading = Boolean(downloadingId) || all;

  // Consulta el estado hasta que la tanda deja de estar en "processing".
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer;
    let controller;

    async function poll() {
      controller = new AbortController();
      try {
        const response = await fetch(`${API}/api/jobs/${encodeURIComponent(jobId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          const message = await apiError(response);
          if (response.status === 404) {
            if (!cancelled) {
              setError(message);
              setJob(null);
              setJobId("");
              remember("");
              setWarning("");
            }
            return;
          }
          throw new Error(message);
        }
        const data = await response.json();
        if (cancelled) return;
        setJob(data);
        setWarning("");
        if (data.status !== "processing") return;
      } catch (err) {
        if (cancelled || err.name === "AbortError") return;
        setWarning("Se perdió un momento la conexión. Reintento; no vuelvas a enviar el enlace.");
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [jobId]);

  // Avisa antes de cerrar la pestaña mientras hay una tanda en curso.
  useEffect(() => {
    if (!processing) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [processing]);

  async function start(link) {
    const mode = isPlaylistUrl(link) ? "playlist" : "single";
    setError("");
    setSuccess("");
    setWarning("");
    setStarting(true);
    setKind(mode);
    try {
      const response = await fetch(`${API}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: link.trim(), mode }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const data = await response.json();
      setJob(data);
      setJobId(data.id);
      remember(data.id);
      return true;
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "No pude conectar con el servidor. Revisa que la Mac y el túnel estén activos."
          : err.message
      );
      return false;
    } finally {
      setStarting(false);
    }
  }

  // Cancela la tanda; lo ya convertido se queda disponible.
  async function cancel() {
    if (!job || job.status !== "processing") return;
    setWarning("");
    try {
      const response = await fetch(`${API}/api/jobs/${encodeURIComponent(job.id)}/cancel`, {
        method: "POST",
      });
      if (response.status === 404) {
        // El servidor se reinició: la tanda ya no existe, se limpia la pantalla.
        setJob(null);
        setJobId("");
        remember("");
        setError("Esta tanda ya no existe en el servidor.");
        return;
      }
      if (!response.ok) throw new Error(await apiError(response));
      const data = await response.json();
      setJob(data); // status "cancelled": la pantalla deja de mostrar la carga
    } catch {
      setWarning("No pude enviar la cancelación. Intenta de nuevo.");
    }
  }

  // Borra lo que está en pantalla (si hay una tanda activa, se cancela en el servidor).
  function reset() {
    if (job?.status === "processing" && jobId) {
      fetch(`${API}/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" }).catch(() => {});
    }
    setJob(null);
    setJobId("");
    remember("");
    setKind("single");
    setError("");
    setWarning("");
    setSuccess("");
  }

  async function fetchFile(file) {
    const response = await fetch(`${API}${file.downloadPath}`, { cache: "no-store" });
    if (!response.ok) throw new Error(await apiError(response));
    const blob = await response.blob();
    if (!blob.size) throw new Error("El archivo llegó vacío.");
    save(blob, file.filename);
  }

  async function downloadOne(file) {
    if (lock.current) return;
    lock.current = true;
    setDownloadingId(file.id);
    setError("");
    setSuccess("");
    try {
      await fetchFile(file);
      setSuccess(`Le pedí al navegador guardar «${file.filename}». Revisa Descargas.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingId("");
      lock.current = false;
    }
  }

  async function downloadAll() {
    if (lock.current || processing || !job?.files?.length) return;
    lock.current = true;
    setAll(true);
    setError("");
    setSuccess("");
    let requested = 0;
    let failed = 0;
    try {
      for (let i = 0; i < job.files.length; i++) {
        setProgress(`Enviando ${i + 1} de ${job.files.length}: ${job.files[i].title}`);
        try {
          await fetchFile(job.files[i]);
          requested++;
        } catch {
          failed++;
        }
        await sleep(1000);
      }
      setSuccess(`Solicité guardar ${requested} archivo(s). Revisa las descargas del navegador.`);
      if (failed) setError(`${failed} archivo(s) fallaron. Prueba con sus botones individuales.`);
    } finally {
      setAll(false);
      setProgress("");
      lock.current = false;
    }
  }

  return {
    job, kind, starting, processing, downloading,
    error, warning, success, downloadingId, all, progress,
    start, cancel, reset, downloadOne, downloadAll,
  };
}