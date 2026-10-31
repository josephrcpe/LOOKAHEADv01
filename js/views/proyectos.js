// Cabecera: proyecto (Nuevo, Guardar como…, Abrir, renombrar) y horizonte del lookahead (inicio, jornada, h/día).

import { $, esc, num, toDay, toIso, todayDay, mondayOf, fmt, fmtIso } from "../util.js";
import { state, P, horasDia, startDay } from "../state.js";
import { requirePid, writeFailed, saveProj, createProject, copyProject, openProject, nameTaken } from "../data.js";
import { toast, openModal, closeModal } from "../ui.js";

function nameDialog({ title, text, value, button, onOk }) {
  openModal(`<h2 id="modalTitle">${esc(title)}</h2><p class="help" style="margin:0">${esc(text)}</p>
    <form id="mForm" novalidate><div class="field"><label for="m-name">Nombre del proyecto <span class="req">*</span></label>
    <input id="m-name" maxlength="60" value="${esc(value || "")}" autocomplete="off"><div class="err" id="m-err"></div></div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">${esc(button)}</button></div></form>`, (box) => {
    box.querySelector("#mForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const n = box.querySelector("#m-name").value.trim(); const err = box.querySelector("#m-err");
      if (!n) { err.textContent = "Escribe un nombre."; return; }
      if (nameTaken(n)) { err.textContent = "Ya existe un proyecto con ese nombre. Elige otro."; return; }
      const btn = box.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Guardando…";
      try { await onOk(n); closeModal(); } catch (ex) { btn.disabled = false; btn.textContent = button; writeFailed(ex); }
    });
  });
  $("m-name")?.select();
}
export function newProject() {
  if (state.readOnly) return toast("Este lookahead es de solo lectura para ti.");
  nameDialog({ title: "Nuevo proyecto", text: "Se crea un proyecto vacío. El proyecto actual queda guardado y puedes volver a él con Abrir.", value: "", button: "Crear proyecto",
    onOk: async (n) => { await createProject(n); toast(`Proyecto "${n}" creado.`); } });
}
function saveAsProject() {
  if (!requirePid()) return;
  nameDialog({ title: "Guardar como…", text: "Crea una copia completa del proyecto actual (actividades, líneas base, planes semanales, registros, cortes y restricciones) con otro nombre, y la abre.", value: P().nombre + " (copia)", button: "Guardar copia",
    onOk: async (n) => { await copyProject(n); toast(`Guardado como "${n}".`); } });
}
export function openDialog() {
  const list = state.projects;
  openModal(`<h2 id="modalTitle">Abrir proyecto</h2>
    ${list.length ? `<div class="proj-list">${list.map((p) => `<div class="proj-item${p.pid === state.pid ? " current" : ""}"><div><div class="nm">${esc(p.nombre || p.pid)}</div><div class="help">Horizonte desde ${esc(fmtIso(p.inicio))}${p.modificado ? " · modificado " + esc(fmt(toDay(p.modificado.slice(0, 10)), true)) : ""}</div></div>${p.pid === state.pid ? '<span class="pill info">Abierto</span>' : `<button class="btn btn-sm btn-primary" data-pid="${esc(p.pid)}">Abrir</button>`}</div>`).join("")}</div>` : '<p class="help">Todavía no hay proyectos guardados.</p>'}
    <div class="modal-actions"><button class="btn" data-close>Cerrar</button></div>`, (box) => {
    box.addEventListener("click", (e) => { const b = e.target.closest("[data-pid]"); if (b) { openProject(b.dataset.pid); closeModal(); toast(`Proyecto "${P().nombre}" abierto.`); } });
  });
}

export function applyCfg() {
  $("projName").value = P().nombre || "";
  $("startDate").value = toIso(startDay());
  $("workWeek").value = P().jornada || "7";
  $("hoursDay").value = horasDia();
}
const setStart = (day) => { if (requirePid()) saveProj({ inicio: toIso(day) }).catch(writeFailed); };

export function initProyectos() {
  $("btnNew").addEventListener("click", newProject);
  $("btnSaveAs").addEventListener("click", saveAsProject);
  $("btnOpen").addEventListener("click", openDialog);
  $("noProject").addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b) (b.dataset.act === "new" ? newProject : openDialog)(); });
  $("startDate").addEventListener("change", (e) => { const d = toDay(e.target.value); if (!isNaN(d)) setStart(d); });
  $("prevWeek").addEventListener("click", () => setStart(startDay() - 7));
  $("nextWeek").addEventListener("click", () => setStart(startDay() + 7));
  $("thisWeek").addEventListener("click", () => setStart(mondayOf(todayDay())));
  $("workWeek").addEventListener("change", (e) => { if (requirePid()) saveProj({ jornada: e.target.value }).catch(writeFailed); });
  $("hoursDay").addEventListener("change", (e) => { const h = num(e.target.value); if (h > 0 && h <= 24 && requirePid()) saveProj({ horasDia: h }).catch(writeFailed); else applyCfg(); });
  $("projName").addEventListener("change", (e) => {
    const n = e.target.value.trim();
    if (!n || (n.toLowerCase() !== (P().nombre || "").toLowerCase() && nameTaken(n))) { toast(n ? "Ya existe un proyecto con ese nombre." : "El nombre no puede quedar vacío."); applyCfg(); return; }
    if (requirePid()) saveProj({ nombre: n }).catch(writeFailed);
  });
}
