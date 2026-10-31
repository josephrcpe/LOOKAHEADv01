// Gráficos SVG mínimos para Indicadores (sin librerías). Reglas: un solo eje Y por gráfico, marcas finas,
// leyenda cuando hay 2 o más series, etiqueta directa al final de cada línea y tooltip al pasar el cursor.
// Los colores de serie vienen de tokens CSS (--s1, --s2, --s3) validados para modo claro y oscuro.

import { esc, fmtN } from "../util.js";

const M = { t: 16, r: 64, b: 34, l: 52 }; // márgenes (el derecho deja sitio a las etiquetas directas)

// Escala "bonita" para el eje Y: devuelve el máximo y los ticks.
function niceTicks(max, n = 4) {
  if (!(max > 0)) return { max: 1, ticks: [0, 1] };
  const raw = max / n; const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw);
  const top = Math.ceil(max / step) * step;
  const ticks = []; for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return { max: top, ticks };
}
const legend = (series) => `<div class="legend chart-legend">${series.map((s) => `<span><span class="lg-line" style="background:var(${s.color})${s.dash ? ";opacity:.7" : ""}"></span>${esc(s.name)}</span>`).join("")}</div>`;

function frame(w, h, yt, yFmt) {
  const ih = h - M.t - M.b;
  return yt.ticks.map((v) => { const y = M.t + ih - (v / yt.max) * ih; return `<line class="c-grid" x1="${M.l}" x2="${w - M.r}" y1="${y}" y2="${y}"/><text class="c-tick" x="${M.l - 6}" y="${y + 4}" text-anchor="end">${esc(yFmt(v))}</text>`; }).join("");
}

