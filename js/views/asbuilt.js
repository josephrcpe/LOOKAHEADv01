// Pestaña "Gantt real": todo el proyecto en una línea de tiempo. Por actividad se dibujan
//   - la línea base (cronograma proyectado, barra gris delgada),
//   - lo ejecutado según los registros semanales (segmentos sólidos; los huecos son días sin trabajo),
//   - el pronóstico restante del programa vigente (contorno punteado) si aún no termina.
// Es la comparación "proyectado vs real" que queda como as-built al cerrar el proyecto.

import { DISC, discIdx, tipoName } from "../config.js";
import { $, esc, fmtN, toDay, toIso, todayDay, fmt, fmtIso } from "../util.js";
import { state, P, sectores, sortActs, blOf, latestBaseline } from "../state.js";
import { weekRange, cutWeek, asBuiltSegments, avanceAt } from "../model/metrics.js";
import { swatch, discOptions } from "./entrada.js";

const DAY_W = 14; // px por día

function rowsData() {
  const fd = $("abDisc").value;
  const jornada = P().jornada;
  const cut = cutWeek(); const cutEnd = cut != null ? cut + 6 : null;
  return sortActs(state.acts).filter((a) => !fd || a.disciplina === fd).map((a) => {
    const b = blOf(a.uid);
    const { segs, inicioReal, finReal } = asBuiltSegments(a.uid, jornada);
    const done = !!finReal;
    const finPron = done ? finReal : a.fin;
    const delta = b ? toDay(finPron) - toDay(b.fin) : null;
    const av = cut != null ? avanceAt(a.uid, toIso(cut)) : 0;
    // Pronóstico restante: del día siguiente al corte (o al inicio vigente) hasta el fin vigente.
    let pron = null;
    if (!done) { const p0 = Math.max(toDay(a.inicio), cutEnd != null ? cutEnd + 1 : -Infinity); if (p0 <= toDay(a.fin)) pron = { d0: p0, d1: toDay(a.fin) }; }
    return { a, b, segs, inicioReal, finReal, done, finPron, delta, av, pron };
  });
}

