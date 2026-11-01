import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "";

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getFilename(disposition) {
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const simple = disposition.match(/filename="?([^";]+)"?/i);
  return simple ? simple[1] : "audio.mp3";
}

// Franja de greca escalonada (motivo azteca)
function Greca({ color = "#d97706" }) {
  return (
    <svg className="w-full h-4" aria-hidden="true">
      <defs>
        <pattern id={`greca-${color.slice(1)}`} width="32" height="16" patternUnits="userSpaceOnUse">
          <path
            d="M0 15 H4 V11 H8 V7 H12 V3 H16 V7 H20 V11 H24 V15 H32"
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
        </pattern>
      </defs>
      <rect width="100%" height="16" fill={`url(#greca-${color.slice(1)})`} />
    </svg>
  );
}

// Sol azteca sencillo
function SolAzteca() {
  return (
    <svg viewBox="0 0 100 100" className="w-24 h-24 mx-auto animate-[spin_30s_linear_infinite]" aria-hidden="true">
      <g fill="#d97706">
        {Array.from({ length: 16 }).map((_, i) => (
          <polygon key={i} points="50,2 56,18 44,18" transform={`rotate(${i * 22.5} 50 50)`} />
        ))}
      </g>
      <circle cx="50" cy="50" r="28" fill="#b45309" />
      <circle cx="50" cy="50" r="20" fill="#fde68a" />
      <circle cx="50" cy="50" r="8" fill="#9a3412" />
    </svg>
  );
}

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!url.trim()) {
      setError("Pega un enlace de YouTube primero 💕");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/youtube-to-mp3`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Algo salió mal");
      }

      const filename = getFilename(res.headers.get("Content-Disposition") || "");
      const blob = await res.blob();
      saveBlob(blob, filename);
      setSuccess("¡Listo! Tu canción ya está descargada 🎶");
      setUrl("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-[#fef3c7]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(154,52,18,0.12) 1px, transparent 0)",
        backgroundSize: "24px 24px",
      }}
    >
      <div className="w-full max-w-xl">
        <header className="text-center mb-6">
          <SolAzteca />
          <h1
            className="mt-3 text-4xl sm:text-5xl font-extrabold text-[#9a3412] tracking-widest uppercase"
            style={{ fontFamily: "Georgia, serif" }}
          >
            Para Jazmín
          </h1>
          <p className="mt-2 text-[#0f766e] italic font-semibold">
            Cada canción que amamos, ahora tuya para siempre 🎧
          </p>
        </header>

        <main className="bg-[#fffbeb] rounded-2xl shadow-2xl border-4 border-[#b45309] overflow-hidden">
          <div className="bg-[#0f766e]">
            <Greca color="#fde68a" />
          </div>

          <div className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block text-sm font-bold text-[#7c2d12] uppercase tracking-wide">
                Enlace del video de YouTube
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-4 py-3 rounded-lg border-2 border-[#d97706] bg-white text-[#451a03] placeholder-[#a16207]/60 focus:border-[#0f766e] focus:outline-none focus:ring-4 focus:ring-[#99f6e4] transition"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg font-extrabold text-[#fffbeb] uppercase tracking-wider bg-gradient-to-r from-[#9a3412] via-[#b45309] to-[#0f766e] hover:brightness-110 shadow-lg border-2 border-[#fde68a] disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {loading ? "Convirtiendo tu música... ⏳" : "Convertir y descargar 💕"}
              </button>
            </form>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border-2 border-red-300">
                ❌ {error}
              </div>
            )}
            {success && (
              <div className="mt-4 p-3 rounded-lg bg-emerald-50 text-emerald-800 text-sm border-2 border-emerald-300">
                {success}
              </div>
            )}
          </div>

          <div className="bg-[#9a3412]">
            <Greca color="#fde68a" />
          </div>
        </main>

        <footer className="text-center text-xs text-[#9a3412] mt-6">
          Hecho con amor 💗 Usa esta página solo con contenido que tengas derecho a descargar.
        </footer>
      </div>
    </div>
  );
}
