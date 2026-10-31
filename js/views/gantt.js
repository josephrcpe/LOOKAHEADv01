// Pestaña "Diagrama de Gantt": lookahead de 21 días del programa vigente, agrupado en dos niveles
// (Sector/Zona › Disciplina o al revés), con personal por día, totales y la línea base como sombra.

import { DISC, DOW, MS, discIdx, tipoName } from "../config.js";
import { $, esc, num, fmtN, toDay, dow, todayDay, fmt, fmtIso, CHEV } from "../util.js";
import { state, ui, saveUi, horasDia, sectores, sectorLabel, startDay, isWork, personalOn, hhPlan, durOf, byUid, sortActs, inHorizon, predConflict, latestBaseline, blOf, openRestr, latestReg } from "../state.js";
import { swatch, discOptions, startEdit } from "./entrada.js";

const DAYS = 21;

function ganttActs() {
  const fd = $("gDisc").value, fs = $("gSector").value, fr = $("gResp").value;
  return sortActs(state.acts).filter(inHorizon).filter((a) => (!fd || a.disciplina === fd) && (!fs || a.sector === fs) && (!fr || (a.resp || "") === fr));
}

// Árbol de dos niveles: [{ key, children: [{ key, acts }] }]. Lo usa también el Excel.
export function groupTree(list, group = ui.group) {
  const k1 = group === "disc" ? (a) => a.disciplina : (a) => a.sector;
  const k2 = group === "disc" ? (a) => a.sector : (a) => a.disciplina;
  const ord1 = group === "disc" ? (a, b) => discIdx(a) - discIdx(b) : (a, b) => a.localeCompare(b);
  const ord2 = group === "disc" ? (a, b) => a.localeCompare(b) : (a, b) => discIdx(a) - discIdx(b);
  const tree = new Map();
  for (const a of list) {
    const a1 = k1(a), a2 = k2(a);
    if (!tree.has(a1)) tree.set(a1, new Map());
    const m = tree.get(a1); if (!m.has(a2)) m.set(a2, []); m.get(a2).push(a);
  }
  return [...tree.keys()].sort(ord1).map((g1) => ({ key: g1, children: [...tree.get(g1).keys()].sort(ord2).map((g2) => ({ key: g2, acts: tree.get(g1).get(g2) })) }));
}
export const dailyTotals = (list) => { const h0 = startDay(); return Array.from({ length: DAYS }, (_, i) => list.reduce((s, a) => s + personalOn(a, h0 + i), 0)); };

const offClass = (day) => (isWork(day) ? "" : " off");
function bgCells() { const h0 = startDay(); let s = ""; for (let i = 0; i < DAYS; i++) s += `<div class="g-cell${offClass(h0 + i)}" style="grid-column:${i + 2}"></div>`; return s; }
const sumCells = (tot, peak) => tot.map((v, i) => `<div class="sum${peak && v && v === peak ? " peak" : ""}" style="grid-column:${i + 2}">${v || ""}</div>`).join("");
function band(list, color) {
  const h0 = startDay();
  const s = Math.max(Math.min(...list.map((a) => toDay(a.inicio))), h0) - h0;
  const e = Math.min(Math.max(...list.map((a) => toDay(a.fin))), h0 + DAYS - 1) - h0;
  return `<div class="band" style="grid-column:${s + 2} / ${e + 3};--band:${color}"></div>`;
}
function groupLabel(level, key) {
  const isDisc = (ui.group === "disc") === (level === 1);
  return isDisc ? `${swatch(key)}${esc(key)}` : `<span class="mono">${esc(key)}</span>${sectores()[key] ? ` <span style="font-weight:400;color:var(--muted)">· ${esc(sectores()[key])}</span>` : ""}`;
}
function groupColor(level, key, parentKey) {
  const disc = (ui.group === "disc") === (level === 1) ? key : level === 2 ? parentKey : null;
  return disc ? `var(${DISC[discIdx(disc)].cssVar})` : "var(--muted)";
}

