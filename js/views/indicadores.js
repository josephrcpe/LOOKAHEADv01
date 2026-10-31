// Pestaña "Indicadores": control del proyecto en HH (alternativa B: solo HH, avance por metrados).
// Los cálculos están en model/metrics.js; aquí solo se presentan.

import { CAUSAS, PAC_META, name, tipoName } from "../config.js";
import { $, esc, fmtN, fmtPct, fmt } from "../util.js";
import { state, latestBaseline } from "../state.js";
import { sCurve, kpisAtCut, pacSeries, personalSemanal, paretoPerdidas, productividadPorTipo, causasNC } from "../model/metrics.js";
import { lineChart, barChart, hbarChart, bindTooltips } from "./charts.js";

const wLabel = (w, i) => `S${i + 1}`;
const width = (id) => Math.max(320, ($(id)?.clientWidth || 640) - 4);
const idx = (w, weeks) => weeks.indexOf(w);

export function renderIndicadores() {
  const box = $("indBody");
  if (!state.acts.length) { box.innerHTML = '<div class="empty"><strong>Sin datos</strong><span>Registra actividades y ejecución para ver los indicadores.</span></div>'; $("indKpis").innerHTML = ""; return; }
  const k = kpisAtCut();
  const kpi = (l, v, s, tone) => `<div class="kpi${tone ? " " + tone : ""}"><span class="eyebrow">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  const tone = (x) => (x == null ? "" : x >= 0.98 ? "good" : x >= 0.9 ? "warn" : "bad");
  $("indKpis").innerHTML = [
    kpi("BAC", fmtN(k.bac), `HH presupuestadas${latestBaseline() ? ` (LB v${latestBaseline().version})` : " (sin línea base)"}`),
    kpi("PV", k.cut != null ? fmtN(k.pv) : "—", k.cut != null ? `planificado al ${fmt(k.cut + 6)} · ${fmtPct(k.avancePlan)}` : "sin corte aún"),
    kpi("EV", k.cut != null ? fmtN(k.ev) : "—", k.cut != null ? `ganado · avance ${fmtPct(k.avance, 1)}` : "avance por metrados"),
    kpi("AC", k.cut != null ? fmtN(k.ac) : "—", "HH reales (trabajadas + extra)"),
    kpi("SPI", k.spi != null ? fmtN(k.spi, 2) : "—", k.spi == null ? "EV / PV" : k.avance >= 0.999 ? "terminado: el SPI vuelve a 1, mira el atraso en Gantt real" : k.spi >= 1 ? "adelantado o en plazo" : "atrasado", tone(k.spi)),
    kpi("CPI (HH)", k.cpi != null ? fmtN(k.cpi, 2) : "—", k.cpi == null ? "EV / AC" : k.cpi >= 1 ? "rinde mejor que el plan" : "consume más HH que el plan", tone(k.cpi)),
    kpi("EAC", k.eac != null ? fmtN(k.eac) : "—", k.eac != null ? `HH al terminar (${k.eac > k.bac ? "+" : ""}${fmtN(k.eac - k.bac)} vs BAC)` : "BAC / CPI"),
  ].join("");

  const s = sCurve(); const weeks = s.weeks.map((x) => x.w); const labels = weeks.map(wLabel);
  const cutI = s.cut != null ? idx(s.cut, weeks) : null;
  const pac = pacSeries(); const pers = personalSemanal(); const par = paretoPerdidas(); const pf = productividadPorTipo(); const nc = causasNC();
  const panel = (id, title, sub, body) => `<div class="panel chart-panel" id="${id}"><div class="panel-head"><div><h2>${title}</h2><div class="help">${sub}</div></div></div>${body}</div>`;
  box.innerHTML = `
    ${panel("chS", "Curva S en HH", "Acumulado semanal. PV de la línea base; EV y AC hasta el último corte.", '<div class="chart-box" id="chS-c"></div><details class="tbl"><summary>Ver tabla</summary><div class="scroll-x" id="chS-t"></div></details>')}
    <div class="ind-grid">
      ${panel("chP", "PAC semanal", "Compromisos cumplidos sobre comprometidos en el plan semanal congelado. Meta " + fmtPct(PAC_META) + ".", '<div class="chart-box" id="chP-c"></div><div id="chP-nc"></div>')}
      ${panel("chH", "Personal por semana", "Promedio de personas por día laborable: plan (línea base) frente a real.", '<div class="chart-box" id="chH-c"></div>')}
      ${panel("chL", "HH perdidas por causa", "Pareto: el % acumulado sobre cada barra muestra qué pocas causas explican la mayoría.", '<div class="chart-box" id="chL-c"></div>')}
      ${panel("chF", "Factor de productividad por tipo", "HH reales ÷ HH ganadas al corte. 1,0 = según plan; mayor que 1 = más HH de las previstas.", '<div class="chart-box" id="chF-c"></div>')}
    </div>`;

  $("chS-c").innerHTML = lineChart({ width: width("chS-c"), height: 280, labels, marker: cutI != null && cutI >= 0 ? { i: cutI, label: "corte" } : null,
    series: [
      { name: "PV · planificado", short: "PV", color: "--s1", values: s.weeks.map((x) => x.pvCum) },
      { name: "EV · ganado", short: "EV", color: "--s2", values: s.weeks.map((x) => x.evCum) },
      { name: "AC · real", short: "AC", color: "--s3", values: s.weeks.map((x) => x.acCum) },
    ], tipFmt: (v) => fmtN(v) + " HH" });
  $("chS-t").innerHTML = `<table><thead><tr><th>Semana</th><th>Lunes</th><th class="num">PV sem.</th><th class="num">PV acum.</th><th class="num">EV acum.</th><th class="num">AC sem.</th><th class="num">AC acum.</th><th class="num">SPI</th><th class="num">CPI</th></tr></thead><tbody>${s.weeks.map((x, i) => `<tr><td>${labels[i]}</td><td class="mono">${fmt(x.w, true)}</td><td class="mono num">${fmtN(x.pv)}</td><td class="mono num">${fmtN(x.pvCum)}</td><td class="mono num">${x.evCum == null ? "—" : fmtN(x.evCum)}</td><td class="mono num">${x.ac == null ? "—" : fmtN(x.ac)}</td><td class="mono num">${x.acCum == null ? "—" : fmtN(x.acCum)}</td><td class="mono num">${x.evCum != null && x.pvCum ? fmtN(x.evCum / x.pvCum, 2) : "—"}</td><td class="mono num">${x.evCum != null && x.acCum ? fmtN(x.evCum / x.acCum, 2) : "—"}</td></tr>`).join("")}</tbody></table>`;

  const pacByW = new Map(pac.map((p) => [p.w, p]));
  $("chP-c").innerHTML = pac.length ? barChart({ width: width("chP-c"), labels, max: 1, yFmt: (v) => fmtPct(v),
    series: [{ name: "PAC", color: "--s1", values: weeks.map((w) => pacByW.get(w)?.pac ?? null) }], ref: { value: PAC_META, label: "meta " + fmtPct(PAC_META) },
    valueLabels: (v) => fmtPct(v), tipFmt: (v, i) => { const p = pacByW.get(weeks[i]); return `${fmtPct(v)} (${p.cumplidas} de ${p.comprometidas})${p.congelado ? "" : " · sin plan congelado"}`; } })
    : '<div class="help">Congela planes semanales y carga cortes para ver el PAC.</div>';
  $("chP-nc").innerHTML = nc.length ? `<div class="help" style="margin-top:8px">Causas de no cumplimiento: ${nc.slice(0, 4).map((x) => `<span class="code">${esc(x.causa)}</span> ${esc(name(CAUSAS, x.causa))} (${x.n})`).join(" · ")}</div>` : "";

  $("chH-c").innerHTML = barChart({ width: width("chH-c"), labels, series: [
    { name: "Plan (LB)", color: "--s1", values: pers.map((x) => x.plan) },
    { name: "Real", color: "--s2", values: pers.map((x) => x.real) },
  ], tipFmt: (v) => fmtN(v, 1) + " personas/día" });

  $("chL-c").innerHTML = par.rows.length ? hbarChart({ width: width("chL-c"), labelW: 230, rows: par.rows.map((r) => ({ label: name(CAUSAS, r.causa), value: r.hh, note: fmtPct(r.acumPct) + " acum.", tip: `${r.causa} · ${name(CAUSAS, r.causa)}\n${fmtN(r.hh, 1)} HH perdidas · ${fmtPct(r.hh / par.total, 1)} del total\nAcumulado: ${fmtPct(r.acumPct)}` })), xFmt: (v) => fmtN(v) + " HH" })
    : '<div class="help">Sin pérdidas registradas.</div>';

  $("chF-c").innerHTML = pf.length ? hbarChart({ width: width("chF-c"), labelW: 230, ref: { value: 1, label: "1,0 = plan" },
    rows: pf.sort((a, b) => b.pf - a.pf).map((x) => ({ label: `${x.tipo} · ${tipoName(x.tipo)}`, value: x.pf, tip: `${x.tipo} · ${tipoName(x.tipo)} (${x.n} actividades)\nHH reales ${fmtN(x.ac)} · HH ganadas ${fmtN(x.ev)}\nFactor ${fmtN(x.pf, 2)}` })), xFmt: (v) => fmtN(v, 2) })
    : '<div class="help">Se calcula cuando hay avance por metrados registrado.</div>';
}

let resizeT = null;
export function initIndicadores() {
  bindTooltips($("view-indicadores"));
  window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (!$("view-indicadores").hidden) renderIndicadores(); }, 200); });
}
