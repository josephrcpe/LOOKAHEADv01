// Pestaña "Ejecución": ciclo semanal.
//   1. Congelar el plan de la semana (compromisos con metrado comprometido) → base del PAC.
//   2. Exportar el Excel de campo y recibirlo actualizado al corte (ver io/excel-campo.js).
//   3. Revisar o corregir registros uno por uno con el formulario semanal.
// Los registros nunca sobrescriben el programa: se guardan aparte en registros/{uid}_{lunes}.

import { CATS, CAUSAS, RTIPOS, FUENTES, EQUIPOS, WHO_KEY, name } from "../config.js";
import { $, esc, num, fmtN, fmtPct, toDay, toIso, todayDay, fmt, fmtIso, opts, lsGet, lsSet, reducedMotion } from "../util.js";
import { state, horasDia, workDaysIn, hhPlan, byUid, regOf, regHH, regLostHH, metradoPrev, openRestr, planOf, compOf, corteOf, exWeek, weekActs, avanceFrom, on } from "../state.js";
import { requirePid, writeFailed, saveReg, savePlan, deletePlan, addRestr, freeRestr } from "../data.js";
import { compromisoDe, cumplidaAuto, validarEntrada, construirRegistro } from "../model/registro.js";
import { toast, openModal, closeModal } from "../ui.js";
import { exportCampo, importCampo } from "../io/excel-campo.js";

const yn = (v) => (v === "Sí" ? '<span class="pill ok">Sí</span>' : v === "No" ? '<span class="pill bad">No</span>' : '<span class="sub">—</span>');
const unitDec = (u) => (["pza", "und", "perno"].includes(u) ? 0 : 2);

