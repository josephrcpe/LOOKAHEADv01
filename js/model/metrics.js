// Cálculos de control (sin DOM). Todo en HH, por semanas que empiezan en lunes.
//
//   PV (valor planificado)  HH de la línea base repartidas por día laborable (personal × h/día).
//   EV (valor ganado)       % avance por metrados × HH de la línea base de cada actividad.
//   AC (costo real)         HH trabajadas + HH extra de los registros semanales.
//   SPI = EV / PV · CPI = EV / AC · EAC = BAC / CPI · PF (factor de productividad) = AC / EV.
//   PAC = compromisos cumplidos / compromisos del plan semanal congelado.

import { num, toDay, toIso, mondayOf } from "../util.js";
import { state, isWork, latestBaseline, regHH, avanceFrom, byUid, planOf } from "../state.js";

// Actividades de referencia: la última línea base; sin línea base, el programa vigente.
function refTasks() {
  const b = latestBaseline();
  if (b) return { tasks: b.tareas || [], jornada: b.jornada, horas: num(b.horasDia) || 10, isBaseline: true };
  return { tasks: state.acts, jornada: state.proj?.jornada, horas: num(state.proj?.horasDia) || 10, isBaseline: false };
}
const hhPerDay = (t, horas) => num(t.personal) * horas;

// Semana de corte: la última semana con registros (los datos reales llegan hasta su domingo).
export function cutWeek() {
  const ws = state.regs.map((r) => r.semana).sort();
  return ws.length ? toDay(ws[ws.length - 1]) : null;
}

// Rango de semanas del proyecto (lunes inicial y final) según línea base, programa vigente y registros.
export function weekRange() {
  const days = [];
  for (const t of refTasks().tasks) days.push(toDay(t.inicio), toDay(t.fin));
  for (const a of state.acts) days.push(toDay(a.inicio), toDay(a.fin));
  for (const r of state.regs) days.push(toDay(r.semana));
  const ok = days.filter((d) => !isNaN(d));
  if (!ok.length) return [];
  const w0 = mondayOf(Math.min(...ok)), w1 = mondayOf(Math.max(...ok));
  const out = []; for (let w = w0; w <= w1; w += 7) out.push(w);
  return out;
}

// Avance (%) de una actividad al cierre de la semana wIso, por metrados.
export function avanceAt(uid, wIso, metradoPlan) {
  const regs = state.regs.filter((r) => r.uid === uid && r.semana <= wIso).sort((a, b) => a.semana.localeCompare(b.semana));
  if (!regs.length) return 0;
  const acum = regs.reduce((s, r) => s + num(r.metradoEjec), 0);
  const last = regs[regs.length - 1];
  const total = metradoPlan ?? byUid(uid)?.metrado;
  return last.finReal ? 100 : avanceFrom(total, acum, last.avance);
}

// Serie semanal para la curva S. Valores semanales y acumulados; EV y AC solo hasta el corte.
export function sCurve() {
  const { tasks, jornada, horas } = refTasks();
  const weeks = weekRange(); const cut = cutWeek();
  const bac = tasks.reduce((s, t) => s + (t.hhPlan != null ? num(t.hhPlan) : 0), 0) || tasks.reduce((s, t) => s + hhPerDay(t, horas) * workDays(t, jornada), 0);
  let pvCum = 0, acCum = 0;
  return { bac, cut, weeks: weeks.map((w) => {
    let pv = 0;
    for (const t of tasks) for (let d = Math.max(w, toDay(t.inicio)); d <= Math.min(w + 6, toDay(t.fin)); d++) if (isWork(d, jornada)) pv += hhPerDay(t, horas);
    pvCum += pv;
    const wIso = toIso(w);
    const ac = state.regs.filter((r) => r.semana === wIso).reduce((s, r) => s + regHH(r), 0);
    acCum += ac;
    const real = cut != null && w <= cut;
    const evCum = real ? tasks.reduce((s, t) => s + (avanceAt(t.uid, wIso, t.metrado) / 100) * num(t.hhPlan), 0) : null;
    return { w, pv, pvCum, ac: real ? ac : null, acCum: real ? acCum : null, evCum };
  }) };
}
function workDays(t, jornada) { let n = 0; for (let d = toDay(t.inicio); d <= toDay(t.fin); d++) if (isWork(d, jornada)) n++; return n; }

// Indicadores al corte.
export function kpisAtCut() {
  const s = sCurve();
  const last = s.weeks.filter((x) => x.evCum != null).pop();
  if (!last) return { bac: s.bac, cut: null };
  const pv = last.pvCum, ev = last.evCum, ac = last.acCum;
  const spi = pv ? ev / pv : null, cpi = ac ? ev / ac : null;
  return { bac: s.bac, cut: s.cut, pv, ev, ac, spi, cpi, eac: cpi ? s.bac / cpi : null, avance: s.bac ? ev / s.bac : null, avancePlan: s.bac ? pv / s.bac : null };
}

