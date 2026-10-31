// Pestaña "Entrada de actividades": formulario de la tarea, tabla del programa vigente y línea base.
// Id Tarea = {Sector/Zona}.{Tipo}.{correlativo de 3 dígitos por tipo}; el correlativo no se reutiliza.

import { DISC, UNIDADES, SECTOR_RE, discOf, discIdx, tipoName } from "../config.js";
import { $, esc, num, fmtN, toDay, toIso, todayDay, fmt, fmtIso, newId, reducedMotion } from "../util.js";
import { state, horasDia, sectores, startDay, workDaysIn, hhPlan, durOf, byUid, sortActs, predConflict, latestBaseline, blOf, openRestr } from "../state.js";
import { requirePid, writeFailed, saveProj, saveTask, deleteTask, freezeBaseline } from "../data.js";
import { toast, openModal, closeModal } from "../ui.js";
import { goTo } from "./nav.js";

const f = (n) => $("f-" + n);
const FIELDS = ["desc", "disciplina", "tipo", "especialidad", "sector", "inicio", "fin", "personal", "resp", "metrado", "unidad", "peso", "altura", "nivel", "ejes", "plano", "pred", "obs"];
const ERR_FIELDS = ["desc", "disciplina", "tipo", "sector", "inicio", "fin", "personal", "metrado", "unidad", "pred"];

export const nextNum = (tipo, exceptUid) => state.acts.reduce((m, a) => (a.tipo === tipo && a.uid !== exceptUid ? Math.max(m, a.num || 0) : m), 0) + 1;
export const makeId = (sector, tipo, n) => `${sector}.${tipo}.${String(n).padStart(3, "0")}`;
export const swatch = (disc) => `<span class="swatch" style="background:var(${DISC[discIdx(disc)].cssVar})"></span>`;
export const discOptions = (cur, label) => `<option value="">${label}</option>` + DISC.map((d) => `<option value="${esc(d.name)}"${d.name === cur ? " selected" : ""}>${esc(d.name)}</option>`).join("");

