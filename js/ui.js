// Piezas de interfaz compartidas: aviso flotante (toast), ventana modal y descarga de archivos.

import { $ } from "./util.js";

let toastTimer = null;
export function toast(msg, ms = 3200) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
}

// La modal recibe HTML y un callback onMount(box) para conectar eventos.
export function openModal(html, onMount, wide) {
  $("modalBox").innerHTML = html; $("modalBox").classList.toggle("wide", !!wide); $("modal").hidden = false;
  onMount && onMount($("modalBox"));
  const first = $("modalBox").querySelector("input, select, button.btn-primary"); first && first.focus();
}
export function closeModal() { $("modal").hidden = true; $("modalBox").innerHTML = ""; }
export function initModal() {
  $("modal").addEventListener("click", (e) => { if (e.target === $("modal") || e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("modal").hidden) closeModal(); });
}

// Descarga: usa la capacidad "downloads" de la página publicada; fuera de ella, un enlace temporal.
export async function saveFile(fname, blob) {
  let dl = null;
  try { dl = window.claude && typeof window.claude.use === "function" ? await window.claude.use("downloads") : null; } catch (e) { dl = null; }
  if (dl) {
    try { await dl.save({ filename: fname, data: blob }); toast("Archivo listo."); }
    catch (e) { if (e && e.code !== "declined") toast("No se pudo descargar el archivo (" + (e.code || "error") + ")."); }
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: fname });
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Archivo descargado.");
}

// Pide un archivo al usuario y devuelve un File (o null si cancela).
export function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = Object.assign(document.createElement("input"), { type: "file", accept });
    inp.addEventListener("change", () => resolve(inp.files[0] || null));
    inp.click();
  });
}
