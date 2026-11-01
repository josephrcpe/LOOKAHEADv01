// Punto de entrada. Conecta las vistas, registra el render general y abre la base de datos.
// Flujo: data.js recibe cambios de la base → actualiza `state` → requestRender() → renderAll() pinta la cabecera
// y solo la pestaña visible (las demás se pintan al abrirlas).

import { $, fmt } from "./util.js";
import { state, startDay, inHorizon, on } from "./state.js";
import { connect } from "./data.js";
import { initModal, toast } from "./ui.js";
import { initNav, showView, currentView } from "./views/nav.js";
import { initProyectos, applyCfg } from "./views/proyectos.js";
import { initEntrada, renderEntrada, resetForm, fillDatalists } from "./views/entrada.js";
import { initGantt, renderGantt } from "./views/gantt.js";
import { initEjecucion, renderEjecucion } from "./views/ejecucion.js";
import { initAsBuilt, renderAsBuilt } from "./views/asbuilt.js";
import { initIndicadores, renderIndicadores } from "./views/indicadores.js";
import { exportExcel } from "./io/excel-report.js";
import { exportData } from "./io/csv-export.js";

const RENDER = { entrada: renderEntrada, gantt: renderGantt, ejecucion: renderEjecucion, asbuilt: renderAsBuilt, indicadores: renderIndicadores };

function renderStatus() {
  const txt = state.mode === "db" ? (state.readOnly ? "Guardado en la nube · solo lectura" : "Guardado en la nube") : state.mode === "local" ? "Guardado en este navegador" : "Conectando…";
  $("status").innerHTML = `<span class="dot ${state.mode === "db" ? "ok" : state.mode === "local" ? "local" : ""}"></span><span>${txt}</span>`;
}

// Repintado agrupado: varias suscripciones pueden disparar en el mismo instante.
let queued = false;
function renderAll() {
  if (queued) return; queued = true;
  queueMicrotask(() => { queued = false; renderNow(); });
}
function renderNow() {
  renderStatus();
  const has = !!state.pid;
  $("noProject").hidden = has || !state.projectsLoaded;
  showView(currentView());
  const always = [$("exportBtn"), $("exportData"), $("btnBackup")];
  for (const el of [$("projName"), $("startDate"), $("prevWeek"), $("nextWeek"), $("thisWeek"), $("workWeek"), $("hoursDay"), $("btnSaveAs"), ...always])
    el.disabled = !has || (state.readOnly && !always.includes(el));
  $("btnNew").disabled = state.readOnly || state.mode === "connecting";
  $("btnOpen").disabled = state.mode === "connecting";
  if (!has) { $("projName").value = state.projectsLoaded ? "Sin proyecto abierto" : "Cargando…"; return; }
  const h0 = startDay();
  $("horizonRange").textContent = `${fmt(h0)} – ${fmt(h0 + 20, true)}`;
  $("countAll").textContent = state.acts.length ? String(state.acts.length) : "";
  const n = state.acts.filter(inHorizon).length;
  $("countHorizon").textContent = n ? String(n) : "";
  const nr = state.restr.filter((r) => r.estado !== "Liberada").length;
  $("countRestr").textContent = nr ? `${nr} restr.` : "";
  RENDER[currentView()]();
}

function bindExport(id, fn, busyText) {
  $(id).addEventListener("click", async () => {
    if (!state.pid) return toast("Abre un proyecto primero.");
    const b = $(id); const label = b.textContent; b.disabled = true; if (busyText) b.textContent = busyText;
    try { await fn(); } catch (e) { console.error(e); toast("No se pudo generar el archivo."); }
    finally { b.disabled = false; b.textContent = label; }
  });
}

initModal();
initProyectos(); initEntrada(); initGantt(); initEjecucion(); initAsBuilt(); initIndicadores();
initNav(renderAll);
bindExport("exportBtn", exportExcel, "Generando…");
bindExport("exportData", exportData);
on("render", renderAll);
on("project", () => { applyCfg(); fillDatalists(); });
on("acts", fillDatalists);
on("opened", () => { applyCfg(); resetForm(); });
renderAll();
connect();
