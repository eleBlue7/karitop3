export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Detecta si el enlace es de una playlist (tiene list=).
export const isPlaylistUrl = (value) => /[?&]list=/.test(value);

// Lee el mensaje de error que manda el servidor en JSON.
export async function apiError(response) {
  const data = await response.json().catch(() => null);
  return data?.error || `El servidor respondió con error ${response.status}.`;
}

// Dispara la descarga de un blob en el navegador.
export function save(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}