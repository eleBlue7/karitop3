import { useState } from "react";
import "./App.css";
import { useMusicJobs } from "./hooks/useMusicJobs";
import DraggableWindow from "./components/DraggableWindow";
import ConverterCard from "./components/ConverterCard";
import SongList from "./components/SongList";
import Notice from "./components/Notice";
import CreatorCredit from "./components/CreatorCredit";

// Pantalla principal: una ventana XP con pestañas tipo navegador.
export default function App() {
  const [tab, setTab] = useState("link");
  const [url, setUrl] = useState("");
  const music = useMusicJobs();
  const count = music.job?.files?.length || 0;

  const tabs = [
    { id: "link", label: "01 · Enlace" },
    { id: "list", label: `02 · Colección (${count})`, disabled: count === 0 },
  ];

  async function submit(event) {
    event.preventDefault();
    const link = url.trim();
    const hasCurrent = Boolean(music.job) || music.processing;
    if (hasCurrent && !window.confirm("Se borrará lo que está ahora en pantalla. ¿Continuar?")) return;
    music.reset();
    setTab("link");
    if (await music.start(link)) setUrl("");
  }

  return (
    <div className="karito-app">
      <div className="page-shell mx-auto">
        <header className="site-header">
          <a className="brand" href="#inicio" aria-label="Karitop3, inicio">
            <span className="brand-seal" aria-hidden="true">音</span>
            <span>KARITOP3</span>
          </a>
        </header>

        <main id="inicio">
          <DraggableWindow title="Karitop3 · Descargador" tabs={tabs} activeTab={tab} onTab={setTab}>
            {tab === "link" || count === 0 ? (
              <ConverterCard
                url={url}
                setUrl={setUrl}
                onSubmit={submit}
                processing={music.processing}
                starting={music.starting}
                kind={music.kind}
                count={count}
                onCancel={music.cancel}
              />
            ) : (
              <SongList
                files={music.job.files}
                processing={music.processing}
                downloading={music.downloading}
                downloadingId={music.downloadingId}
                all={music.all}
                progress={music.progress}
                onOne={music.downloadOne}
                onAll={music.downloadAll}
                expiresAt={music.job.expiresAt}
              />
            )}

            <div className="feedback-stack">
              {music.warning && <Notice tone="info">{music.warning}</Notice>}
              {(music.error || music.job?.error) && <Notice>{music.error || music.job.error}</Notice>}
              {music.job?.status === "cancelled" && (
                <Notice tone="info">
                  Tanda cancelada. Estas son las canciones que alcanzaron a guardarse. Puedes pegar otro enlace.
                </Notice>
              )}
              {music.success && <Notice tone="success">{music.success}</Notice>}
            </div>
          </DraggableWindow>
        </main>

        <footer className="site-footer">
          <span>KARITOP3 <span className="footer-star">✦</span></span>
        </footer>

        <CreatorCredit />
      </div>
    </div>
  );
}
