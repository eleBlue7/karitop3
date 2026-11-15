import { useEffect, useRef, useState } from "react";
import "./App.css";

const API = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const STORAGE_KEY = "karitop3-active-job";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function remember(id) {
  try { id ? sessionStorage.setItem(STORAGE_KEY, id) : sessionStorage.removeItem(STORAGE_KEY); } catch { /* almacenamiento opcional */ }
}
function recover() { try { return sessionStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; } }
async function apiError(response) {
  const data = await response.json().catch(() => null);
  return data?.error || `El servidor respondió con error ${response.status}.`;
}
function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Componentes visuales independientes. Se pueden mover a src/components
// posteriormente sin cambiar el contrato de la API.
function Icon({ name = "note", className = "", ...props }) {
  const paths = {
    note: <><path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
    list: <><path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/></>,
    link: <><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/></>,
    heart: <path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1C-1 10 7 17 12 21c5-4 13-11 8-16Z"/>,
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>{paths[name] || paths.note}</svg>;
}
function Lantern({ className = "" }) {
  return <svg className={className} width="100" height="230" viewBox="0 0 100 230" fill="none" aria-hidden="true"><path d="M50 0v38" stroke="#bda16c"/><path d="M29 39h42v10H29z" fill="#ad392f"/><ellipse cx="50" cy="92" rx="43" ry="47" fill="#a52e29"/><ellipse cx="50" cy="92" rx="27" ry="47" stroke="#d6ac66" strokeOpacity=".65"/><path d="M7 92h86M50 45v94" stroke="#d6ac66" strokeOpacity=".5"/><path d="M29 136h42v9H29z" fill="#81251f"/><path d="M50 145v28m-6 0v37m6-37v45m6-45v37" stroke="#b77d3b" strokeWidth="3"/></svg>;
}
function Landscape() {
  return <svg viewBox="0 0 640 330" className="landscape" fill="none" aria-hidden="true"><circle cx="410" cy="102" r="69" fill="#ac382f"/><path d="m0 303 116-113 58 45 106-151 118 164 61-61 181 143H0Z" fill="#bab6a0" opacity=".5"/><path d="m0 330 188-146 85 86 105-107 134 107 128-49v109H0Z" fill="#72877a" opacity=".65"/><path d="m0 330 150-64 113 64 170-75 207 75H0Z" fill="#314e43"/><path d="M280 330c-60-25 160-27 88-66" stroke="#eee2c8" strokeWidth="9"/><path d="m500 153 17-6 17 6m-62-26 13-5 13 5" stroke="#333d34" strokeWidth="2"/></svg>;
}
function Header() {
  return <header className="site-header flex items-center justify-between gap-4"><a className="brand" href="#inicio" aria-label="Karitop3, inicio"><span className="brand-seal" aria-hidden="true">音</span><span>KARITOP3</span></a></header>;
}
function Hero() {
  return <section id="inicio" className="hero"><div className="hero-copy"><p className="eyebrow"><span/> UNA DEDICATORIA EN CADA CANCIÓN</p><h1>Hola, Jaz.<br/>Que suene <em>lo nuestro.</em></h1><p className="hero-description">Tu pequeño refugio de canciones favoritas. Un enlace, un temazo y otro motivo para pensar en ti.</p><div className="hero-signature"><Icon name="heart"/> De mi caos, para tus audífonos.</div></div><div className="hero-art"><Lantern className="lantern lantern-one"/><Lantern className="lantern lantern-two"/><div className="art-caption">MÚSICA PARA QUEDARSE UN RATITO</div><Landscape/><span className="art-seal" aria-hidden="true">愛</span></div></section>;
}
function Notice({ tone = "error", children }) {
  return <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}
function LoadingPanel({ count, starting }) {
  return <section className="loading-panel" role="status" aria-live="polite"><div className="loading-symbol" aria-hidden="true"><span className="spinner"/><Icon name="note"/></div><p className="eyebrow">EL SALÓN ESTÁ PREPARANDO TU MÚSICA</p><h3>espere xfi y no aprete nada o se chinga</h3><p>{starting ? "Conectando con el servidor… Si estaba dormido, dale un momento." : count ? `${count} canción(es) lista(s). La tanda sigue en marcha.` : "La vida es un carrusel… y esta canción ya viene en camino."}</p><small>No cierres ni recargues esta pestaña. No necesitas volver a enviar el enlace.</small></section>;
}
function ConverterForm({ mode, setMode, url, setUrl, busy, processing, onSubmit }) {
  return <section className="converter-card" aria-labelledby="converter-title"><div className="section-heading"><span className="section-number">01 / EL ENLACE</span><span className="small-seal" aria-hidden="true">樂</span></div><h2 id="converter-title">¿Qué vamos a escuchar?</h2><p className="muted">Trae una canción. O trae toda la obsesión.</p><form onSubmit={onSubmit}><fieldset disabled={busy}><legend className="sr-only">Tipo de descarga</legend><div className="mode-switch"><button type="button" aria-pressed={mode === "single"} onClick={() => setMode("single")}><Icon name="note"/>Una canción</button><button type="button" aria-pressed={mode === "playlist"} onClick={() => setMode("playlist")}><Icon name="list"/>Una playlist</button></div><label htmlFor="youtube-url">Pega la wea acá abajo jiji</label><div className="url-field"><Icon name="link"/><input id="youtube-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder={mode === "playlist" ? "https://www.youtube.com/playlist?list=…" : "https://www.youtube.com/watch?v=…"} autoComplete="off" spellCheck={false}/></div><p className="field-hint">{mode === "playlist" ? "Playlist pública o no listada. Copia el enlace completo con list=." : "Cada MP3 conserva el título y la carátula del video."}</p><button className="primary-button" type="submit">{processing ? "Preparando tu música…" : mode === "playlist" ? "Que venga la tanda" : "Dame ese temazo"}<Icon name="arrow"/></button></fieldset></form><div className="card-footnote"><span/> MP3 CON CARÁTULA <span/> SIN CAMBIAR EL NOMBRE</div></section>;
}
function GuideCard() {
  return <aside className="guide-card"><p className="eyebrow">EL RITUAL ES SENCILLO</p><h2>Tres pasos.<br/>Cero ceremonias.</h2><ol>{[["01", "Encuentra tu canción", "Copia el enlace de YouTube o de tu playlist."], ["02", "Déjame hacer lo mío", "Pégalo aquí. Espera un poquito y no invoques al botón dos veces."], ["03", "Llévatela contigo", "Descarga tus MP3 desde la lista, uno a uno o de una tanda."]].map(([n, title, text]) => <li key={n}><span>{n}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol><div className="guide-note"><Icon name="heart"/><p>Advertencia: puede causar ganas de dedicar canciones a las 2 a. m.</p></div></aside>;
}
function SongList({ files, processing, downloading, downloadingId, all, progress, onOne, onAll, expiresAt }) {
  return <section className="results-card" aria-labelledby="results-title"><div className="results-heading"><div><p className="section-number">02 / TU COLECCIÓN</p><h2 id="results-title">El botín musical</h2><p className="muted">{files.length} canción(es) lista(s) para acompañarte.</p></div><button className="secondary-button" disabled={processing || downloading} onClick={onAll}><Icon name="download"/>{all ? "Enviando…" : "Descargar todas"}</button></div>{progress && <Notice tone="info">{progress}</Notice>}<ul className="song-list">{files.map((file, i) => <li key={file.id}><span className="track-number">{String(i + 1).padStart(2, "0")}</span><div className="track-art" aria-hidden="true"><Icon name="note"/></div><div className="track-info"><h3>{file.title}</h3><p>MP3 <span>·</span> {(file.size / 1048576).toFixed(1)} MB</p></div><button className="track-download" disabled={downloading} onClick={() => onOne(file)} aria-label={`Descargar ${file.title}`}><Icon name="download"/><span>{downloadingId === file.id ? "Bajando…" : "Descargar"}</span></button></li>)}</ul><p className="results-help">Sin ZIP: cada MP3 se guarda por separado. En el celular, permite las descargas múltiples; si el navegador las bloquea, usa los botones individuales.</p>{expiresAt && <p className="expiry">Archivos disponibles hasta aproximadamente las {new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Un reinicio del servidor puede eliminarlos antes.</p>}</section>;
}

// La lógica conserva los endpoints del server.js de tandas:
// POST /api/jobs, GET /api/jobs/:id y GET /api/jobs/:id/files/:fileId.
function useMusicJobs() {
  const [jobId, setJobId] = useState(recover);
  const [job, setJob] = useState(null);
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
  const busy = processing || downloading;

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false, timer, controller;
    async function poll() {
      controller = new AbortController();
      try {
        const response = await fetch(`${API}/api/jobs/${encodeURIComponent(jobId)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) {
          const message = await apiError(response);
          if (response.status === 404) {
            if (!cancelled) { setError(message); setJob(null); setJobId(""); remember(""); setWarning(""); }
            return;
          }
          throw new Error(message);
        }
        const data = await response.json();
        if (cancelled) return;
        setJob(data); setWarning("");
        if (data.status !== "processing") return;
      } catch (err) {
        if (cancelled || err.name === "AbortError") return;
        setWarning("Se perdió un momento la conexión. Intento reconectar; no vuelvas a enviar el enlace.");
      }
      if (!cancelled) timer = setTimeout(poll, 2500);
    }
    poll();
    return () => { cancelled = true; clearTimeout(timer); controller?.abort(); };
  }, [jobId]);

  useEffect(() => {
    if (!busy) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function start(url, mode) {
    if (busy) return false;
    setError(""); setSuccess(""); setWarning(""); setStarting(true);
    try {
      const response = await fetch(`${API}/api/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: url.trim(), mode }) });
      if (!response.ok) throw new Error(await apiError(response));
      const data = await response.json();
      setJob(data); setJobId(data.id); remember(data.id);
      return true;
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "No pude conectar con el servidor. Revisa tu conexión y que Render esté disponible." : err.message);
      return false;
    } finally { setStarting(false); }
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
    lock.current = true; setDownloadingId(file.id); setError(""); setSuccess("");
    try { await fetchFile(file); setSuccess(`Le pedí al navegador guardar «${file.filename}». Revisa Descargas.`); }
    catch (err) { setError(err.message); }
    finally { setDownloadingId(""); lock.current = false; }
  }
  async function downloadAll() {
    if (lock.current || processing || !job?.files?.length) return;
    lock.current = true; setAll(true); setError(""); setSuccess("");
    let requested = 0, failed = 0;
    try {
      for (let i = 0; i < job.files.length; i++) {
        setProgress(`Enviando ${i + 1} de ${job.files.length}: ${job.files[i].title}`);
        try { await fetchFile(job.files[i]); requested++; } catch { failed++; }
        await sleep(1000);
      }
      setSuccess(`Solicité guardar ${requested} archivo(s). Comprueba las descargas y los permisos del navegador.`);
      if (failed) setError(`${failed} archivo(s) fallaron. Prueba con sus botones individuales.`);
    } finally { setAll(false); setProgress(""); lock.current = false; }
  }
  return { job, starting, processing, downloading, busy, error, warning, success, downloadingId, all, progress, start, downloadOne, downloadAll };
}

