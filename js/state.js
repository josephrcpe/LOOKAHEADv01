// Estado en memoria de la app y consultas ("selectores") derivadas de él.
// Regla: el estado solo se modifica desde data.js (lecturas de la base) o por acciones de UI muy locales
// (fila en edición, semana visible). Las vistas leen con los selectores y nunca escriben en la base directamente.

import { UI_KEY } from "./config.js";
import { num, toDay, toIso, dow, todayDay, mondayOf, lsGet, lsSet } from "./util.js";

export const DEFAULT_PROJ = () => ({ nombre: "Proyecto sin nombre", inicio: toIso(mondayOf(todayDay())), jornada: "7", horasDia: 10, sectores: {} });

export const state = {
  mode: "connecting",      // "connecting" | "db" | "local"
  readOnly: false,
  projects: [], projectsLoaded: false,
  pid: null, proj: null,   // proyecto abierto
  acts: [],                // tareas: programa vigente (fechas actuales)
  baselines: [],           // líneas base congeladas, ordenadas por versión
  regs: [],                // registros semanales de ejecución (real)
  restr: [],               // restricciones
  planes: [],              // planes semanales congelados (compromisos)
  cortes: [],              // cargas de Excel de campo (historial de cortes)
  editing: null, confirmDel: null,
  exec: { week: null, uid: null },
};

// ---------- Preferencias de vista (por navegador) ----------
export const ui = { collapsed: new Set(), group: "sector", abGroup: "sector" };
try { const u = JSON.parse(lsGet(UI_KEY) || "{}"); ui.collapsed = new Set(u.collapsed || []); ui.group = u.group || "sector"; } catch (e) { /* sin almacenamiento */ }
export const saveUi = () => lsSet(UI_KEY, JSON.stringify({ collapsed: [...ui.collapsed], group: ui.group }));

// ---------- Avisos de render ----------
// main.js registra renderAll; data.js y las vistas piden un repintado con requestRender().
const listeners = {};
export const on = (topic, fn) => { (listeners[topic] ||= []).push(fn); };
export const emit = (topic) => { for (const fn of listeners[topic] || []) fn(); };
export const requestRender = () => emit("render");

// ---------- Proyecto y calendario ----------
export const P = () => state.proj || DEFAULT_PROJ();
export const horasDia = () => num(P().horasDia) || 10;
export const sectores = () => P().sectores || {};
export const sectorLabel = (code) => (sectores()[code] ? `${code} · ${sectores()[code]}` : code);
export const startDay = () => { const d = toDay(P().inicio); return isNaN(d) ? mondayOf(todayDay()) : d; };

// jornada "7" = lunes a domingo, "6" = lunes a sábado, "5" = lunes a viernes.
export const isWork = (day, jornada = P().jornada) => { const w = dow(day); return jornada === "5" ? w !== 0 && w !== 6 : jornada === "6" ? w !== 0 : true; };
export const workDaysIn = (a, d0, d1, jornada) => { let n = 0; for (let d = Math.max(d0, toDay(a.inicio)); d <= Math.min(d1, toDay(a.fin)); d++) if (isWork(d, jornada)) n++; return n; };
export const personalOn = (a, day) => (day >= toDay(a.inicio) && day <= toDay(a.fin) && isWork(day)) ? num(a.personal) : 0;
// HH planificadas = personal × días laborables × horas/día (opcionalmente solo entre d0 y d1).
export const hhPlan = (a, d0 = -Infinity, d1 = Infinity) => num(a.personal) * workDaysIn(a, d0 === -Infinity ? toDay(a.inicio) : d0, d1 === Infinity ? toDay(a.fin) : d1) * horasDia();
export const durOf = (a) => toDay(a.fin) - toDay(a.inicio) + 1;

// ---------- Tareas ----------
export const byUid = (uid) => state.acts.find((a) => a.uid === uid);
export const sortActs = (list) => [...list].sort((a, b) => (a.inicio || "").localeCompare(b.inicio || "") || (a.idTarea || "").localeCompare(b.idTarea || ""));
export const inHorizon = (a) => { const h0 = startDay(); return toDay(a.fin) >= h0 && toDay(a.inicio) <= h0 + 20; };
export const predConflict = (a) => { const p = a.pred && byUid(a.pred); return p && toDay(a.inicio) <= toDay(p.fin) ? p : null; };

// ---------- Línea base ----------
export const latestBaseline = () => state.baselines[state.baselines.length - 1] || null;
export const blOf = (uid) => { const b = latestBaseline(); return b ? (b.tareas || []).find((t) => t.uid === uid) : null; };

// ---------- Ejecución ----------
export const regId = (uid, w) => `${uid}_${toIso(w)}`;  // un registro por tarea y semana (lunes)
export const regOf = (uid, w) => state.regs.find((r) => r.id === regId(uid, w)) || null;
export const regsOf = (uid) => state.regs.filter((r) => r.uid === uid).sort((a, b) => a.semana.localeCompare(b.semana));
export const latestReg = (uid) => { const l = regsOf(uid); return l[l.length - 1] || null; };
export const regHH = (r) => (r ? num(r.hhTrab) + num(r.hhExtra) : 0); // HH reales cargadas a la actividad
export const regLostHH = (r) => (r ? (r.perdidas || []).reduce((s, p) => s + num(p.horas) * num(p.personas), 0) : 0);
// Metrado acumulado de semanas anteriores a wIso.
export const metradoPrev = (uid, wIso) => state.regs.filter((r) => r.uid === uid && r.semana < wIso).reduce((s, r) => s + num(r.metradoEjec), 0);
// Avance por metrados: % = metrado acumulado / metrado planificado (tope 100). Sin metrado, se usa el % manual.
export const avanceFrom = (metradoTotal, acum, manual) => (num(metradoTotal) > 0 ? Math.min(100, (100 * num(acum)) / num(metradoTotal)) : num(manual));
export const openRestr = (uid) => state.restr.filter((r) => r.uid === uid && r.estado !== "Liberada");

// ---------- Plan semanal congelado ----------
export const planOf = (w) => state.planes.find((p) => p.semana === toIso(w)) || null;
export const compOf = (uid, w) => { const p = planOf(w); return p ? (p.compromisos || []).find((c) => c.uid === uid) || null : null; };
export const corteOf = (w) => state.cortes.find((c) => c.semana === toIso(w)) || null;

// Semana visible en Ejecución: la actual si cae en el horizonte, si no la primera del horizonte.
export const exWeek = () => {
  if (state.exec.week == null) { const t = mondayOf(todayDay()), h0 = mondayOf(startDay()); state.exec.week = t >= h0 && t <= h0 + 14 ? t : h0; }
  return state.exec.week;
};
// Actividades de una semana: activas en el programa vigente, comprometidas o con registro esa semana.
export function weekActs(w) {
  const ids = new Set(state.regs.filter((r) => r.semana === toIso(w)).map((r) => r.uid));
  for (const c of planOf(w)?.compromisos || []) ids.add(c.uid);
  return sortActs(state.acts).filter((a) => (toDay(a.fin) >= w && toDay(a.inicio) <= w + 6) || ids.has(a.uid));
}
