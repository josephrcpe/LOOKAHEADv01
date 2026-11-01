// Lectura y escritura en la base. Todas las escrituras pasan por aquí, para que haya un solo lugar
// donde revisar rutas, permisos y forma de los documentos (ver docs/ARQUITECTURA.md › Modelo de datos).
//
// proyectos/{pid}                         datos del proyecto (nombre, horizonte, jornada, sectores)
// proyectos/{pid}/tareas/{uid}            programa vigente
// proyectos/{pid}/lineasBase/v{n}         copias congeladas del programa (proyectado)
// proyectos/{pid}/planesSemanales/{lunes} compromisos congelados de la semana (para PAC)
// proyectos/{pid}/registros/{uid}_{lunes} ejecución real semanal
// proyectos/{pid}/cortes/{lunes}          historial de cargas de Excel de campo
// proyectos/{pid}/restricciones/{id}

import { PID_KEY, EJ_KEY } from "./config.js";
import { lsGet, lsSet, toIso, todayDay, newId } from "./util.js";
import { state, P, DEFAULT_PROJ, horasDia, sortActs, hhPlan, requestRender, emit } from "./state.js";
import { openStore } from "./store.js";
import { toast } from "./ui.js";

let db = null;
let unsubs = [];
const base = () => "proyectos/" + state.pid;
export const col = (c) => db.collection(base() + "/" + c);

// Subcolecciones de un proyecto y la clave de cada documento (se usan al abrir y al copiar).
const SUBS = [
  ["tareas", "acts", (d) => d.uid],
  ["lineasBase", "baselines", (d) => "v" + d.version],
  ["planesSemanales", "planes", (d) => d.semana],
  ["registros", "regs", (d) => d.id],
  ["cortes", "cortes", (d) => d.semana],
  ["restricciones", "restr", (d) => d.id],
];

export function requirePid() {
  if (!state.pid) { toast("Crea o abre un proyecto primero."); return false; }
  if (state.readOnly) { toast("Este lookahead es de solo lectura para ti."); return false; }
  return true;
}
export function writeFailed(e) {
  console.error(e);
  if (e && e.code === "invalid_argument") { state.readOnly = true; requestRender(); toast("No tienes permiso para modificar este lookahead."); }
  else toast("No se pudo guardar. Intenta de nuevo." + (e && e.code ? " (" + e.code + ")" : ""));
}

// ---------- Conexión y suscripciones ----------
export async function connect() {
  const s = await openStore();
  db = s.db; state.mode = s.mode; state.readOnly = s.readOnly;
  db.collection("proyectos").onSnapshot((snap) => {
    state.projects = snap.docs.map((d) => ({ pid: d.id, ...d.data() })).sort((a, b) => (b.modificado || "").localeCompare(a.modificado || ""));
    const first = !state.projectsLoaded;
    state.projectsLoaded = true;
    // Copia sin conexión: la primera vez en este navegador carga los ejemplos incluidos, aunque ya
    // haya otros proyectos guardados (p. ej. de una versión anterior). Después solo con Abrir → Cargar ejemplos.
    if (first && state.mode === "local" && !lsGet(EJ_KEY)) {
      lsSet(EJ_KEY, "1");
      cargarEjemplos({ silencioso: true }).catch(writeFailed);
      if (!state.projects.length) return;
    }
    if (!state.pid || !state.projects.some((p) => p.pid === state.pid)) {
      const stored = lsGet(PID_KEY);
      const pick = state.projects.find((p) => p.pid === stored) || state.projects[0];
      if (pick) openProject(pick.pid); else { state.pid = null; state.proj = null; requestRender(); }
    } else requestRender();
  }, (err) => toast("No se pudo leer la lista de proyectos (" + err.code + ")."));
  requestRender();
}

export function openProject(pid) {
  unsubs.forEach((u) => u()); unsubs = [];
  state.pid = pid; state.proj = state.projects.find((p) => p.pid === pid) || null;
  for (const [, key] of SUBS) state[key] = [];
  state.editing = null; state.exec.uid = null; state.exec.week = null;
  lsSet(PID_KEY, pid);
  const onErr = (err) => toast("Error al leer datos del proyecto (" + err.code + ").");
  unsubs.push(db.doc(base()).onSnapshot((s) => { if (s.exists) { state.proj = { ...DEFAULT_PROJ(), ...s.data() }; emit("project"); requestRender(); } }, onErr));
  for (const [name, key] of SUBS) {
    unsubs.push(col(name).onSnapshot((s) => {
      state[key] = s.docs.map((d) => ({ ...d.data() }));
      if (key === "baselines") state.baselines.sort((a, b) => a.version - b.version);
      emit(key); requestRender();
    }, onErr));
  }
  emit("opened"); requestRender();
}

// ---------- Proyectos ----------
const makePid = (n) => (n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "proyecto") + "-" + Math.random().toString(36).slice(2, 6);
export const nameTaken = (n) => state.projects.some((p) => (p.nombre || "").trim().toLowerCase() === n.trim().toLowerCase());