export default function App() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState("single");
  const music = useMusicJobs();
  async function submit(event) {
    event.preventDefault();
    if (await music.start(url, mode)) setUrl("");
  }
  return <div className="karito-app"><div className="page-shell mx-auto"><Header/><main id="inicio"><div className="workspace grid gap-6 lg:grid-cols-2"><div className="min-w-0"><ConverterForm mode={mode} setMode={setMode} url={url} setUrl={setUrl} busy={music.busy} processing={music.processing} onSubmit={submit}/>{music.processing && <LoadingPanel starting={music.starting} count={music.job?.files?.length || 0}/>}</div></div><div className="feedback-stack">{music.warning && <Notice tone="info">{music.warning}</Notice>}{(music.error || music.job?.error) && <Notice>{music.error || music.job.error}</Notice>}{music.success && <Notice tone="success">{music.success}</Notice>}</div>{Boolean(music.job?.files?.length) && <SongList files={music.job.files} processing={music.processing} downloading={music.downloading} downloadingId={music.downloadingId} all={music.all} progress={music.progress} onOne={music.downloadOne} onAll={music.downloadAll} expiresAt={music.job.expiresAt}/>}</main><footer className="site-footer"><span>KARITOP3 <span className="footer-star">✦</span></span></footer><aside className="creator-credit" aria-label="Hecho por el ele"><span>Hecho por el ele <span aria-hidden="true">→</span></span><img src={`${import.meta.env.BASE_URL}gifs/ele.gif`} alt="" width="64" height="64" /></aside></div></div>;
}