// PAC por semana. Con plan congelado se usan sus compromisos; sin plan, el campo "comprometida" del registro.
export function pacSeries() {
  const weeks = new Set([...state.planes.map((p) => p.semana), ...state.regs.map((r) => r.semana)]);
  return [...weeks].sort().map((wIso) => {
    const plan = planOf(toDay(wIso));
    const regs = state.regs.filter((r) => r.semana === wIso);
    const comp = plan ? (plan.compromisos || []).filter((c) => c.comprometida !== false).map((c) => c.uid) : regs.filter((r) => r.comprometida === "Sí").map((r) => r.uid);
    const done = comp.filter((uid) => regs.find((r) => r.uid === uid)?.cumplida === "Sí").length;
    const conReg = comp.filter((uid) => regs.some((r) => r.uid === uid)).length;
    return { w: toDay(wIso), comprometidas: comp.length, cumplidas: done, registradas: conReg, pac: comp.length && conReg ? done / comp.length : null, congelado: !!plan };
  });
}

// Causas de no cumplimiento acumuladas (para entender el PAC).
export function causasNC() {
  const m = new Map();
  for (const r of state.regs) if (r.cumplida === "No" && r.causaNC) m.set(r.causaNC, (m.get(r.causaNC) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([causa, n]) => ({ causa, n }));
}

// Histograma 1: personal promedio por día laborable, plan (línea base) frente a real.
export function personalSemanal() {
  const { tasks, jornada } = refTasks(); const cut = cutWeek();
  return weekRange().map((w) => {
    let wd = 0; for (let d = w; d < w + 7; d++) if (isWork(d, jornada)) wd++;
    let dh = 0;
    for (const t of tasks) for (let d = Math.max(w, toDay(t.inicio)); d <= Math.min(w + 6, toDay(t.fin)); d++) if (isWork(d, jornada)) dh += num(t.personal);
    const regs = state.regs.filter((r) => r.semana === toIso(w));
    const dhReal = regs.reduce((s, r) => s + num(r.personalTotal) * num(r.dias), 0);
    return { w, plan: wd ? dh / wd : 0, real: cut != null && w <= cut ? (wd ? dhReal / wd : 0) : null };
  });
}

// Histograma 2: Pareto de HH perdidas por causa.
export function paretoPerdidas() {
  const m = new Map();
  for (const r of state.regs) for (const p of r.perdidas || []) if (p.causa) m.set(p.causa, (m.get(p.causa) || 0) + num(p.horas) * num(p.personas));
  const rows = [...m.entries()].map(([causa, hh]) => ({ causa, hh })).filter((x) => x.hh > 0).sort((a, b) => b.hh - a.hh);
  const total = rows.reduce((s, x) => s + x.hh, 0); let acc = 0;
  for (const x of rows) { acc += x.hh; x.acumPct = total ? acc / total : 0; }
  return { rows, total };
}

// Histograma 3: factor de productividad por tipo de actividad (HH reales / HH ganadas). 1 = según plan.
export function productividadPorTipo() {
  const { tasks } = refTasks(); const cut = cutWeek();
  if (cut == null) return [];
  const cutIso = toIso(cut); const m = new Map();
  for (const t of tasks) {
    const ac = state.regs.filter((r) => r.uid === t.uid).reduce((s, r) => s + regHH(r), 0);
    const ev = (avanceAt(t.uid, cutIso, t.metrado) / 100) * num(t.hhPlan);
    if (!ac && !ev) continue;
    const x = m.get(t.tipo) || { tipo: t.tipo, disciplina: t.disciplina, ac: 0, ev: 0, n: 0 };
    x.ac += ac; x.ev += ev; x.n++; m.set(t.tipo, x);
  }
  return [...m.values()].filter((x) => x.ev > 0).map((x) => ({ ...x, pf: x.ac / x.ev }));
}

// Segmentos reales (as-built) de una actividad: días trabajados de cada semana, colocados desde el
// inicio real (o el lunes) en días laborables. Las semanas sin días trabajados quedan como huecos.
export function asBuiltSegments(uid, jornada) {
  const regs = state.regs.filter((r) => r.uid === uid).sort((a, b) => a.semana.localeCompare(b.semana));
  const ini = regs.find((r) => r.inicioReal)?.inicioReal;
  const fin = regs.find((r) => r.finReal)?.finReal;
  const days = [];
  for (const r of regs) {
    const w = toDay(r.semana); let left = Math.round(num(r.dias));
    const from = ini && toDay(ini) > w ? toDay(ini) : w;
    const to = fin && toDay(fin) < w + 6 ? toDay(fin) : w + 6;
    for (let d = from; d <= to && left > 0; d++) if (isWork(d, jornada)) { days.push(d); left--; }
  }
  const segs = [];
  for (const d of days.sort((a, b) => a - b)) {
    const s = segs[segs.length - 1];
    if (s && nextWork(s.d1, jornada) === d) s.d1 = d; else segs.push({ d0: d, d1: d });
  }
  return { segs, inicioReal: ini || "", finReal: fin || "" };
}
function nextWork(d, jornada) { do d++; while (!isWork(d, jornada)); return d; }