function actRow(a, bg, h0, h1) {
  const s = toDay(a.inicio), e = toDay(a.fin);
  const cs = Math.max(s, h0) - h0, ce = Math.min(e, h1) - h0;
  const conf = predConflict(a); const p = a.pred && byUid(a.pred);
  const nr = openRestr(a.uid).length;
  const lr = latestReg(a.uid); const av = lr && lr.avance != null ? num(lr.avance) : null;
  const meta = [a.tipo + " · " + tipoName(a.tipo), a.especialidad, a.nivel && "Niv. " + a.nivel, a.ejes && "Ejes " + a.ejes, p && "Pred. " + p.idTarea].filter(Boolean).map(esc).join(" · ");
  const tip = [`${a.idTarea} · ${a.desc}`, `${fmtIso(a.inicio)} → ${fmtIso(a.fin)} (${durOf(a)} días)`, `Personal: ${a.personal ?? 0} por día laborable · ${fmtN(hhPlan(a))} HH plan`,
    av != null && `Avance por metrados: ${fmtN(av)} %`, nr && `${nr} restricción(es) abierta(s)`, a.resp && "Responsable: " + a.resp, a.plano && "Plano: " + a.plano,
    p && "Predecesora: " + p.idTarea + (conf ? " (traslape)" : ""), a.obs && "Obs.: " + a.obs].filter(Boolean).join("\n");
  let cells = "";
  for (let i = cs; i <= ce; i++) cells += isWork(h0 + i) ? `<span>${a.personal ?? 0}</span>` : '<span class="offd">0</span>';
  const b = blOf(a.uid); let bl = "";
  if (b && toDay(b.fin) >= h0 && toDay(b.inicio) <= h1) {
    const bs = Math.max(toDay(b.inicio), h0) - h0, be = Math.min(toDay(b.fin), h1) - h0;
    bl = `<div class="blbar" style="grid-column:${bs + 2} / ${be + 3}" title="Línea base: ${esc(fmtIso(b.inicio))} → ${esc(fmtIso(b.fin))}"></div>`;
  }
  const cls = `bar${s < h0 ? " cut-l" : ""}${e > h1 ? " cut-r" : ""}${conf ? " conflict" : ""}`;
  return `<div class="g-row g-act"><div class="g-label"><div class="g-title"><span class="code">${esc(a.idTarea)}</span><span title="${esc(a.desc)}">${esc(a.desc)}</span></div><div class="g-meta">${nr ? `<span class="pill warn">${nr} restr.</span> ` : ""}${meta}</div></div>${bg}${bl}
    <button class="${cls}" style="grid-column:${cs + 2} / ${ce + 3};grid-template-columns:repeat(${ce - cs + 1},1fr);--bar:var(${DISC[discIdx(a.disciplina)].cssVar})" title="${esc(tip)}" data-uid="${esc(a.uid)}" aria-label="${esc(a.idTarea)}: ${esc(a.desc)}">${cells}${av != null ? `<i class="prog" style="width:${Math.min(100, Math.max(0, av))}%"></i>` : ""}</button></div>`;
}