// Líneas sobre categorías (semanas). series: [{ name, color, values: [num|null], dash }].
export function lineChart({ width, height = 260, labels, series, yFmt = (v) => fmtN(v), tipFmt = (v) => fmtN(v), marker }) {
  const w = Math.max(320, width), h = height, iw = w - M.l - M.r, ih = h - M.t - M.b;
  const max = Math.max(0, ...series.flatMap((s) => s.values.filter((v) => v != null)));
  const yt = niceTicks(max);
  const X = (i) => M.l + (labels.length <= 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const Y = (v) => M.t + ih - (v / yt.max) * ih;
  let svg = frame(w, h, yt, yFmt);
  const every = Math.ceil(labels.length / Math.max(2, Math.floor(iw / 64)));
  labels.forEach((l, i) => { if (i % every === 0) svg += `<text class="c-tick" x="${X(i)}" y="${h - M.b + 18}" text-anchor="middle">${esc(l)}</text>`; });
  if (marker != null) svg += `<line class="c-marker" x1="${X(marker.i)}" x2="${X(marker.i)}" y1="${M.t}" y2="${M.t + ih}"/><text class="c-tick" x="${X(marker.i) + 4}" y="${M.t + 10}">${esc(marker.label)}</text>`;
  const used = [];
  for (const s of series) {
    const pts = s.values.map((v, i) => (v == null ? null : [X(i), Y(v)]));
    let d = ""; pts.forEach((p, i) => { if (p) d += (d && pts[i - 1] ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); });
    svg += `<path d="${d}" fill="none" stroke="var(${s.color})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="5 4"' : ""}/>`;
    const lastI = pts.map((p, i) => (p ? i : -1)).filter((i) => i >= 0).pop();
    if (lastI != null) {
      let ly = pts[lastI][1] + 4; while (used.some((u) => Math.abs(u - ly) < 12)) ly += 12; used.push(ly);
      svg += `<circle cx="${pts[lastI][0]}" cy="${pts[lastI][1]}" r="4" fill="var(${s.color})" stroke="var(--surface)" stroke-width="2"/><text class="c-lbl" x="${pts[lastI][0] + 8}" y="${ly}">${esc(s.short || s.name)}</text>`;
    }
  }
  // Zonas de cursor por semana: tooltip con todas las series y línea guía.
  const colW = labels.length > 1 ? iw / (labels.length - 1) : iw;
  labels.forEach((l, i) => {
    const tip = `${l}\n` + series.map((s) => `${s.name}: ${s.values[i] == null ? "—" : tipFmt(s.values[i])}`).join("\n");
    svg += `<rect class="c-hit" x="${X(i) - colW / 2}" y="${M.t}" width="${colW}" height="${ih}" data-tip="${esc(tip)}" data-x="${X(i)}"/>`;
  });
  svg += `<line class="c-cross" x1="0" x2="0" y1="${M.t}" y2="${M.t + ih}" hidden/>`;
  return `${series.length > 1 ? legend(series) : ""}<svg class="chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">${svg}</svg>`;
}

// Barras verticales agrupadas. series: [{ name, color, values }]. ref: { value, label } línea de referencia.
export function barChart({ width, height = 240, labels, series, yFmt = (v) => fmtN(v), tipFmt = (v) => fmtN(v), ref, max: fixedMax, valueLabels }) {
  const w = Math.max(320, width), h = height, iw = w - M.l - 16, ih = h - M.t - M.b;
  const max = fixedMax ?? Math.max(0, ref?.value || 0, ...series.flatMap((s) => s.values.filter((v) => v != null)));
  const yt = fixedMax ? { max: fixedMax, ticks: [0, .25, .5, .75, 1].map((k) => k * fixedMax) } : niceTicks(max);
  const Y = (v) => M.t + ih - (v / yt.max) * ih;
  let svg = frame(w + M.r - 16, h, yt, yFmt);
  const band = iw / Math.max(1, labels.length); const gap = 2;
  const bw = Math.max(3, Math.min(28, (band * 0.72 - gap * (series.length - 1)) / series.length));
  const every = Math.ceil(labels.length / Math.max(2, Math.floor(iw / 56)));
  labels.forEach((l, i) => {
    const cx = M.l + band * i + band / 2; const x0 = cx - (bw * series.length + gap * (series.length - 1)) / 2;
    series.forEach((s, j) => {
      const v = s.values[i]; if (v == null) return;
      const x = x0 + j * (bw + gap), y = Y(v), hh = M.t + ih - y;
      svg += `<path d="M${x},${M.t + ih}V${y + Math.min(4, hh)}q0,-${Math.min(4, hh)} ${Math.min(4, hh)},-${Math.min(4, hh)}H${x + bw - Math.min(4, hh)}q${Math.min(4, hh)},0 ${Math.min(4, hh)},${Math.min(4, hh)}V${M.t + ih}Z" fill="var(${s.color})"/>`;
      if (valueLabels && v > 0) svg += `<text class="c-val" x="${x + bw / 2}" y="${y - 4}" text-anchor="middle">${esc(valueLabels(v, i, j))}</text>`;
    });
    if (i % every === 0) svg += `<text class="c-tick" x="${cx}" y="${h - M.b + 18}" text-anchor="middle">${esc(l)}</text>`;
    const tip = `${l}\n` + series.map((s) => `${s.name}: ${s.values[i] == null ? "—" : tipFmt(s.values[i], i)}`).join("\n");
    svg += `<rect class="c-hit" x="${M.l + band * i}" y="${M.t}" width="${band}" height="${ih}" data-tip="${esc(tip)}"/>`;
  });
  if (ref) svg += `<line class="c-ref" x1="${M.l}" x2="${M.l + iw}" y1="${Y(ref.value)}" y2="${Y(ref.value)}"/><text class="c-tick" x="${M.l + iw}" y="${Y(ref.value) - 5}" text-anchor="end">${esc(ref.label)}</text>`;
  return `${series.length > 1 ? legend(series) : ""}<svg class="chart" viewBox="0 0 ${w + M.r - 16} ${h}" width="${w + M.r - 16}" height="${h}" role="img">${svg}</svg>`;
}

// Barras horizontales (categorías largas). rows: [{ label, value, tip, note }]. ref: línea vertical.
export function hbarChart({ width, rows, color = "--s1", xFmt = (v) => fmtN(v), ref, labelW = 170 }) {
  const rowH = 26, w = Math.max(320, width), h = rows.length * rowH + 30;
  const iw = w - labelW - 150; // espacio a la derecha para el valor y su nota
  const max = Math.max(ref?.value || 0, ...rows.map((r) => r.value)) * 1.05 || 1;
  const X = (v) => labelW + (v / max) * iw;
  let svg = "";
  rows.forEach((r, i) => {
    const y = 6 + i * rowH; const bh = 14; const x1 = X(r.value);
    const lbl = r.label.length > 30 ? r.label.slice(0, 29) + "…" : r.label;
    svg += `<text class="c-tick" x="${labelW - 8}" y="${y + bh - 2}" text-anchor="end">${esc(lbl)}</text>`;
    svg += `<path d="M${labelW},${y}H${Math.max(labelW, x1 - 4)}q4,0 4,4V${y + bh - 4}q0,4 -4,4H${labelW}Z" fill="var(${color})"/>`;
    svg += `<text class="c-val" x="${x1 + 6}" y="${y + bh - 2}">${esc(xFmt(r.value))}${r.note ? " · " + esc(r.note) : ""}</text>`;
    svg += `<rect class="c-hit" x="0" y="${y - 5}" width="${w}" height="${rowH}" data-tip="${esc(r.tip || r.label + ": " + xFmt(r.value))}"/>`;
  });
  if (ref) svg += `<line class="c-ref" x1="${X(ref.value)}" x2="${X(ref.value)}" y1="0" y2="${rows.length * rowH + 4}"/><text class="c-tick" x="${X(ref.value)}" y="${h - 6}" text-anchor="middle">${esc(ref.label)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">${svg}</svg>`;
}

// Tooltip compartido: cualquier elemento con data-tip dentro de `root`.
export function bindTooltips(root) {
  let tip = document.getElementById("chartTip");
  if (!tip) { tip = Object.assign(document.createElement("div"), { id: "chartTip", className: "chart-tip" }); tip.hidden = true; document.body.appendChild(tip); }
  root.addEventListener("pointermove", (e) => {
    const t = e.target.closest("[data-tip]");
    const svg = e.target.closest("svg");
    for (const c of root.querySelectorAll(".c-cross")) if (c.closest("svg") !== svg) c.setAttribute("hidden", "");
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip; tip.hidden = false;
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14);
    tip.style.left = x + "px"; tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 10) + "px";
    const cross = svg?.querySelector(".c-cross");
    if (cross && t.dataset.x) { cross.setAttribute("x1", t.dataset.x); cross.setAttribute("x2", t.dataset.x); cross.removeAttribute("hidden"); }
  });
  root.addEventListener("pointerleave", () => { tip.hidden = true; for (const c of root.querySelectorAll(".c-cross")) c.setAttribute("hidden", ""); });
}
