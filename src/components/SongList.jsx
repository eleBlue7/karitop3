import Icon from "./Icon";
import Notice from "./Notice";
import { EXPIRY_HINT } from "../lib/config";

// Pestaña 02 · Colección: lista de MP3 con scroll interno.
export default function SongList({
  files, processing, downloading, downloadingId, all, progress, onOne, onAll, expiresAt,
}) {
  return (
    <section className="results-card" aria-labelledby="results-title">
      <div className="results-heading">
        <div>
          <p className="section-number">2 / TU COLECCIÓN</p>
          <h2 id="results-title">Lista de canciones</h2>
          <p className="muted">{files.length} canción(es) lista(s) wooooo.</p>
        </div>
        <button className="secondary-button" disabled={processing || downloading} onClick={onAll}>
          <Icon name="download" />
          {all ? "Enviando…" : "Descargar todas"}
        </button>
      </div>

      {progress && <Notice tone="info">{progress}</Notice>}

      <ul className="song-list song-list-scroll">
        {files.map((file, i) => (
          <li key={file.id}>
            <span className="track-number">
  {file.position !== Number.MAX_SAFE_INTEGER ? String(file.position).padStart(2, "0") : "--"}
</span>

            <div className="track-art" aria-hidden="true"><Icon name="note" /></div>
            <div className="track-info">
              <h3>{file.title}</h3>
              <p>MP3 <span>·</span> {(file.size / 1048576).toFixed(1)} MB</p>
            </div>
            <button
              className="track-download"
              disabled={downloading}
              onClick={() => onOne(file)}
              aria-label={`Descargar ${file.title}`}
            >
              <Icon name="download" />
              <span>{downloadingId === file.id ? "Bajando…" : "Descargar"}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="results-help">
        Cada MP3 se guarda por separado. En el celular, permite las descargas múltiples si el navegador lo pide.
      </p>
      {expiresAt && (
        <p className="expiry">
          Archivos disponibles hasta aproximadamente las{" "}
          {new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
        </p>
      )}
    </section>
  );
}