export function renderGantt() {
  $("gDisc").innerHTML = discOptions($("gDisc").value, "Todas las disciplinas");
  const gs = $("gSector").value, gr = $("gResp").value;
  const secs = [...new Set(state.acts.map((a) => a.sector).filter(Boolean))].sort();
  $("gSector").innerHTML = '<option value="">Todos los sectores</option>' + secs.map((x) => `<option value="${esc(x)}"${x === gs ? " selected" : ""}>${esc(sectorLabel(x))}</option>`).join("");
  const resps = [...new Set(state.acts.map((a) => a.resp).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  $("gResp").innerHTML = '<option value="">Todos los responsables</option>' + resps.map((x) => `<option value="${esc(x)}"${x === gr ? " selected" : ""}>${esc(x)}</option>`).join("");
  $("gGroup").value = ui.group;

  const h0 = startDay(), t = todayDay(), h1 = h0 + DAYS - 1;
  const all = state.acts.filter(inHorizon);
  const shown = ganttActs();
  const bg = bgCells();

  let html = '<div class="g-row g-head"><div class="g-label">Actividad</div>';
  for (let w = 0; w < 3; w++) { const s = h0 + w * 7; html += `<div class="g-week" style="grid-column:${2 + w * 7} / span 7">Semana ${w + 1}<span>${fmt(s)} – ${fmt(s + 6)}</span></div>`; }
  html += '</div><div class="g-row g-head"><div class="g-label">Id Tarea · descripción</div>';
  for (let i = 0; i < DAYS; i++) { const d = h0 + i; html += `<div class="g-day${offClass(d)}${d === t ? " today" : ""}" style="grid-column:${i + 2}">${DOW[dow(d)]}<b>${new Date(d * MS).getUTCDate()}</b></div>`; }
  html += '</div><div class="gantt-body">';

  for (const g1 of groupTree(shown)) {
    const k1 = "1:" + ui.group + ":" + g1.key; const c1 = ui.collapsed.has(k1);
    const acts1 = g1.children.flatMap((c) => c.acts);
    html += `<div class="g-row g-group l1${c1 ? " collapsed" : ""}"><div class="g-label"><button class="chev" data-key="${esc(k1)}" aria-expanded="${!c1}">${CHEV}<span class="lbl">${groupLabel(1, g1.key)}</span></button><span class="pill">${acts1.length}</span></div>${bg}${band(acts1, groupColor(1, g1.key))}${sumCells(dailyTotals(acts1))}</div>`;
    if (c1) continue;
    for (const g2 of g1.children) {
      const k2 = "2:" + ui.group + ":" + g1.key + "|" + g2.key; const c2 = ui.collapsed.has(k2);
      html += `<div class="g-row g-group l2${c2 ? " collapsed" : ""}"><div class="g-label"><button class="chev" data-key="${esc(k2)}" aria-expanded="${!c2}">${CHEV}<span class="lbl">${groupLabel(2, g2.key)}</span></button><span class="pill">${g2.acts.length}</span></div>${bg}${band(g2.acts, groupColor(2, g2.key, g1.key))}${sumCells(dailyTotals(g2.acts))}</div>`;
      if (c2) continue;
      for (const a of g2.acts) html += actRow(a, bg, h0, h1);
    }
  }
  if (!shown.length) {
    const msg = state.mode === "connecting" ? "Cargando actividades…" : state.acts.length ? (all.length ? "Ninguna actividad coincide con los filtros." : "Ninguna actividad cae dentro de estas 3 semanas. Mueve el inicio del lookahead o registra actividades en este periodo.") : "Aún no hay actividades. Regístralas en la pestaña Entrada y aparecerán aquí como barras.";
    html += `<div class="g-row"><div class="g-label" style="grid-column:1 / -1;position:static;border:0;padding:28px 16px;text-align:center;color:var(--muted)">${esc(msg)}</div></div>`;
  } else {
    for (const d of DISC) {
      const list = shown.filter((a) => a.disciplina === d.name); if (!list.length) continue;
      html += `<div class="g-row g-foot"><div class="g-label">${swatch(d.name)}Personal · ${esc(d.name)}</div>${bg}${sumCells(dailyTotals(list))}</div>`;
    }
    const tot = dailyTotals(shown); const peak = Math.max(...tot);
    html += `<div class="g-row g-foot total"><div class="g-label">Personal total por día</div>${sumCells(tot, peak)}</div>`;
  }
  const ti = t - h0;
  if (ti >= 0 && ti < DAYS && shown.length) html += `<div class="today-line" style="left:calc(var(--label) + (100% - var(--label)) * ${(ti + 0.5) / DAYS})"></div>`;
  html += "</div>";
  $("gantt").innerHTML = html;

  const notes = [];
  if (shown.length) {
    const tot = dailyTotals(shown); const peak = Math.max(...tot); const pi = tot.indexOf(peak);
    const dh = tot.reduce((s, v) => s + v, 0);
    notes.push(`Pico de personal: ${peak} el ${fmt(h0 + pi)}. Total en el horizonte: ${fmtN(dh)} días-hombre (${fmtN(dh * horasDia())} HH).`);
  }
  const out = state.acts.length - all.length;
  if (out > 0) notes.push(`${out} ${out === 1 ? "actividad queda" : "actividades quedan"} fuera de este horizonte.`);
  if (all.some(predConflict)) notes.push("El contorno naranja marca actividades que empiezan antes de que termine su predecesora.");
  notes.push("Los números de cada barra son el personal asignado por día; los días rayados no son laborables. Pulsa una barra para editarla.");
  $("ganttNote").textContent = notes.join(" ");
  $("legend").innerHTML = DISC.map((d) => `<span>${swatch(d.name)}${esc(d.name)}</span>`).join("")
    + (latestBaseline() ? `<span><span class="lb-key"></span>Línea base v${latestBaseline().version}</span>` : "")
    + '<span><span class="pg-key"></span>Avance por metrados</span>';
}

export function initGantt() {
  for (const id of ["gDisc", "gSector", "gResp"]) $(id).addEventListener("change", renderGantt);
  $("gGroup").addEventListener("change", (e) => { ui.group = e.target.value; saveUi(); renderGantt(); });
  $("gantt").addEventListener("click", (e) => {
    const c = e.target.closest(".chev");
    if (c) { const k = c.dataset.key; ui.collapsed.has(k) ? ui.collapsed.delete(k) : ui.collapsed.add(k); saveUi(); renderGantt(); return; }
    const b = e.target.closest(".bar"); if (b && !state.readOnly) startEdit(b.dataset.uid);
  });
  $("expandAll").addEventListener("click", () => { ui.collapsed.clear(); saveUi(); renderGantt(); });
  $("collapseAll").addEventListener("click", () => {
    for (const g1 of groupTree(ganttActs())) { ui.collapsed.add("1:" + ui.group + ":" + g1.key); for (const g2 of g1.children) ui.collapsed.add("2:" + ui.group + ":" + g1.key + "|" + g2.key); }
    saveUi(); renderGantt();
  });
}
