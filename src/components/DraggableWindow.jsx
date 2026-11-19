import { useRef, useState } from "react";

// Ventana tipo navegador XP: barra azul, pestañas y contenido.
// Todo el bloque se mueve junto al arrastrar la barra azul.
export default function DraggableWindow({ title, tabs, activeTab, onTab, children }) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  function onPointerDown(e) {
    if (e.target.closest("button, input, a")) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!drag.current) return;
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
  }

  function onPointerUp() {
    drag.current = null;
  }

  return (
    <section className="xp-window" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
      <div
        className="xp-titlebar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="xp-title">{title}</span>
        <span className="small-seal" aria-hidden="true">X</span>
      </div>

      {tabs && (
        <div className="browser-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className="browser-tab"
              aria-selected={activeTab === t.id}
              disabled={t.disabled}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="window-body">{children}</div>
    </section>
  );
}
