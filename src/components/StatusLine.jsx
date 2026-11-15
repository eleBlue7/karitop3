// Estado de carga dentro de la misma ventana.
export default function StatusLine({ starting, kind, count, onCancel }) {
  const isPlaylist = kind === "playlist";
  const title = starting
    ? "Conectando con el servidor…"
    : isPlaylist
      ? "Procesando la playlist…"
      : "Preparando las canciones…";

  return (
    <div className="status-line" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div className="status-text">
        <strong>{title}</strong>
        <span>
          {count
            ? `${count} canción(es) lista(s) hasta ahora.`
            : "Jaz deja que se cargue nomás o se chinga"}
        </span>
      </div>
      {isPlaylist && !starting && (
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancelar
        </button>
      )}
    </div>
  );
}