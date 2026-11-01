import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "";

const FRASES = [
  "la vida es un carrusel...",
];

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

export default function App() {
  const [url, setUrl] = useState("");
  const [nombre, setNombre] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [frase, setFrase] = useState(FRASES[0]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!url.trim()) {
      setError("lo pusiste malxd");
      return;
    }

    setLoading(true);
    setFrase(FRASES[Math.floor(Math.random() * FRASES.length)]);
    try {
      const res = await fetch(`${API_URL}/api/youtube-to-mp3`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), nombre: nombre.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          [data.error, data.detalle].filter(Boolean).join(" — ") ||
            `Error ${res.status} del servidor 🤖💥`
        );
      }

      const filename = getFilename(res.headers.get("Content-Disposition") || "");
      const blob = await res.blob();
      saveBlob(blob, filename);
      setSuccess("LISTOOOSIIISEXOOO");
      setUrl("");
      setNombre("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-fuchsia-400 via-pink-400 to-orange-300 flex items-center justify-center p-4">
      {/* Burbujas decorativas */}
      <span className="absolute -top-10 -left-10 h-48 w-48 rounded-full bg-yellow-300/60 blur-2xl animate-pulse" />
      <span className="absolute top-1/3 -right-16 h-64 w-64 rounded-full bg-cyan-300/50 blur-3xl animate-pulse" />
      <span className="absolute -bottom-16 left-1/4 h-56 w-56 rounded-full bg-lime-300/50 blur-3xl animate-pulse" />

      <div className="relative w-full max-w-xl">
        <header className="text-center mb-6">
          <div className="inline-block text-7xl animate-bounce">🦩</div>
          <h1 className="mt-3 text-5xl sm:text-6xl font-black text-white drop-shadow-[0_4px_0_rgba(190,24,93,1)] -rotate-2">
            Hola Jaz
          </h1>
          <p className="mt-3 inline-block rotate-1 rounded-full bg-white px-4 py-1 text-sm font-bold text-fuchsia-600 shadow-md">
            Karitop3
          </p>
        </header>

        <main className="rounded-[2rem] bg-white p-6 sm:p-8 shadow-2xl ring-4 ring-yellow-300 -rotate-1">
          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block text-lg font-extrabold text-fuchsia-600">
              Pega la wea acá abajo jiji
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full rounded-2xl border-4 border-dashed border-pink-300 bg-pink-50 px-4 py-3 text-fuchsia-900 placeholder-pink-300 focus:border-solid focus:border-cyan-400 focus:bg-white focus:outline-none transition"
            />
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre para la canción (opcional) 🎵"
              className="w-full rounded-2xl border-4 border-dashed border-pink-300 bg-pink-50 px-4 py-3 text-fuchsia-900 placeholder-pink-300 focus:border-solid focus:border-cyan-400 focus:bg-white focus:outline-none transition"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-yellow-400 to-orange-500 py-4 text-lg font-black text-white shadow-[0_6px_0_rgb(194,65,12)] hover:translate-y-0.5 hover:shadow-[0_4px_0_rgb(194,65,12)] active:translate-y-1.5 active:shadow-none disabled:opacity-60 disabled:cursor-not-allowed transition-all"
            >
              {loading ? "Trabajando... " : "aaaaaaahhhhhh"} 🎶
            </button>
          </form>

          {loading && (
            <p className="mt-4 text-center text-sm font-semibold text-fuchsia-500 animate-pulse">
              {frase}
            </p>
          )}

          {error && (
            <div className="mt-5 rotate-1 rounded-2xl border-2 border-red-300 bg-red-100 p-3 text-sm font-semibold text-red-700">
              😵 {error}
            </div>
          )}
          {success && (
            <div className="mt-5 -rotate-1 rounded-2xl border-2 border-emerald-300 bg-emerald-100 p-3 text-sm font-semibold text-emerald-800">
              {success}
            </div>
          )}
        </main>

        <footer className="mt-6 text-center text-xs font-semibold text-white drop-shadow">
          ola
        </footer>
      </div>
    </div>
  );
}