// ---------- Formulario ----------
function fillTipos() {
  const d = discOf(f("disciplina").value); const cur = f("tipo").value;
  f("tipo").innerHTML = d ? '<option value="">— Elige —</option>' + d.tipos.map(([c, n]) => `<option value="${c}">${c} · ${esc(n)}</option>`).join("") : '<option value="">Primero elige la disciplina</option>';
  f("tipo").disabled = !d;
  if (d && d.tipos.some(([c]) => c === cur)) f("tipo").value = cur;
  const uniq = new Set([...(d ? d.esp : []), ...state.acts.filter((a) => !d || a.disciplina === d.name).map((a) => a.especialidad).filter(Boolean)]);
  $("dl-especialidad").innerHTML = [...uniq].map((v) => `<option value="${esc(v)}">`).join("");
}
function fillPredOptions() {
  const sel = f("pred"); const cur = sel.value;
  const list = sortActs(state.acts).filter((a) => a.uid !== state.editing);
  sel.innerHTML = '<option value="">— Ninguna —</option>' + list.map((a) => `<option value="${esc(a.uid)}">${esc(a.idTarea)} · ${esc(a.desc)}</option>`).join("");
  sel.value = list.some((a) => a.uid === cur) ? cur : "";
}
export function fillDatalists() {
  const uniq = (k) => [...new Set(state.acts.map((a) => a[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const secs = [...new Set([...Object.keys(sectores()), ...uniq("sector")])].sort();
  $("dl-sector").innerHTML = secs.map((s) => `<option value="${esc(s)}">${esc(sectores()[s] || "")}</option>`).join("");
  $("dl-nivel").innerHTML = uniq("nivel").map((v) => `<option value="${esc(v)}">`).join("");
  $("dl-resp").innerHTML = uniq("resp").map((v) => `<option value="${esc(v)}">`).join("");
  fillTipos();
}
function clearErrors() { for (const k of ERR_FIELDS) { $("e-" + k).textContent = ""; f(k).removeAttribute("aria-invalid"); } }
function setError(k, msg) { $("e-" + k).textContent = msg; f(k).setAttribute("aria-invalid", "true"); }
function readForm() {
  const o = {};
  for (const k of FIELDS) o[k] = (f(k).value || "").trim();
  o.sector = o.sector.toUpperCase();
  o.sectorNombre = f("sectorNombre").value.trim();
  return o;
}
function createsCycle(uid, pred) { let cur = pred; const seen = new Set(); while (cur && !seen.has(cur)) { if (cur === uid) return true; seen.add(cur); cur = byUid(cur)?.pred; } return false; }
function validate(o) {
  clearErrors();
  let ok = true; const err = (k, m) => { setError(k, m); ok = false; };
  if (!o.desc) err("desc", "Escribe una descripción breve.");
  if (!o.disciplina) err("disciplina", "Elige la disciplina.");
  if (!o.tipo) err("tipo", "Elige el tipo de actividad.");
  if (!o.sector) err("sector", "Indica el Sector/Zona.");
  else if (!SECTOR_RE.test(o.sector)) err("sector", "Usa solo letras y números, sin espacios ni puntos (ej. ESP0310).");
  if (!o.inicio) err("inicio", "Elige la fecha de inicio.");
  if (!o.fin) err("fin", "Elige la fecha de fin.");
  if (o.inicio && o.fin && toDay(o.fin) < toDay(o.inicio)) err("fin", "La fecha de fin no puede ser anterior al inicio.");
  if (o.personal === "") err("personal", "Indica la cantidad de personal (puede ser 0).");
  else if (!/^\d+$/.test(o.personal) || Number(o.personal) > 999) err("personal", "Usa un número entero entre 0 y 999.");
  if (o.metrado !== "" && !(Number(o.metrado) >= 0)) err("metrado", "Usa un número mayor o igual a 0.");
  if (o.metrado !== "" && Number(o.metrado) > 0 && !o.unidad) err("unidad", "Elige la unidad del metrado.");
  if (o.pred && state.editing && createsCycle(state.editing, o.pred)) err("pred", "Esa predecesora crea una dependencia circular.");
  return ok;
}
function previewId(o) {
  if (!o.tipo || !o.sector || !SECTOR_RE.test(o.sector)) return null;
  const prev = state.editing && byUid(state.editing);
  return makeId(o.sector, o.tipo, prev && prev.tipo === o.tipo ? prev.num : nextNum(o.tipo, state.editing));
}
export function updateHint() {
  const o = readForm(); const parts = [];
  const id = previewId(o);
  $("idPreview").textContent = id || "Sector/Zona . Tipo . 001";
  $("idPreview").className = "id" + (id ? "" : " pending");
  const s = toDay(o.inicio), e = toDay(o.fin);
  if (!isNaN(s) && !isNaN(e) && e >= s) {
    const h0 = startDay(), h1 = h0 + 20;
    if (e < h0 || s > h1) parts.push("Las fechas quedan fuera del horizonte actual de 3 semanas; no se verá en el Gantt hasta que muevas el inicio del lookahead.");
    const tmp = { inicio: o.inicio, fin: o.fin, personal: o.personal };
    const hh = hhPlan(tmp); const m = num(o.metrado);
    $("hhInfo").textContent = `HH planificadas: ${fmtN(hh)} (${workDaysIn(tmp, s, e)} días laborables × ${num(o.personal)} personas × ${fmtN(horasDia(), 1)} h)` + (m > 0 && hh > 0 ? ` · Rendimiento plan: ${fmtN(hh / m, 2)} HH/${o.unidad || "unidad"}` : "");
    $("hhInfo").hidden = false;
  } else $("hhInfo").hidden = true;
  const p = o.pred && byUid(o.pred);
  if (p && !isNaN(s) && s <= toDay(p.fin)) parts.push(`Empieza antes de que termine su predecesora ${p.idTarea} (fin ${fmtIso(p.fin)}).`);
  const prev = state.editing && byUid(state.editing);
  if (prev && id && id !== prev.idTarea) parts.push(`El Id Tarea cambiará de ${prev.idTarea} a ${id}.`);
  if (prev && latestBaseline() && (prev.inicio !== o.inicio || prev.fin !== o.fin)) parts.push("La línea base congelada no cambia; este ajuste quedará como desvío contra ella.");
  if (!o.metrado) parts.push("Sin metrado planificado el avance no se puede calcular por metrados; se pedirá un % manual.");
  $("durHint").textContent = parts.join(" ");
}
export function resetForm(keep) {
  state.editing = null; $("actForm").reset(); clearErrors();
  const t = todayDay(), h0 = startDay();
  f("inicio").value = toIso(t >= h0 && t <= h0 + 20 ? t : h0);
  if (keep) {
    f("disciplina").value = keep.disciplina; fillTipos(); f("tipo").value = keep.tipo; f("sector").value = keep.sector;
    f("sectorNombre").value = sectores()[keep.sector] || ""; f("especialidad").value = keep.especialidad || ""; f("unidad").value = keep.unidad || "";
  } else fillTipos();
  renderFormMode(); updateHint();
}
function renderFormMode() {
  const ed = state.editing && byUid(state.editing);
  $("formTitle").textContent = ed ? "Editar actividad" : "Nueva actividad";
  $("submitBtn").textContent = ed ? "Guardar cambios" : "Agregar actividad";
  $("cancelEdit").hidden = !ed;
  $("editingBanner").hidden = !ed;
  $("editingBanner").textContent = ed ? `Estás editando ${ed.idTarea}. Los cambios se guardan al pulsar “Guardar cambios”.` : "";
  $("submitBtn").disabled = state.readOnly;
  fillPredOptions();
}
export function startEdit(uid) {
  const a = byUid(uid); if (!a) return;
  state.editing = uid; clearErrors();
  f("disciplina").value = a.disciplina || ""; fillTipos();
  renderFormMode();
  for (const k of FIELDS) if (k !== "disciplina") f(k).value = a[k] ?? "";
  f("sectorNombre").value = sectores()[a.sector] || "";
  goTo("entrada"); updateHint(); renderTable();
  f("desc").focus({ preventScroll: true });
  $("actForm").scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
}
async function submit(e) {
  e.preventDefault();
  if (!requirePid()) return;
  const o = readForm();
  if (!validate(o)) { $("actForm").querySelector('[aria-invalid="true"]')?.focus(); return; }
  const prev = state.editing ? byUid(state.editing) : null;
  const n = prev && prev.tipo === o.tipo ? prev.num : nextNum(o.tipo, prev?.uid);
  const now = new Date().toISOString();
  const optNum = (v) => (v === "" ? null : Number(v));
  const act = {
    ...(prev || {}), // conserva campos que el formulario no muestra (p. ej. noPlanificada)
    uid: prev?.uid || newId("t"), idTarea: makeId(o.sector, o.tipo, n), num: n,
    desc: o.desc, disciplina: o.disciplina, especialidad: o.especialidad, tipo: o.tipo, sector: o.sector,
    inicio: o.inicio, fin: o.fin, personal: Number(o.personal), metrado: optNum(o.metrado), unidad: o.unidad,
    peso: optNum(o.peso), altura: optNum(o.altura), resp: o.resp, nivel: o.nivel, ejes: o.ejes,
    plano: o.plano, pred: o.pred, obs: o.obs, creado: prev?.creado || now, modificado: now,
  };
  try {
    if ((sectores()[o.sector] || "") !== o.sectorNombre && (o.sectorNombre || sectores()[o.sector] !== undefined))
      await saveProj({ sectores: { ...sectores(), [o.sector]: o.sectorNombre } });
    await saveTask(act);
    toast(prev ? `Actividad ${act.idTarea} actualizada.` : `Actividad ${act.idTarea} agregada.`);
    resetForm(prev ? null : act); renderTable();
  } catch (err) { writeFailed(err); }
}

// ---------- Línea base ----------
function renderBaselineBar() {
  const b = latestBaseline();
  $("lbText").innerHTML = b
    ? `<strong>Línea base v${b.version}</strong> congelada el ${esc(fmt(toDay(b.fecha.slice(0, 10)), true))} con ${b.tareas.length} actividades${b.motivo ? " · " + esc(b.motivo) : ""}. Es el cronograma proyectado; los cambios de fechas se muestran como desvío.`
    : "La línea base aún no está congelada. Congélala cuando el plan esté aprobado: será el cronograma proyectado contra el que se mide lo real.";
  $("freezeBtn").textContent = b ? "Congelar nueva versión" : "Congelar línea base";
  $("freezeBtn").disabled = state.readOnly || !state.acts.length;
}
function freezeDialog() {
  if (!requirePid()) return;
  const v = (latestBaseline()?.version || 0) + 1;
  openModal(`<h2 id="modalTitle">Congelar línea base v${v}</h2>
    <p class="help" style="margin:0">Se guarda una copia fija de las ${state.acts.length} actividades actuales (fechas, personal, metrado y HH planificadas). Las versiones anteriores se conservan.</p>
    <form id="mForm" novalidate><div class="field"><label for="m-motivo">Motivo</label><input id="m-motivo" maxlength="120" value="${v === 1 ? "Línea base inicial" : ""}" placeholder="Ej. Reprogramación por llegada tardía de estructuras"></div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Congelar v${v}</button></div></form>`, (box) => {
    box.querySelector("#mForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { await freezeBaseline(v, box.querySelector("#m-motivo").value.trim()); closeModal(); toast(`Línea base v${v} congelada.`); } catch (ex) { writeFailed(ex); }
    });
  });
}

// ---------- Tabla ----------
function blPill(a) {
  if (!latestBaseline()) return "";
  const b = blOf(a.uid);
  if (!b) return ` <span class="pill info" title="No estaba en la línea base congelada">${a.noPlanificada ? "no planificada" : "nueva"}</span>`;
  const di = toDay(a.inicio) - toDay(b.inicio), df = toDay(a.fin) - toDay(b.fin);
  if (!di && !df) return "";
  const sgn = (n) => (n > 0 ? "+" : "") + n;
  return ` <span class="pill ${df > 0 ? "warn" : "info"}" title="Desvío contra la línea base: inicio ${sgn(di)} d, fin ${sgn(df)} d">LB fin ${sgn(df)} d</span>`;
}
function renderTable() {
  const q = $("search").value.trim().toLowerCase();
  const fd = $("filterDisc").value;
  const rows = sortActs(state.acts).filter((a) => (!fd || a.disciplina === fd) &&
    (!q || [a.idTarea, a.desc, a.disciplina, a.especialidad, tipoName(a.tipo), a.sector, sectores()[a.sector], a.resp, a.nivel, a.ejes, a.plano, a.obs].some((v) => String(v || "").toLowerCase().includes(q))));
  const empty = $("tableEmpty");
  empty.hidden = state.acts.length > 0;
  empty.innerHTML = state.mode === "connecting" ? "<strong>Cargando actividades…</strong>"
    : "<strong>Aún no hay actividades</strong><span>Registra la primera con el formulario. Aparecerá aquí y en el diagrama de Gantt.</span>";
  $("tbody").innerHTML = rows.map((a) => {
    const conf = predConflict(a); const p = a.pred && byUid(a.pred);
    const predCell = a.pred ? `<span class="code">${esc(p ? p.idTarea : "—")}</span>${conf ? ' <span class="pill warn" title="Empieza antes de que termine su predecesora">traslape</span>' : ""}${!p ? ' <span class="pill">eliminada</span>' : ""}` : '<span class="sub">—</span>';
    const loc = [a.nivel && "Nivel " + a.nivel, a.ejes && "Ejes " + a.ejes].filter(Boolean).map(esc).join(" · ");
    const nr = openRestr(a.uid).length;
    const ro = state.readOnly ? " disabled" : "";
    const actions = state.confirmDel === a.uid
      ? `<span class="sub">¿Eliminar?</span><button class="btn btn-icon btn-danger" data-act="del-yes" data-uid="${esc(a.uid)}">Sí</button><button class="btn btn-icon" data-act="del-no">No</button>`
      : `<button class="btn btn-icon" data-act="edit" data-uid="${esc(a.uid)}"${ro}>Editar</button><button class="btn btn-icon btn-ghost btn-danger" data-act="del" data-uid="${esc(a.uid)}" aria-label="Eliminar ${esc(a.idTarea)}"${ro}>Eliminar</button>`;
    return `<tr class="${state.editing === a.uid ? "is-editing" : ""}">
      <td class="code">${esc(a.idTarea)}${nr ? `<div><span class="pill warn">${nr} restr.</span></div>` : ""}</td>
      <td class="desc">${esc(a.desc)}${a.metrado ? `<div class="sub">Metrado: ${fmtN(a.metrado, 2)} ${esc(a.unidad)}</div>` : ""}${a.plano ? `<div class="sub">Plano ${esc(a.plano)}</div>` : ""}${a.obs ? `<div class="sub" title="${esc(a.obs)}">${esc(a.obs.length > 70 ? a.obs.slice(0, 70) + "…" : a.obs)}</div>` : ""}</td>
      <td><span class="nowrap">${swatch(a.disciplina)}${esc(a.disciplina)}</span><div class="sub">${esc(a.tipo)} · ${esc(tipoName(a.tipo))}${a.especialidad ? " · " + esc(a.especialidad) : ""}</div></td>
      <td><span class="code">${esc(a.sector)}</span>${sectores()[a.sector] ? `<div class="sub">${esc(sectores()[a.sector])}</div>` : ""}${loc ? `<div class="sub">${loc}</div>` : ""}</td>
      <td class="mono nowrap">${fmtIso(a.inicio)}</td>
      <td class="mono nowrap">${fmtIso(a.fin)}${blPill(a)}</td>
      <td class="mono num">${durOf(a)}</td>
      <td class="mono num">${a.personal ?? 0}<div class="sub">${fmtN(hhPlan(a))} HH</div></td>
      <td>${esc(a.resp) || '<span class="sub">—</span>'}</td>
      <td class="nowrap">${predCell}</td>
      <td><div class="row-actions">${actions}</div></td>
    </tr>`;
  }).join("");
  if (state.acts.length && !rows.length) $("tbody").innerHTML = '<tr><td colspan="11" class="sub" style="text-align:center;padding:20px">Ninguna actividad coincide con la búsqueda.</td></tr>';
}
async function onDelete(uid) {
  const a = byUid(uid);
  try {
    await deleteTask(uid);
    if (state.editing === uid) resetForm();
    state.confirmDel = null;
    toast(`Actividad ${a ? a.idTarea : ""} eliminada. Sus registros de ejecución se conservan.`);
  } catch (err) { writeFailed(err); }
}

export function renderEntrada() {
  $("filterDisc").innerHTML = discOptions($("filterDisc").value, "Todas las disciplinas");
  if (state.editing && !byUid(state.editing)) resetForm();
  renderFormMode(); renderTable(); renderBaselineBar(); updateHint();
}

export function initEntrada() {
  f("disciplina").innerHTML = '<option value="">— Elige —</option>' + DISC.map((d) => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join("");
  f("unidad").innerHTML = '<option value="">—</option>' + UNIDADES.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
  f("disciplina").addEventListener("change", () => { fillTipos(); updateHint(); });
  f("sector").addEventListener("input", () => {
    const el = f("sector"); const pos = el.selectionStart;
    el.value = el.value.toUpperCase().replace(/[\s.]/g, ""); try { el.setSelectionRange(pos, pos); } catch (e) { /* sin selección */ }
    const known = sectores()[el.value]; if (known !== undefined) f("sectorNombre").value = known;
  });
  const form = $("actForm");
  form.addEventListener("input", updateHint);
  form.addEventListener("change", updateHint);
  form.addEventListener("submit", submit);
  f("inicio").addEventListener("change", () => { if (f("inicio").value && !f("fin").value) f("fin").value = f("inicio").value; updateHint(); });
  $("cancelEdit").addEventListener("click", () => { resetForm(); renderTable(); });
  $("clearForm").addEventListener("click", () => { resetForm(); renderTable(); });
  $("freezeBtn").addEventListener("click", freezeDialog);
  $("search").addEventListener("input", renderTable);
  $("filterDisc").addEventListener("change", renderTable);
  $("tbody").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const uid = b.dataset.uid;
    if (b.dataset.act === "edit") startEdit(uid);
    else if (b.dataset.act === "del") { state.confirmDel = uid; renderTable(); }
    else if (b.dataset.act === "del-no") { state.confirmDel = null; renderTable(); }
    else if (b.dataset.act === "del-yes") onDelete(uid);
  });
}
