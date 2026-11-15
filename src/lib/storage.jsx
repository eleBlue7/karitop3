import { STORAGE_KEY } from "./config";

// Guarda o borra el id de la tanda activa en sessionStorage.
export function remember(id) {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* opcional */ }
}

// Recupera el id de la tanda activa (si se recargó la página).
export function recover() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}