// ---------- Plan semanal ----------
// Metrado sugerido = metrado pendiente × (días laborables de la semana / días laborables que le quedan).
function sugerido(a, w) {
  const pend = Math.max(0, num(a.metrado) - metradoPrev(a.uid, toIso(w)));
  const dWeek = workDaysIn(a, w, w + 6), dLeft = workDaysIn(a, w, Infinity);
  if (!pend || !dWeek || !dLeft) return pend && dWeek ? pend : 0;
  const v = pend * Math.min(1, dWeek / dLeft); const k = 10 ** unitDec(a.unidad);
  return Math.round(v * k) / k;
}
function planDialog(w) {
  if (!requirePid()) return;
  const list = weekActs(w).filter((a) => !(state.regs.some((r) => r.uid === a.uid && r.finReal && r.semana < toIso(w))));
  if (!list.length) return toast("No hay actividades programadas esta semana.");
  openModal(`<h2 id="modalTitle">Congelar plan semanal · ${esc(fmt(w))} – ${esc(fmt(w + 6, true))}</h2>
    <p class="help" style="margin:0">Marca lo que el equipo se compromete a ejecutar y cuánto. El PAC de la semana se calcula sobre estos compromisos; una actividad se cumple cuando su metrado ejecutado alcanza el comprometido.</p>
    <form id="mForm" novalidate>
      <div class="scroll-x"><table><thead><tr><th></th><th>Id Tarea</th><th>Descripción</th><th class="num">Pendiente</th><th class="num">Comprometido</th><th>Restr.</th></tr></thead><tbody>
      ${list.map((a) => { const pend = Math.max(0, num(a.metrado) - metradoPrev(a.uid, toIso(w))); const nr = openRestr(a.uid).length; const has = num(a.metrado) > 0;
        return `<tr><td><input type="checkbox" class="p-ck" data-uid="${esc(a.uid)}" aria-label="Comprometer ${esc(a.idTarea)}" ${workDaysIn(a, w, w + 6) && !nr ? "checked" : ""}></td>
          <td class="code">${esc(a.idTarea)}</td><td class="desc">${esc(a.desc)}<div class="sub">${esc(fmtIso(a.inicio))} → ${esc(fmtIso(a.fin))}</div></td>
          <td class="mono num">${has ? `${fmtN(pend, 2)} ${esc(a.unidad)}` : "—"}</td>
          <td class="num">${has ? `<input class="p-met mono" data-uid="${esc(a.uid)}" type="number" min="0" step="any" style="width:7em" value="${sugerido(a, w)}"> ${esc(a.unidad)}` : '<span class="sub">sin metrado</span>'}</td>
          <td>${nr ? `<span class="pill warn" title="Tiene restricciones abiertas">${nr}</span>` : '<span class="sub">0</span>'}</td></tr>`; }).join("")}
      </tbody></table></div>
      <div class="field"><label for="m-who">Congelado por <span class="req">*</span></label><input id="m-who" maxlength="60" value="${esc(lsGet(WHO_KEY) || "")}"><div class="err" id="m-err"></div></div>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Congelar plan</button></div>
    </form>`, (box) => {
    box.querySelector("#mForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const who = box.querySelector("#m-who").value.trim();
      if (!who) { box.querySelector("#m-err").textContent = "Indica quién congela el plan."; return; }
      const compromisos = [...box.querySelectorAll(".p-ck:checked")].map((ck) => {
        const a = byUid(ck.dataset.uid); const inp = box.querySelector(`.p-met[data-uid="${ck.dataset.uid}"]`);
        return { uid: a.uid, idTarea: a.idTarea, comprometida: true, metradoComp: inp ? num(inp.value) : null, unidad: a.unidad || "", hhComp: hhPlan(a, w, w + 6) };
      });
      if (!compromisos.length) { box.querySelector("#m-err").textContent = "Marca al menos un compromiso."; return; }
      lsSet(WHO_KEY, who);
      try { await savePlan({ semana: toIso(w), fecha: new Date().toISOString(), congeladoPor: who, compromisos }); closeModal(); toast(`Plan semanal congelado con ${compromisos.length} compromisos.`); }
      catch (ex) { writeFailed(ex); }
    });
  }, true);
}
async function unfreeze(w) {
  if (!requirePid()) return;
  if (state.regs.some((r) => r.semana === toIso(w))) return toast("La semana ya tiene registros; el plan no se puede descongelar.");
  try { await deletePlan(toIso(w)); toast("Plan semanal descongelado."); } catch (ex) { writeFailed(ex); }
}
function renderPlanBar(w) {
  const p = planOf(w); const c = corteOf(w); const hasRegs = state.regs.some((r) => r.semana === toIso(w));
  const ro = state.readOnly ? " disabled" : "";
  $("planBar").innerHTML = `<div class="plan-step${p ? " done" : ""}"><span class="eyebrow">1 · Plan semanal</span>
      <span>${p ? `Congelado el ${esc(fmt(toDay(p.fecha.slice(0, 10))))} por ${esc(p.congeladoPor || "—")} · ${p.compromisos.length} compromisos` : "Sin congelar"}</span>
      <span class="btn-group">${p ? (hasRegs ? "" : `<button class="btn btn-sm" data-plan="unfreeze"${ro}>Descongelar</button>`) : `<button class="btn btn-sm btn-primary" data-plan="freeze"${ro}>Congelar plan</button>`}</span></div>
    <div class="plan-step${c ? " done" : ""}"><span class="eyebrow">2 · Excel de campo</span>
      <span>${p ? "Plantilla con los compromisos para el personal de campo" : "Disponible al congelar el plan"}</span>
      <span class="btn-group"><button class="btn btn-sm" data-plan="campo"${p ? "" : " disabled"}>Exportar Excel de campo</button></span></div>
    <div class="plan-step${c ? " done" : ""}"><span class="eyebrow">3 · Corte semanal</span>
      <span>${c ? `Cargado el ${esc(fmt(toDay(c.fecha.slice(0, 10))))} por ${esc(c.cargadoPor || "—")} · ${c.resumen?.registros ?? 0} registros` : "Carga el Excel de campo al cierre de la semana"}</span>
      <span class="btn-group"><button class="btn btn-sm${p && !c ? " btn-primary" : ""}" data-plan="import"${ro}>Cargar corte (Excel)</button></span></div>`;
}

