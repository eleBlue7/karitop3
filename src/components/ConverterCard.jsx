import Icon from "./Icon";
import StatusLine from "./StatusLine";
import { isPlaylistUrl } from "../lib/utils";

// Pestaña 01 · Enlace: el campo y la franja de procesamiento con Cancelar.
export default function ConverterCard({
  url, setUrl, onSubmit, processing, starting, kind, count, onCancel,
}) {
  const detected = isPlaylistUrl(url) ? "playlist" : "single";

  return (
    <div className="link-panel">
      

      <form onSubmit={onSubmit}>
        <label htmlFor="youtube-url">Pega la wea acá abajo jiji</label>
        <div className="url-field">
          <Icon name="link" />
          <input
            id="youtube-url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…  o  …/playlist?list=…"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <p className="field-hint">
          {url.trim()
            ? detected === "playlist"
              ? "Se detectó una playlist entera."
              : "Se detectó solo una canción buuuu fome metele maaaaas."
            : "Canción o playlist, tú pega el enlace."}
        </p>
        <button className="primary-button" type="submit">
          {processing ? "Cambiar por este enlace" : "Cargar esta canción"}
          <Icon name="arrow" />
        </button>
      </form>

      {processing && (
        <StatusLine starting={starting} kind={kind} count={count} onCancel={onCancel} />
      )}
    </div>
  );
}