export async function saveProj(patch) {
  state.proj = { ...P(), ...patch, modificado: new Date().toISOString() };
  if (patch.inicio) state.exec.week = null;
  emit("project"); requestRender();
  return db.doc(base()).set(state.proj);
}
export async function createProject(nombre) {
  const pid = makePid(nombre); const now = new Date().toISOString();
  await db.doc("proyectos/" + pid).set({ ...DEFAULT_PROJ(), jornada: P().jornada, horasDia: horasDia(), nombre, creado: now, modificado: now });
  if (!state.projects.some((p) => p.pid === pid)) state.projects = [{ pid, nombre, modificado: now }, ...state.projects];
  openProject(pid);
}
// Copia completa: documento del proyecto y todas sus subcolecciones.
export async function copyProject(nombre) {
  const pid = makePid(nombre); const now = new Date().toISOString(); const dst = "proyectos/" + pid;
  const snap = SUBS.map(([name, key, idOf]) => [name, [...state[key]], idOf]);
  await db.doc(dst).set({ ...P(), nombre, creado: now, modificado: now, copiadoDe: P().nombre });
  const total = snap.reduce((s, [, l]) => s + l.length, 0); let i = 0;
  for (const [name, list, idOf] of snap) for (const d of list) {
    await db.collection(dst + "/" + name).doc(idOf(d)).set(d);
    if (++i % 10 === 0) toast(`Copiando… ${i} de ${total}`);
  }
  if (!state.projects.some((p) => p.pid === pid)) state.projects = [{ pid, nombre, modificado: now }, ...state.projects];
  openProject(pid);
}

// ---------- Tareas ----------
export const saveTask = (t) => col("tareas").doc(t.uid).set(t);
export async function deleteTask(uid) {
  await col("tareas").doc(uid).delete();
  for (const x of state.acts.filter((x) => x.pred === uid && x.uid !== uid)) await saveTask({ ...x, pred: "" });
}

// ---------- Línea base ----------
export async function freezeBaseline(version, motivo) {
  const doc = { version, fecha: new Date().toISOString(), motivo, jornada: P().jornada, horasDia: horasDia(),
    tareas: sortActs(state.acts).map((a) => ({ uid: a.uid, idTarea: a.idTarea, desc: a.desc, disciplina: a.disciplina, especialidad: a.especialidad || "", tipo: a.tipo, sector: a.sector,
      inicio: a.inicio, fin: a.fin, personal: Number(a.personal) || 0, metrado: a.metrado ?? null, unidad: a.unidad || "", hhPlan: hhPlan(a), peso: a.peso ?? null, altura: a.altura ?? null, pred: a.pred || "" })) };
  await col("lineasBase").doc("v" + version).set(doc);
}

// ---------- Plan semanal ----------
export const savePlan = (plan) => col("planesSemanales").doc(plan.semana).set(plan);
export const deletePlan = (semanaIso) => col("planesSemanales").doc(semanaIso).delete();

// ---------- Registros, cortes y restricciones ----------
export const saveReg = (r) => col("registros").doc(r.id).set(r);
export const saveCorte = (c) => col("cortes").doc(c.semana).set(c);
export async function addRestr(a, fields) {
  const r = { id: newId("r"), uid: a.uid, idTarea: a.idTarea, ...fields, fechaLiberacion: "", estado: "Abierta", creado: new Date().toISOString() };
  await col("restricciones").doc(r.id).set(r);
}
export async function freeRestr(id) {
  const r = state.restr.find((x) => x.id === id); if (!r) return;
  await col("restricciones").doc(id).set({ ...r, estado: "Liberada", fechaLiberacion: toIso(todayDay()) });
}

// ---------- Respaldo (io/respaldo.js) ----------
export const RESPALDO_COLS = SUBS.map(([name]) => name);
// Contenido del proyecto abierto: documento del proyecto y cada subcolección como lista.
export function datosProyecto() {
  const colecciones = {};
  for (const [name, key] of SUBS) colecciones[name] = state[key].map((d) => ({ ...d }));
  return { pid: state.pid, proyecto: { ...P() }, colecciones };
}
// Escribe un respaldo en proyectos/{pid}. Con reemplazar, borra antes los documentos que el respaldo no trae.
export async function escribirProyecto(pid, proyecto, colecciones, reemplazar) {
  const dst = "proyectos/" + pid;
  if (reemplazar) for (const [name] of SUBS) {
    const keep = new Set((colecciones[name] || []).map((d, i) => idDe(name, d, i)));
    const snap = await db.collection(dst + "/" + name).get();
    for (const d of snap.docs) if (!keep.has(d.id)) await db.collection(dst + "/" + name).doc(d.id).delete();
  }
  const entries = [[dst, proyecto]];
  for (const [name] of SUBS) (colecciones[name] || []).forEach((d, i) => entries.push([dst + "/" + name + "/" + idDe(name, d, i), d]));
  if (db.setMany) await db.setMany(entries);
  else for (let i = 0; i < entries.length; i++) {
    await db.doc(entries[i][0]).set(entries[i][1]);
    if (i % 10 === 9) toast(`Restaurando… ${i + 1} de ${entries.length}`);
  }
  if (!state.projects.some((p) => p.pid === pid)) state.projects = [{ pid, ...proyecto }, ...state.projects];
  openProject(pid);
}
const idDe = (name, d, i) => { const f = SUBS.find(([n]) => n === name)[2]; return String(f(d) ?? "x" + i); };
export const nuevoPid = makePid;

// ---------- Proyectos de ejemplo (data/ejemplos.js) ----------
// Escribe los ejemplos que falten; nunca sobrescribe un proyecto existente.
export async function cargarEjemplos({ silencioso } = {}) {
  const { default: docs } = await import("../data/ejemplos.js");
  const have = new Set(state.projects.map((p) => p.pid));
  const entries = Object.entries(docs).filter(([path]) => !have.has(path.split("/")[1]));
  if (!entries.length) { if (!silencioso) toast("Los proyectos de ejemplo ya están cargados."); return 0; }
  if (db.setMany) await db.setMany(entries);
  else for (let i = 0; i < entries.length; i++) await db.doc(entries[i][0]).set(entries[i][1]);
  const n = new Set(entries.map(([path]) => path.split("/")[1])).size;
  toast(`Se cargaron ${n} proyecto(s) de ejemplo. Ábrelos con Abrir.`, 5000);
  return n;
}