// ---------- Tabla y KPIs de la semana ----------
export function renderEjecucion() {
  const w = exWeek();
  $("exWeek").textContent = `${fmt(w)} – ${fmt(w + 6, true)}`;
  renderPlanBar(w);
  const list = weekActs(w);
  const regs = list.map((a) => regOf(a.uid, w)).filter(Boolean);
  const plan = planOf(w);
  const compUids = plan ? plan.compromisos.map((c) => c.uid) : regs.filter((r) => r.comprometida === "Sí").map((r) => r.uid);
  const cump = compUids.filter((u) => regOf(u, w)?.cumplida === "Sí").length;
  const hhP = list.reduce((s, a) => s + hhPlan(a, w, w + 6), 0);
  const hhR = regs.reduce((s, r) => s + regHH(r), 0);
  const lost = regs.reduce((s, r) => s + regLostHH(r), 0);
  const nOpen = state.restr.filter((r) => r.estado !== "Liberada" && list.some((a) => a.uid === r.uid)).length;
  const kpi = (label, v, s) => `<div class="kpi"><span class="eyebrow">${label}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  $("exKpis").innerHTML = [
    kpi("Registradas", `${regs.length}/${list.length}`, "actividades con registro"),
    kpi("PAC", compUids.length && regs.length ? fmtPct(cump / compUids.length) : "—", `${cump} de ${compUids.length} compromisos cumplidos${plan ? "" : " (sin plan congelado)"}`),
    kpi("HH plan", fmtN(hhP), "programa vigente de la semana"),
    kpi("HH real", regs.length ? fmtN(hhR) : "—", hhP && regs.length ? `${fmtN(100 * hhR / hhP)} % del plan` : "trabajadas + extra"),
    kpi("HH perdidas", regs.length ? fmtN(lost) : "—", hhR ? `${fmtN(100 * lost / (hhR + lost), 1)} % del total` : "por causas registradas"),
    kpi("Restricciones", String(nOpen), "abiertas en la semana"),
  ].join("");
  $("exCount").textContent = list.length ? `${list.length} ${list.length === 1 ? "actividad" : "actividades"}` : "";
  $("exEmpty").hidden = list.length > 0;
  $("exBody").innerHTML = list.map((a) => {
    const r = regOf(a.uid, w); const nr = openRestr(a.uid).length; const c = compOf(a.uid, w);
    const compCell = c ? (num(c.metradoComp) > 0 ? `${fmtN(c.metradoComp, 2)} ${esc(c.unidad)}` : '<span class="pill info">Sí</span>') : plan ? '<span class="sub">No</span>' : yn(r?.comprometida);
    return `<tr class="${state.exec.uid === a.uid ? "is-editing" : ""}">
      <td class="code">${esc(a.idTarea)}${a.noPlanificada ? '<div><span class="pill info">no planificada</span></div>' : ""}</td>
      <td class="desc">${esc(a.desc)}<div class="sub">${esc(fmtIso(a.inicio))} → ${esc(fmtIso(a.fin))}</div></td>
      <td class="mono num">${compCell}</td>
      <td class="mono num">${r && r.metradoEjec != null ? `${fmtN(r.metradoEjec, 2)} ${esc(a.unidad)}` : "—"}</td>
      <td>${yn(r?.cumplida)}${r?.causaNC ? `<div class="sub">${esc(r.causaNC)}</div>` : ""}</td>
      <td class="mono num">${r ? fmtN(regHH(r)) : "—"}<div class="sub">plan ${fmtN(hhPlan(a, w, w + 6))}</div></td>
      <td class="mono num">${r && r.avance != null ? fmtN(r.avance) + " %" : "—"}</td>
      <td>${r ? `<span class="pill ok">${esc(r.fuente === "Excel de campo" ? "Excel" : "Manual")}</span><div class="sub">${esc(r.registradoPor || "")}</div>` : '<span class="pill">Sin registro</span>'}</td>
      <td>${nr ? `<span class="pill warn">${nr}</span>` : '<span class="sub">0</span>'}</td>
      <td><div class="row-actions"><button class="btn btn-sm${r ? "" : " btn-primary"}" data-uid="${esc(a.uid)}"${state.readOnly ? " disabled" : ""}>${r ? "Editar" : "Registrar"}</button></div></td>
    </tr>`;
  }).join("");
  renderRestrTable();
  if (state.exec.uid && !list.some((a) => a.uid === state.exec.uid)) state.exec.uid = null;
  $("exFormPanel").hidden = !state.exec.uid;
}

// ---------- Formulario de registro (una actividad, una semana) ----------
function lossRow(p = {}) {
  return `<div class="rowline loss">
    <div class="field"><label>Causa</label><select class="l-causa">${opts(CAUSAS, p.causa, "— Elige —")}</select></div>
    <div class="field"><label>Horas perdidas</label><input class="l-horas mono" type="number" min="0" step="0.5" value="${p.horas ?? ""}"></div>
    <div class="field"><label>Personas afectadas</label><input class="l-personas mono" type="number" min="0" step="1" value="${p.personas ?? ""}"></div>
    <div class="field"><label>HH perdidas</label><div class="calc l-hh">${fmtN(num(p.horas) * num(p.personas), 1)}</div></div>
    <button type="button" class="btn btn-icon btn-ghost btn-danger" data-rm aria-label="Quitar fila">✕</button></div>`;
}
function eqRow(q = {}) {
  return `<div class="rowline eq">
    <div class="field"><label>Equipo</label><input class="q-equipo" list="dl-equipos" maxlength="60" value="${esc(q.equipo || "")}"></div>
    <div class="field"><label>Capacidad</label><input class="q-cap" maxlength="20" placeholder="Ej. 250 t" value="${esc(q.capacidad || "")}"></div>
    <div class="field"><label>Horas operativas</label><input class="q-op mono" type="number" min="0" step="0.5" value="${q.horasOp ?? ""}"></div>
    <div class="field"><label>Horas en espera</label><input class="q-esp mono" type="number" min="0" step="0.5" value="${q.horasEspera ?? ""}"></div>
    <button type="button" class="btn btn-icon btn-ghost btn-danger" data-rm aria-label="Quitar fila">✕</button></div>`;
}
const val = (id) => $(id).value;
const optN = (id) => (val(id) === "" ? null : num(val(id)));

function renderExecForm(fresh) {
  const a = byUid(state.exec.uid); const w = exWeek();
  const panel = $("exFormPanel");
  if (!a) { panel.hidden = true; return; }
  if (!fresh && panel.dataset.key === a.uid + w) { renderRestrList(); return; }
  panel.dataset.key = a.uid + w;
  const r = regOf(a.uid, w) || {};
  const prevMetrado = metradoPrev(a.uid, toIso(w));
  const prevRegs = state.regs.filter((x) => x.uid === a.uid && x.semana < toIso(w)).sort((x, y) => x.semana.localeCompare(y.semana));
  const inicioReal = r.inicioReal ?? (prevRegs.find((x) => x.inicioReal)?.inicioReal || "");
  const plannedDays = workDaysIn(a, w, w + 6);
  const { hayPlan, comp, metradoComp } = compromisoDe(a, w);
  const hasMet = num(a.metrado) > 0;
  const v = (x, d = "") => x ?? d;
  panel.hidden = false;
  panel.innerHTML = `
    <div class="panel-head"><div><div class="eyebrow">Registro semanal · ${esc(fmt(w))} – ${esc(fmt(w + 6, true))}</div><h2 style="margin-top:4px">${esc(a.idTarea)} · ${esc(a.desc)}</h2>
      <div class="help">Programa: ${esc(fmtIso(a.inicio))} → ${esc(fmtIso(a.fin))} · ${plannedDays} días laborables esta semana · ${a.personal ?? 0} personas · ${fmtN(hhPlan(a, w, w + 6))} HH${hasMet ? ` · metrado total ${fmtN(a.metrado, 2)} ${esc(a.unidad)}, acumulado anterior ${fmtN(prevMetrado, 2)}` : ""}</div></div>
      <button class="btn btn-ghost" id="xClose">Cerrar</button></div>
    <form id="xForm" novalidate class="exec-grid">
      <div class="xsec"><h3>Compromiso semanal <span class="help">${hayPlan ? "según el plan congelado" : "la semana no tiene plan congelado"}</span></h3>
        <div class="grid3">
          <div class="field"><label for="x-comp">¿Comprometida?</label>${hayPlan ? `<div class="calc">${comp ? "Sí" : "No"}${comp && metradoComp ? ` · ${fmtN(metradoComp, 2)} ${esc(a.unidad)}` : ""}</div><input type="hidden" id="x-comp" value="${comp ? "Sí" : "No"}">` : `<select id="x-comp"><option value="Sí">Sí</option><option value="No">No</option></select>`}</div>
          <div class="field"><label for="x-cump">¿Cumplida?</label><select id="x-cump"><option value="">— Elige —</option><option value="Sí">Sí</option><option value="No">No</option></select><div class="help" id="x-cumphint"></div><div class="err" id="xe-cumplida"></div></div>
          <div class="field"><label for="x-causa">Causa de no cumplimiento</label><select id="x-causa">${opts(CAUSAS, r.causaNC, "—")}</select><div class="err" id="xe-causaNC"></div></div>
        </div></div>
      <div class="xsec"><h3>Cantidades y avance <span class="help">el avance se calcula por metrados</span></h3>
        <div class="grid4">
          <div class="field"><label for="x-met">Metrado ejecutado en la semana${a.unidad ? ` (${esc(a.unidad)})` : ""}</label><input id="x-met" type="number" min="0" step="any" class="mono" value="${esc(v(r.metradoEjec))}"><div class="err" id="xe-metradoEjec"></div></div>
          <div class="field"><label>Metrado acumulado</label><div class="calc" id="x-macc"></div></div>
          <div class="field"><label for="x-av">Avance acumulado</label>${hasMet ? '<div class="calc" id="x-avcalc"></div>' : `<input id="x-av" type="number" min="0" max="100" step="1" class="mono" value="${esc(v(r.avance, prevRegs[prevRegs.length - 1]?.avance ?? ""))}">`}<div class="err" id="xe-avance"></div></div>
          <div class="field"><label>Productividad real</label><div class="calc" id="x-prod">—</div></div>
        </div></div>
      <div class="xsec"><h3>Tiempo</h3>
        <div class="grid4">
          <div class="field"><label for="x-ini">Fecha real de inicio</label><input id="x-ini" type="date" class="mono" value="${esc(inicioReal)}"></div>
          <div class="field"><label for="x-fin">Fecha real de fin</label><input id="x-fin" type="date" class="mono" value="${esc(v(r.finReal))}"><div class="err" id="xe-finReal"></div></div>
          <div class="field"><label for="x-turno">Turno</label><select id="x-turno">${["Día", "Noche", "Día y noche"].map((t) => `<option${(r.turno || "Día") === t ? " selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="field"><label for="x-dias">Días trabajados <span class="req">*</span></label><input id="x-dias" type="number" min="0" max="7" step="1" class="mono" value="${esc(v(r.dias, plannedDays))}"><div class="err" id="xe-dias"></div></div>
          <div class="field"><label for="x-horas">Horas efectivas por día <span class="req">*</span></label><input id="x-horas" type="number" min="0" max="24" step="0.5" class="mono" value="${esc(v(r.horasDia, horasDia()))}"><div class="err" id="xe-horasDia"></div></div>
        </div></div>
      <div class="xsec"><h3>Personal real por categoría <span class="help">promedio diario de la semana</span></h3>
        <div class="cat-grid">${CATS.map(([c, n]) => `<div class="field"><label for="x-cat-${c}">${esc(n)}</label><input id="x-cat-${c}" class="mono" type="number" min="0" step="1" value="${esc(v((r.personal || {})[c]))}"></div>`).join("")}</div>
        <div class="grid4">
          <div class="field"><label>Personal total</label><div class="calc" id="x-tot">0</div></div>
          <div class="field"><label>HH trabajadas</label><div class="calc" id="x-hh">0</div></div>
          <div class="field"><label for="x-hhext">HH extra</label><input id="x-hhext" type="number" min="0" step="0.5" class="mono" value="${esc(v(r.hhExtra))}"></div>
          <div class="field"><label for="x-hhimp">HH improductivas</label><input id="x-hhimp" type="number" min="0" step="0.5" class="mono" value="${esc(v(r.hhImprod))}"></div>
        </div>
        <div class="err" id="xe-personal"></div><div class="help" id="x-hhcmp"></div></div>
      <div class="xsec"><h3>Pérdidas por causa <span class="help">horas en que la cuadrilla no pudo trabajar</span></h3>
        <div class="rows" id="x-losses">${(r.perdidas || []).map(lossRow).join("")}</div><div class="err" id="xe-perdidas"></div>
        <div><button type="button" class="btn btn-sm" id="x-addLoss">Agregar pérdida</button></div></div>
      <div class="xsec"><h3>Equipos</h3>
        <div class="rows" id="x-eqs">${(r.equipos || []).map(eqRow).join("")}</div>
        <div><button type="button" class="btn btn-sm" id="x-addEq">Agregar equipo</button></div></div>
      <div class="xsec"><h3>Calidad y seguridad</h3>
        <div class="grid4">
          <div class="field"><label for="x-prot">Protocolos liberados</label><input id="x-prot" type="number" min="0" step="1" class="mono" value="${esc(v(r.protocolos))}"></div>
          <div class="field"><label for="x-nc">No conformidades</label><input id="x-nc" type="number" min="0" step="1" class="mono" value="${esc(v(r.noConformidades))}"></div>
          <div class="field"><label for="x-ret">Retrabajo (HH)</label><input id="x-ret" type="number" min="0" step="0.5" class="mono" value="${esc(v(r.retrabajoHH))}"></div>
          <div class="field"><label for="x-inc">Incidentes de seguridad</label><input id="x-inc" type="number" min="0" step="1" class="mono" value="${esc(v(r.incidentes))}"></div>
        </div></div>
      <div class="xsec"><h3>Restricciones de la actividad</h3>
        <div class="restr-list" id="x-restr"></div>
        <div class="rowline" style="grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) auto">
          <div class="field"><label for="r-tipo">Tipo</label><select id="r-tipo">${opts(RTIPOS, "", "— Elige —")}</select></div>
          <div class="field"><label for="r-desc">Descripción</label><input id="r-desc" maxlength="160" placeholder="Ej. Falta liberar plano rev. 3"></div>
          <div class="field"><label for="r-resp">Responsable de liberarla</label><input id="r-resp" maxlength="60"></div>
          <div class="field"><label for="r-fecha">Fecha compromiso</label><input id="r-fecha" type="date" class="mono"></div>
          <button type="button" class="btn btn-sm" id="r-add">Agregar</button>
        </div><div class="err" id="re-add"></div></div>
      <div class="xsec"><h3>Trazabilidad</h3>
        <div class="grid3">
          <div class="field"><label for="x-who">Registrado por <span class="req">*</span></label><input id="x-who" maxlength="60" value="${esc(r.registradoPor || lsGet(WHO_KEY) || "")}"><div class="err" id="xe-registradoPor"></div></div>
          <div class="field"><label for="x-src">Fuente</label><select id="x-src">${FUENTES.map((s) => `<option${(r.fuente || "Tareo") === s ? " selected" : ""}>${s}</option>`).join("")}</select></div>
          <div class="field"><label>Última modificación</label><div class="calc" style="font-size:.85rem">${r.fechaRegistro ? esc(new Date(r.fechaRegistro).toLocaleString("es-PE")) : "Nuevo registro"}</div></div>
        </div>
        <div class="field"><label for="x-obs">Observaciones</label><textarea id="x-obs" maxlength="800">${esc(v(r.obs))}</textarea></div></div>
      <div class="form-actions"><button type="submit" class="btn btn-primary"${state.readOnly ? " disabled" : ""}>Guardar registro semanal</button><button type="button" class="btn" id="xCancel">Cancelar</button></div>
    </form>
    <datalist id="dl-equipos">${EQUIPOS.map((e) => `<option value="${esc(e)}">`).join("")}</datalist>`;
  if (!hayPlan) $("x-comp").value = r.comprometida || (plannedDays > 0 ? "Sí" : "No");
  $("x-cump").value = r.cumplida || "";

  // Recalcula totales, avance y cumplimiento automático mientras se escribe.
  const recalc = () => {
    const tot = CATS.reduce((s, [c]) => s + num(val("x-cat-" + c)), 0);
    const hh = tot * num(val("x-dias")) * num(val("x-horas"));
    $("x-tot").textContent = fmtN(tot); $("x-hh").textContent = fmtN(hh, 1);
    const hp = hhPlan(a, w, w + 6);
    $("x-hhcmp").textContent = hp ? `Plan de la semana: ${fmtN(hp)} HH · real ${fmtN(hh, 1)} HH (${fmtN(100 * hh / hp)} %).` : "";
    const met = num(val("x-met")); const acc = prevMetrado + met;
    $("x-macc").textContent = a.unidad || met ? `${fmtN(acc, 2)} ${a.unidad || ""}` : "—";
    $("x-prod").textContent = met > 0 ? `${fmtN(hh / met, 2)} HH/${a.unidad || "u"}` : "—";
    if (hasMet) $("x-avcalc").textContent = val("x-fin") ? "100 % (terminada)" : `${fmtN(avanceFrom(a.metrado, acc), 1)} %`;
    for (const row of panel.querySelectorAll(".loss")) row.querySelector(".l-hh").textContent = fmtN(num(row.querySelector(".l-horas").value) * num(row.querySelector(".l-personas").value), 1);
    const isComp = val("x-comp") === "Sí";
    const auto = comp ? cumplidaAuto(metradoComp, val("x-met")) : null;
    if (auto) $("x-cump").value = auto;
    $("x-cump").disabled = !isComp || !!auto;
    $("x-cumphint").textContent = auto ? `Automático: ejecutado ${fmtN(met, 2)} de ${fmtN(metradoComp, 2)} comprometido.` : "";
    $("x-causa").disabled = $("x-cump").value !== "No" || !isComp;
  };
  const form = panel.querySelector("#xForm");
  form.addEventListener("input", recalc); form.addEventListener("change", recalc);
  $("x-addLoss").addEventListener("click", () => $("x-losses").insertAdjacentHTML("beforeend", lossRow()));
  $("x-addEq").addEventListener("click", () => $("x-eqs").insertAdjacentHTML("beforeend", eqRow()));
  panel.onclick = (e) => { const rm = e.target.closest("[data-rm]"); if (rm) { rm.parentElement.remove(); recalc(); } };
  const close = () => { state.exec.uid = null; panel.hidden = true; panel.dataset.key = ""; renderEjecucion(); };
  $("xClose").addEventListener("click", close); $("xCancel").addEventListener("click", close);
  $("r-add").addEventListener("click", () => onAddRestr(a));
  form.addEventListener("submit", (e) => { e.preventDefault(); onSave(a, w, r); });
  recalc(); renderRestrList();
}

// Lee el formulario en el mismo formato que produce el Excel de campo.
function readExecForm() {
  const isComp = val("x-comp") === "Sí";
  return {
    comprometida: val("x-comp"), cumplida: isComp ? val("x-cump") : "", causaNC: isComp && val("x-cump") === "No" ? val("x-causa") : "",
    inicioReal: val("x-ini"), finReal: val("x-fin"), turno: val("x-turno"), dias: val("x-dias"), horasDia: val("x-horas"),
    personal: Object.fromEntries(CATS.map(([c]) => [c, num(val("x-cat-" + c))])),
    hhExtra: optN("x-hhext"), hhImprod: optN("x-hhimp"), metradoEjec: val("x-met"), avanceManual: $("x-av") ? val("x-av") : null,
    perdidas: [...document.querySelectorAll("#x-losses .loss")].map((row) => ({ causa: row.querySelector(".l-causa").value, horas: num(row.querySelector(".l-horas").value), personas: num(row.querySelector(".l-personas").value) })).filter((p) => p.causa || p.horas || p.personas),
    equipos: [...document.querySelectorAll("#x-eqs .eq")].map((row) => ({ equipo: row.querySelector(".q-equipo").value.trim(), capacidad: row.querySelector(".q-cap").value.trim(), horasOp: num(row.querySelector(".q-op").value), horasEspera: num(row.querySelector(".q-esp").value) })).filter((q) => q.equipo || q.horasOp || q.horasEspera),
    protocolos: optN("x-prot"), noConformidades: optN("x-nc"), retrabajoHH: optN("x-ret"), incidentes: optN("x-inc"),
    registradoPor: val("x-who").trim(), fuente: val("x-src"), obs: val("x-obs").trim(),
  };
}
async function onSave(a, w, prev) {
  if (!requirePid()) return;
  for (const el of $("exFormPanel").querySelectorAll(".err")) el.textContent = "";
  const x = readExecForm();
  const errs = validarEntrada(x, a);
  for (const e of errs) { const el = $("xe-" + e.campo); if (el && !el.textContent) el.textContent = e.msg; }
  if (errs.length) { $("exFormPanel").querySelector(".err:not(:empty)")?.scrollIntoView({ block: "center" }); return; }
  lsSet(WHO_KEY, x.registradoPor);
  try {
    await saveReg(construirRegistro(a, w, x, prev.id ? prev : null));
    toast(`Registro de ${a.idTarea} guardado.`);
    state.exec.uid = null; $("exFormPanel").hidden = true; $("exFormPanel").dataset.key = ""; renderEjecucion();
  } catch (ex) { writeFailed(ex); }
}

// ---------- Restricciones ----------
function restrState(r) {
  if (r.estado === "Liberada") return `<span class="pill ok">Liberada ${esc(fmtIso(r.fechaLiberacion))}</span>`;
  const late = r.fechaCompromiso && toDay(r.fechaCompromiso) < todayDay();
  return `<span class="pill ${late ? "bad" : "warn"}">${late ? "Vencida" : "Abierta"}</span>`;
}
const restrItem = (r) => `<div class="restr-item"><span class="code">${esc(r.tipo)}</span><span class="txt">${esc(r.desc)}<div class="help">${esc(name(RTIPOS, r.tipo))}${r.responsable ? " · " + esc(r.responsable) : ""}${r.fechaCompromiso ? " · compromiso " + esc(fmtIso(r.fechaCompromiso)) : ""}</div></span>${restrState(r)}${r.estado !== "Liberada" && !state.readOnly ? `<button type="button" class="btn btn-sm" data-free="${esc(r.id)}">Liberar</button>` : ""}</div>`;
function renderRestrList() {
  const box = $("x-restr"); if (!box) return;
  const list = state.restr.filter((r) => r.uid === state.exec.uid).sort((a, b) => (a.estado === "Liberada") - (b.estado === "Liberada") || (a.fechaCompromiso || "").localeCompare(b.fechaCompromiso || ""));
  box.innerHTML = list.length ? list.map(restrItem).join("") : '<div class="help">Sin restricciones registradas. Si nada impide ejecutarla, la actividad está lista.</div>';
}
async function onAddRestr(a) {
  if (!requirePid()) return;
  $("re-add").textContent = "";
  const tipo = val("r-tipo"), desc = val("r-desc").trim();
  if (!tipo || !desc) { $("re-add").textContent = "Indica el tipo y la descripción de la restricción."; return; }
  try {
    await addRestr(a, { tipo, desc, responsable: val("r-resp").trim(), fechaCompromiso: val("r-fecha") });
    for (const id of ["r-tipo", "r-desc", "r-resp", "r-fecha"]) $(id).value = "";
    toast("Restricción agregada.");
  } catch (ex) { writeFailed(ex); }
}
function renderRestrTable() {
  const list = state.restr.filter((r) => r.estado !== "Liberada").sort((a, b) => (a.fechaCompromiso || "9").localeCompare(b.fechaCompromiso || "9"));
  $("rsEmpty").hidden = list.length > 0;
  $("rsBody").innerHTML = list.map((r) => { const a = byUid(r.uid); return `<tr><td class="code">${esc(a ? a.idTarea : r.idTarea)}</td><td><span class="code">${esc(r.tipo)}</span><div class="sub">${esc(name(RTIPOS, r.tipo))}</div></td><td class="desc">${esc(r.desc)}</td><td>${esc(r.responsable) || '<span class="sub">—</span>'}</td><td class="mono nowrap">${esc(fmtIso(r.fechaCompromiso)) || "—"}</td><td>${restrState(r)}</td><td><div class="row-actions">${state.readOnly ? "" : `<button class="btn btn-sm" data-free="${esc(r.id)}">Liberar</button>`}</div></td></tr>`; }).join("");
}

export function initEjecucion() {
  $("exPrev").addEventListener("click", () => { state.exec.week = exWeek() - 7; state.exec.uid = null; renderEjecucion(); });
  $("exNext").addEventListener("click", () => { state.exec.week = exWeek() + 7; state.exec.uid = null; renderEjecucion(); });
  $("exBody").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-uid]"); if (!b) return;
    state.exec.uid = b.dataset.uid; renderEjecucion(); renderExecForm(true);
    $("exFormPanel").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
  });
  $("planBar").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-plan]"); if (!b) return;
    const w = exWeek(); const act = b.dataset.plan;
    if (act === "freeze") planDialog(w);
    else if (act === "unfreeze") unfreeze(w);
    else if (act === "campo") { b.disabled = true; try { await exportCampo(w); } catch (ex) { console.error(ex); toast("No se pudo generar el Excel de campo."); } finally { b.disabled = false; } }
    else if (act === "import") importCampo(w);
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-free]"); if (!b || !requirePid()) return;
    try { await freeRestr(b.dataset.free); toast("Restricción liberada."); } catch (ex) { writeFailed(ex); }
  });
  // Si llegan datos nuevos mientras el formulario está abierto, solo se refresca la lista de restricciones.
  on("regs", () => { if (state.exec.uid) renderExecForm(false); });
  on("restr", () => { if (state.exec.uid) renderRestrList(); });
}
