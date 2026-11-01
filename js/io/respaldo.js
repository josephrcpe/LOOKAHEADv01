// Respaldo del proyecto en un archivo .json (copia física fuera de la nube o del navegador).
//  - Guardar respaldo: descarga el proyecto abierto completo.
//  - Restaurar respaldo: lee el archivo, muestra un resumen y lo carga como proyecto nuevo
//    o reemplaza el proyecto del que salió (mismo identificador), previa confirmación.
// Formato: { formato, version, exportado, pid, proyecto, colecciones: { tareas: [...], ... } }.

import { esc, fmtN, toIso, todayDay } from "../util.js";
import { state } from "../state.js";
import { writeFailed, nameTaken, datosProyecto, escribirProyecto, nuevoPid, RESPALDO_COLS } from "../data.js";
import { toast, openModal, closeModal, saveFile, pickFile } from "../ui.js";
import { fileBase } from "./excel-report.js";

const FORMATO = "lookahead-respaldo";
const VERSION = 1;
const ETIQ = { tareas: "actividades", lineasBase: "líneas base", planesSemanales: "planes semanales", registros: "registros", cortes: "cortes", restricciones: "restricciones" };

export async function guardarRespaldo() {
  if (!state.pid) return toast("Abre un proyecto primero.");
  const d = datosProyecto();
  const obj = { formato: FORMATO, version: VERSION, exportado: new Date().toISOString(), ...d };
  await saveFile(`Respaldo ${fileBase()} ${toIso(todayDay())}.json`, new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" }));
}

// Devuelve el respaldo validado o lanza un Error con un mensaje para el usuario.
function validar(obj) {
  if (!obj || obj.formato !== FORMATO) throw new Error("El archivo no es un respaldo de esta herramienta.");
  if (obj.version > VERSION) throw new Error("El respaldo es de una versión más nueva de la herramienta.");
  if (!obj.proyecto || typeof obj.proyecto !== "object" || !obj.colecciones) throw new Error("El respaldo está incompleto.");
  for (const c of RESPALDO_COLS) if (obj.colecciones[c] != null && !Array.isArray(obj.colecciones[c])) throw new Error(`La sección "${c}" del respaldo no es válida.`);
  return obj;
}

export async function restaurarRespaldo() {
  if (state.readOnly) return toast("Este lookahead es de solo lectura para ti.");
  const file = await pickFile(".json,application/json"); if (!file) return;
  let r;
  try { r = validar(JSON.parse(await file.text())); }
  catch (e) { toast(e instanceof SyntaxError ? "El archivo no es un JSON válido." : e.message, 5000); return; }
  const cols = r.colecciones; const nombre = r.proyecto.nombre || "Proyecto restaurado";
  const existe = state.projects.find((p) => p.pid === r.pid);
  const resumen = RESPALDO_COLS.map((c) => `<li>${fmtN((cols[c] || []).length)} ${ETIQ[c]}</li>`).join("");
  let sugerido = nombre; for (let i = 2; nameTaken(sugerido); i++) sugerido = `${nombre} (restaurado${i > 2 ? " " + (i - 1) : ""})`;

  openModal(`<h2 id="modalTitle">Restaurar respaldo</h2>
    <p class="help" style="margin:0"><strong>${esc(nombre)}</strong> · guardado el ${esc(new Date(r.exportado || 0).toLocaleString("es-PE"))}</p>
    <ul class="help" style="margin:4px 0 0">${resumen}</ul>
    <form id="rForm" novalidate>
      <fieldset class="radio-opts"><legend>Cómo cargarlo</legend>
        <label><input type="radio" name="modo" value="nuevo" checked> Como proyecto nuevo</label>
        <label><input type="radio" name="modo" value="reemplazar"${existe ? "" : " disabled"}> Reemplazar "${esc(existe ? existe.nombre : nombre)}"${existe ? "" : " (no existe aquí)"}</label>
      </fieldset>
      <div class="field" id="r-nameBox"><label for="r-name">Nombre del proyecto nuevo <span class="req">*</span></label><input id="r-name" maxlength="60" value="${esc(sugerido)}" autocomplete="off"></div>
      <div class="help" id="r-warn" hidden>Se borra el contenido actual de ese proyecto y se reemplaza por el del respaldo. No se puede deshacer; si dudas, guarda antes un respaldo del proyecto actual.</div>
      <div class="err" id="r-err"></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Restaurar</button></div>
    </form>`, (box) => {
    const modo = () => box.querySelector("input[name=modo]:checked").value;
    box.querySelectorAll("input[name=modo]").forEach((x) => x.addEventListener("change", () => { box.querySelector("#r-nameBox").hidden = modo() !== "nuevo"; box.querySelector("#r-warn").hidden = modo() === "nuevo"; }));
    box.querySelector("#rForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = box.querySelector("#r-err"); const btn = box.querySelector("button[type=submit]");
      const now = new Date().toISOString();
      let pid, proyecto;
      if (modo() === "nuevo") {
        const n = box.querySelector("#r-name").value.trim();
        if (!n) { err.textContent = "Escribe un nombre."; return; }
        if (nameTaken(n)) { err.textContent = "Ya existe un proyecto con ese nombre. Elige otro."; return; }
        pid = nuevoPid(n); proyecto = { ...r.proyecto, nombre: n, modificado: now, restauradoDe: nombre };
      } else { pid = r.pid; proyecto = { ...r.proyecto, modificado: now }; }
      btn.disabled = true; btn.textContent = "Restaurando…";
      try { await escribirProyecto(pid, proyecto, cols, modo() === "reemplazar"); closeModal(); toast(`Respaldo "${proyecto.nombre}" restaurado.`, 4000); }
      catch (ex) { btn.disabled = false; btn.textContent = "Restaurar"; writeFailed(ex); }
    });
  });
}
