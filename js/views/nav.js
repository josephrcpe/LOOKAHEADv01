// Pestañas principales. Cada vista es una <section id="view-{nombre}">; la URL guarda la pestaña (#gantt).

import { $ } from "../util.js";
import { state } from "../state.js";

export const VIEWS = ["entrada", "gantt", "ejecucion", "asbuilt", "indicadores"];

export function showView(v) {
  if (!VIEWS.includes(v)) v = "entrada";
  for (const t of document.querySelectorAll(".tab")) t.setAttribute("aria-selected", String(t.dataset.view === v));
  for (const k of VIEWS) $("view-" + k).hidden = k !== v || !state.pid;
}
export const currentView = () => document.querySelector('.tab[aria-selected="true"]')?.dataset.view || "entrada";
export function goTo(v) { location.hash = v; showView(v); }

export function initNav(onChange) {
  for (const t of document.querySelectorAll(".tab")) t.addEventListener("click", () => { goTo(t.dataset.view); onChange(); });
  window.addEventListener("hashchange", () => { showView(location.hash.slice(1)); onChange(); });
  showView(location.hash.slice(1));
}