export function renderAsBuilt() {
  $("abDisc").innerHTML = discOptions($("abDisc").value, "Todas las disciplinas");
  const weeks = weekRange();
  const box = $("asbuilt");
  if (!weeks.length) { box.innerHTML = '<div class="empty"><strong>Sin actividades</strong><span>Registra actividades y ejecución para ver el Gantt real.</span></div>'; $("abNote").textContent = ""; $("abKpis").innerHTML = ""; return; }
  const d0 = weeks[0], nDays = weeks.length * 7;
  const x = (d) => (d - d0) * DAY_W;
  const span = (s, e) => `left:${x(s)}px;width:${Math.max(DAY_W * 0.6, (e - s + 1) * DAY_W - 2)}px`;
  const cut = cutWeek(); const t = todayDay();
  const data = rowsData();

  let html = `<div class="ab" style="--track:${nDays * DAY_W}px"><div class="ab-row ab-head"><div class="ab-label">Actividad <span class="help">Δ fin vs LB</span></div><div class="ab-track">`;
  weeks.forEach((w, i) => { html += `<div class="ab-week" style="left:${x(w)}px;width:${7 * DAY_W}px"><b>S${i + 1}</b> ${fmt(w)}</div>`; });
  html += "</div></div>";
  const grid = weeks.map((w) => `<i class="ab-grid" style="left:${x(w)}px"></i>`).join("")
    + (cut != null ? `<i class="ab-cut" style="left:${x(cut + 7)}px" title="Corte: ${esc(fmt(cut + 6, true))}"></i>` : "")
    + (t >= d0 && t < d0 + nDays ? `<i class="ab-today" style="left:${x(t) + DAY_W / 2}px"></i>` : "");

  const groups = [...new Set(data.map((r) => r.a.sector))].sort();
  for (const g of groups) {
    const rows = data.filter((r) => r.a.sector === g);
    html += `<div class="ab-row ab-group"><div class="ab-label"><span class="mono">${esc(g)}</span>${sectores()[g] ? ` <span class="help">· ${esc(sectores()[g])}</span>` : ""}<span class="pill">${rows.length}</span></div><div class="ab-track">${grid}</div></div>`;
    for (const r of rows) {
      const { a, b } = r; const color = `var(${DISC[discIdx(a.disciplina)].cssVar})`;
      const dl = r.delta == null ? '<span class="pill info">sin LB</span>' : r.delta > 0 ? `<span class="pill warn">+${r.delta} d</span>` : r.delta < 0 ? `<span class="pill ok">${r.delta} d</span>` : '<span class="pill">0 d</span>';
      const bl = b ? `<div class="ab-bl" style="${span(toDay(b.inicio), toDay(b.fin))}" title="Proyectado (LB v${latestBaseline().version}): ${esc(fmtIso(b.inicio))} → ${esc(fmtIso(b.fin))}"></div>` : "";
      const segs = r.segs.map((s) => `<div class="ab-real" style="${span(s.d0, s.d1)};--c:${color}" title="Real: ${esc(fmt(s.d0))} → ${esc(fmt(s.d1))} (${s.d1 - s.d0 + 1} d calendario)"></div>`).join("");
      const pron = r.pron ? `<div class="ab-pron" style="${span(r.pron.d0, r.pron.d1)};--c:${color}" title="Pronóstico (programa vigente): ${esc(fmt(r.pron.d0))} → ${esc(fmtIso(a.fin))}"></div>` : "";
      const tip = `${a.idTarea} · ${a.desc}\nProyectado: ${b ? fmtIso(b.inicio) + " → " + fmtIso(b.fin) : "—"}\nReal: ${r.inicioReal ? fmtIso(r.inicioReal) : "sin iniciar"} → ${r.finReal ? fmtIso(r.finReal) : "en curso"}\nAvance por metrados: ${fmtN(r.done ? 100 : r.av)} %`;
      html += `<div class="ab-row ab-act" title="${esc(tip)}"><div class="ab-label"><div class="g-title"><span class="code">${esc(a.idTarea)}</span><span>${esc(a.desc)}</span></div><div class="g-meta">${dl} ${r.done ? '<span class="pill ok">terminada</span>' : r.segs.length ? `${fmtN(r.av)} %` : "sin iniciar"} · ${esc(a.tipo)} · ${esc(tipoName(a.tipo))}${a.noPlanificada ? ' · <span class="pill info">no planificada</span>' : ""}</div></div>
        <div class="ab-track">${grid}${bl}${pron}${segs}</div></div>`;
    }
  }
  html += "</div>";
  box.innerHTML = html;

  // Resumen del proyecto.
  const withB = data.filter((r) => r.b);
  const lbEnd = withB.length ? Math.max(...withB.map((r) => toDay(r.b.fin))) : null;
  const pronEnd = data.length ? Math.max(...data.map((r) => toDay(r.finPron))) : null;
  const late = data.filter((r) => r.delta > 0).length, done = data.filter((r) => r.done).length;
  const kpi = (l, v, s) => `<div class="kpi"><span class="eyebrow">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  $("abKpis").innerHTML = [
    kpi("Fin proyectado", lbEnd != null ? fmt(lbEnd, true) : "—", "según línea base"),
    kpi(done === data.length ? "Fin real" : "Fin pronosticado", pronEnd != null ? fmt(pronEnd, true) : "—", lbEnd != null && pronEnd != null ? `${pronEnd - lbEnd > 0 ? "+" : ""}${pronEnd - lbEnd} días contra la LB` : "real + programa vigente"),
    kpi("Terminadas", `${done}/${data.length}`, "con fecha real de fin"),
    kpi("Con atraso", String(late), "fin real o pronosticado después de la LB"),
  ].join("");
  $("abNote").textContent = cut != null
    ? `Datos reales hasta el corte del ${fmt(cut + 6, true)} (línea vertical oscura). Los huecos entre segmentos reales son semanas o días sin trabajo registrado.`
    : "Aún no hay registros de ejecución: solo se ve el cronograma proyectado.";
  $("abLegend").innerHTML = '<span><span class="lg ab-bl-k"></span>Proyectado (línea base)</span>'
    + DISC.map((d) => `<span>${swatch(d.name)}Real · ${esc(d.short)}</span>`).join("")
    + '<span><span class="lg ab-pron-k"></span>Pronóstico restante</span><span><span class="lg ab-cut-k"></span>Corte</span>';
}

export function initAsBuilt() { $("abDisc").addEventListener("change", renderAsBuilt); }
