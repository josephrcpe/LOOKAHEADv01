// Excel de campo: plantilla semanal que llena el personal de obra y se vuelve a cargar al corte.
//
// Exportar: hoja "Campo" con los compromisos del plan congelado y el resto de actividades de la semana,
//           más filas en blanco para trabajos no planificados. Columnas amarillas = editables; el resto
//           está protegido. La hoja oculta "_meta" identifica proyecto, semana y versión del formato.
// Cargar:   lee el archivo, valida cada fila con las mismas reglas del formulario (model/registro.js),
//           muestra una vista previa y, al confirmar, guarda registros, reprograma tareas, crea las no
//           planificadas y deja constancia del corte en cortes/{lunes}. Nada se borra.

import { CATS, CAUSAS, DISC, UNIDADES, SECTOR_RE, CAMPO_VERSION, WHO_KEY, discOfTipo, tipoName } from "../config.js";
import { $, esc, num, fmtN, toDay, toIso, fmt, fmtIso, colL, dayToDate, dateToIso, newId, lsGet, lsSet } from "../util.js";
import { state, P, horasDia, sectores, byUid, sortActs, regOf, metradoPrev, planOf, compOf, weekActs, durOf } from "../state.js";
import { requirePid, writeFailed, saveReg, saveTask, saveCorte } from "../data.js";
import { validarEntrada, construirRegistro, cumplidaAuto } from "../model/registro.js";
import { nextNum, makeId } from "../views/entrada.js";
import { toast, openModal, closeModal, saveFile, pickFile } from "../ui.js";

const HEAD_ROW = 5, FIRST_ROW = 6, BLANK_ROWS = 10;
const causaTxt = (c) => { const x = CAUSAS.find(([k]) => k === c); return x ? `${x[0]} · ${x[1]}` : ""; };
const tipoTxt = (c) => `${c} · ${tipoName(c)}`;
const codeOf = (s) => String(s || "").split("·")[0].trim(); // "CLI-LLU · Clima…" → "CLI-LLU"

// Definición única de columnas: la usan la exportación y la lectura (el orden define la letra).
// t: "lock" protegida · "new" editable solo en filas nuevas · "edit" editable · "f" fórmula.
const COLS = [
  { k: "uid", h: "uid", w: 3, t: "lock", hidden: true },
  { k: "idTarea", h: "Id Tarea", w: 17, t: "lock" },
  { k: "desc", h: "Descripción", w: 34, t: "new" },
  { k: "sector", h: "Sector/Zona", w: 11, t: "new" },
  { k: "tipo", h: "Tipo", w: 9, t: "new" },
  { k: "unidad", h: "Unidad", w: 7, t: "new" },
  { k: "inicio", h: "Inicio programa", w: 11, t: "lock", date: true },
  { k: "fin", h: "Fin programa", w: 11, t: "lock", date: true },
  { k: "metrado", h: "Metrado total", w: 9, t: "new" },
  { k: "metPrev", h: "Metrado acum. anterior", w: 10, t: "lock" },
  { k: "comp", h: "Comprometida", w: 11, t: "lock" },
  { k: "metComp", h: "Metrado comprometido", w: 11, t: "lock" },
  { k: "inicioReal", h: "Inicio real", w: 11, t: "edit", date: true },
  { k: "finReal", h: "Fin real", w: 11, t: "edit", date: true },
  { k: "metEjec", h: "Metrado ejecutado (semana)", w: 11, t: "edit" },
  { k: "dias", h: "Días trabajados", w: 8, t: "edit" },
  { k: "horas", h: "Horas efectivas/día", w: 8, t: "edit" },
  ...CATS.map(([c, n]) => ({ k: "cat_" + c, h: n, w: 8, t: "edit" })),
  { k: "hhExtra", h: "HH extra", w: 7, t: "edit" },
  { k: "cumplidaManual", h: "¿Cumplida? (sin metrado)", w: 10, t: "edit" },
  { k: "causaNC", h: "Causa no cumplimiento", w: 22, t: "edit" },
  { k: "causaPer", h: "Causa de pérdida", w: 22, t: "edit" },
  { k: "horasPer", h: "Horas perdidas", w: 8, t: "edit" },
  { k: "persPer", h: "Personas afectadas", w: 9, t: "edit" },
  { k: "nuevoIni", h: "Nuevo inicio proyectado", w: 11, t: "edit", date: true },
  { k: "nuevoFin", h: "Nuevo fin proyectado", w: 11, t: "edit", date: true },
  { k: "obs", h: "Observaciones", w: 30, t: "edit" },
  { k: "persTot", h: "Personal total", w: 8, t: "f" },
  { k: "hh", h: "HH trabajadas", w: 9, t: "f" },
  { k: "metAcum", h: "Metrado acumulado", w: 10, t: "f" },
  { k: "avance", h: "% avance (metrados)", w: 9, t: "f" },
  { k: "cumplida", h: "¿Cumplida?", w: 9, t: "f" },
];
const IDX = Object.fromEntries(COLS.map((c, i) => [c.k, i + 1]));
const L = (k) => colL(IDX[k]);
const FORMULAS = {
  persTot: (R) => `SUM(${L("cat_" + CATS[0][0])}${R}:${L("cat_" + CATS[CATS.length - 1][0])}${R})`,
  hh: (R) => `${L("persTot")}${R}*N(${L("dias")}${R})*N(${L("horas")}${R})`,
  metAcum: (R) => `N(${L("metPrev")}${R})+N(${L("metEjec")}${R})`,
  avance: (R) => `IF(N(${L("metrado")}${R})>0,MIN(1,${L("metAcum")}${R}/${L("metrado")}${R}),"")`,
  cumplida: (R) => `IF(${L("comp")}${R}="Sí",IF(N(${L("metComp")}${R})>0,IF(N(${L("metEjec")}${R})>=${L("metComp")}${R},"Sí","No"),${L("cumplidaManual")}${R}),"")`,
};
const WORK_KEYS = ["inicioReal", "finReal", "metEjec", "dias", "horas", ...CATS.map(([c]) => "cat_" + c), "hhExtra", "cumplidaManual", "causaNC", "causaPer", "horasPer", "persPer"];

// ---------- Exportar ----------
export async function exportCampo(w) {
  if (!window.ExcelJS) return toast("No se pudo cargar el generador de Excel. Revisa tu conexión y recarga la página.");
  const plan = planOf(w); if (!plan) return toast("Congela primero el plan de la semana.");
  const wIso = toIso(w);
  const committed = plan.compromisos.map((c) => byUid(c.uid)).filter(Boolean);
  const others = weekActs(w).filter((a) => !committed.includes(a));
  const rows = [...sortActs(committed), ...others];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Lookahead de Obra"; wb.created = new Date(); wb.calcProperties.fullCalcOnLoad = true;
  const thin = { style: "thin", color: { argb: "FFC9D1DA" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const ws = wb.addWorksheet("Campo", { views: [{ state: "frozen", xSplit: 3, ySplit: HEAD_ROW }] });
  COLS.forEach((c, i) => { const col = ws.getColumn(i + 1); col.width = c.w; if (c.hidden) col.hidden = true; });

  ws.getCell("B1").value = `Excel de campo · ${P().nombre}`; ws.getCell("B1").font = { bold: true, size: 14 };
  ws.getCell("B2").value = `Semana del ${fmt(w, true)} al ${fmt(w + 6, true)} · ${plan.compromisos.length} compromisos congelados el ${fmt(toDay(plan.fecha.slice(0, 10)), true)}`;
  ws.getCell("B3").value = "Llena solo las celdas amarillas. Fechas en formato dd/mm/aaaa. Las filas al final son para trabajos no planificados (descripción, sector, tipo y unidad). No cambies el orden de columnas.";
  ws.getCell("B3").font = { italic: true, size: 9, color: { argb: "FF5A6876" } };
  // Bandas de encabezado: qué es plan (gris), qué llena campo (amarillo) y qué se calcula (azul).
  const groups = [["Plan (no editar)", "uid", "metComp", "FF5A6876"], ["Datos de campo (llenar)", "inicioReal", "obs", "FFB07A00"], ["Cálculos", "persTot", "cumplida", "FF1F5F8B"]];
  for (const [label, a, b, argb] of groups) {
    ws.mergeCells(HEAD_ROW - 1, IDX[a], HEAD_ROW - 1, IDX[b]);
    const c = ws.getCell(HEAD_ROW - 1, IDX[a]); c.value = label; c.fill = solid(argb); c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.alignment = { horizontal: "center" };
  }
  COLS.forEach((c, i) => {
    const cell = ws.getCell(HEAD_ROW, i + 1); cell.value = c.h; cell.border = border;
    cell.fill = solid(c.t === "edit" ? "FFFFE7A8" : c.t === "f" ? "FFD5E3F0" : "FFE9EDF1");
    cell.font = { bold: true, size: 9 }; cell.alignment = { wrapText: true, vertical: "middle" };
  });
  ws.getRow(HEAD_ROW).height = 42;

  const yellow = solid("FFFFF6D5");
  const writeRow = (R, a) => {
    const isNew = !a; const c = a ? compOf(a.uid, w) : null;
    const v = a ? {
      uid: a.uid, idTarea: a.idTarea, desc: a.desc, sector: a.sector, tipo: a.tipo, unidad: a.unidad || null,
      inicio: dayToDate(toDay(a.inicio)), fin: dayToDate(toDay(a.fin)), metrado: a.metrado ?? null, metPrev: metradoPrev(a.uid, wIso),
      comp: c ? "Sí" : "No", metComp: c && num(c.metradoComp) > 0 ? num(c.metradoComp) : null,
    } : { comp: "No" };
    const prev = a ? regOf(a.uid, w) : null; // si ya hay registro, se precarga para corregirlo
    if (prev) Object.assign(v, { inicioReal: prev.inicioReal ? dayToDate(toDay(prev.inicioReal)) : null, finReal: prev.finReal ? dayToDate(toDay(prev.finReal)) : null,
      metEjec: prev.metradoEjec, dias: prev.dias, horas: prev.horasDia, hhExtra: prev.hhExtra, causaNC: prev.causaNC ? causaTxt(prev.causaNC) : null, obs: prev.obs || null,
      ...Object.fromEntries(CATS.map(([k]) => ["cat_" + k, (prev.personal || {})[k] ?? null])) });
    else if (a) { const ir = state.regs.find((r) => r.uid === a.uid && r.inicioReal)?.inicioReal; if (ir) v.inicioReal = dayToDate(toDay(ir)); }
    if (a && !prev && c) v.horas = horasDia();
    const row = ws.getRow(R);
    COLS.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      if (col.t === "f") cell.value = { formula: FORMULAS[col.k](R) };
      else cell.value = v[col.k] ?? null;
      if (col.date) cell.numFmt = "dd/mm/yyyy";
      const manualCump = col.k === "cumplidaManual" && !!c && !(num(c.metradoComp) > 0);
      const editable = (col.t === "edit" && (col.k !== "cumplidaManual" || manualCump)) || (col.t === "new" && isNew);
      if (editable) { cell.protection = { locked: false }; cell.fill = yellow; }
      if (col.k === "avance") cell.numFmt = "0%";
      cell.border = border;
    });
    if (isNew) row.getCell(IDX.idTarea).value = "(nueva)";
    if (c) row.getCell(IDX.comp).font = { bold: true };
  };
  let R = FIRST_ROW;
  for (const a of rows) writeRow(R++, a);
  const firstNew = R;
  for (let i = 0; i < BLANK_ROWS; i++) writeRow(R++, null);
  const last = R - 1;

  // Listas desplegables (hoja oculta).
  const wl = wb.addWorksheet("Listas", { state: "hidden" });
  const lists = { A: CAUSAS.map(([c]) => causaTxt(c)), B: DISC.flatMap((d) => d.tipos.map(([c]) => tipoTxt(c))), C: UNIDADES, D: ["Sí", "No"], E: Object.keys(sectores()).sort() };
  for (const [colLetter, vals] of Object.entries(lists)) vals.forEach((x, i) => (wl.getCell(`${colLetter}${i + 1}`).value = x));
  const dv = (k, letter, n, r0 = FIRST_ROW, r1 = last) => {
    for (let r = r0; r <= r1; r++) ws.getCell(r, IDX[k]).dataValidation = { type: "list", allowBlank: true, formulae: [`Listas!$${letter}$1:$${letter}$${Math.max(1, n)}`], showErrorMessage: true, errorTitle: "Valor no válido", error: "Elige un valor de la lista." };
  };
  dv("causaNC", "A", lists.A.length); dv("causaPer", "A", lists.A.length); dv("cumplidaManual", "D", 2);
  dv("tipo", "B", lists.B.length, firstNew); dv("unidad", "C", lists.C.length, firstNew);
  for (const k of ["metEjec", "dias", "horas", "hhExtra", "horasPer", "persPer", ...CATS.map(([c]) => "cat_" + c)])
    for (let r = FIRST_ROW; r <= last; r++) ws.getCell(r, IDX[k]).dataValidation = { type: "decimal", operator: "greaterThanOrEqual", allowBlank: true, formulae: [0], showErrorMessage: true, error: "Ingresa un número mayor o igual a 0." };

  // Identificación del archivo (hoja muy oculta): el importador la exige.
  const wm = wb.addWorksheet("_meta", { state: "veryHidden" });
  [["version", CAMPO_VERSION], ["pid", state.pid], ["semana", wIso], ["proyecto", P().nombre], ["exportado", new Date().toISOString()]].forEach(([k, x], i) => { wm.getCell(i + 1, 1).value = k; wm.getCell(i + 1, 2).value = x; });

  const wi = wb.addWorksheet("Instrucciones");
  wi.getColumn(1).width = 110;
  ["Cómo llenar el Excel de campo", "",
    "1. Una fila por actividad. Las filas con 'Comprometida = Sí' son el compromiso de la semana: registra su metrado ejecutado.",
    "2. Personal: promedio diario de personas por categoría. Días trabajados y horas efectivas por día calculan las HH.",
    "3. Si no se cumplió el compromiso, elige la causa en 'Causa no cumplimiento'. Si hubo horas perdidas, indica causa, horas y personas.",
    "4. Si la actividad empezó o terminó, escribe las fechas reales. Si cambia su fecha prevista, usa 'Nuevo inicio/fin proyectado'.",
    "5. Trabajos no planificados: usa las filas '(nueva)' al final con descripción, sector, tipo y unidad.",
    "6. Al cierre de la semana, entrega el archivo a quien carga el corte en la herramienta (pestaña Ejecución › Cargar corte).",
    "", "No cambies el nombre de la hoja 'Campo', el orden de las columnas ni borres filas: el archivo se valida al cargarlo."].forEach((t, i) => { wi.getCell(i + 1, 1).value = t; if (!i) wi.getCell(1, 1).font = { bold: true, size: 13 }; });

  await ws.protect("", { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true, autoFilter: true });
  const buf = await wb.xlsx.writeBuffer();
  const fname = `Campo ${(P().nombre || "proyecto").replace(/[\\/:*?"<>|]/g, "")} ${wIso}.xlsx`;
  await saveFile(fname, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

// ---------- Leer ----------
const cellVal = (c) => {
  let v = c.value;
  if (v && typeof v === "object" && !(v instanceof Date)) v = v.result ?? v.text ?? (v.richText ? v.richText.map((t) => t.text).join("") : null);
  return typeof v === "string" ? v.trim() : v;
};
const empty = (v) => v == null || v === "";

// Devuelve { meta, rows: [{ fila, ...valores por clave }] } o lanza Error con mensaje para el usuario.
export async function readCampo(buffer) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch (e) { throw new Error("El archivo no es un Excel válido (.xlsx)."); }
  const wm = wb.getWorksheet("_meta"), ws = wb.getWorksheet("Campo");
  if (!wm || !ws) throw new Error("Este archivo no es un Excel de campo generado por la herramienta (faltan las hojas 'Campo' o '_meta').");
  const meta = {}; for (let r = 1; r <= 10; r++) { const k = cellVal(wm.getCell(r, 1)); if (k) meta[k] = cellVal(wm.getCell(r, 2)); }
  if (meta.version !== CAMPO_VERSION) throw new Error(`Versión de plantilla no compatible (${meta.version || "desconocida"}). Exporta un Excel de campo nuevo.`);
  COLS.forEach((c, i) => { if (cellVal(ws.getCell(HEAD_ROW, i + 1)) !== c.h) throw new Error(`La columna ${colL(i + 1)} debería ser "${c.h}". No cambies el orden de las columnas.`); });
  const rows = [];
  for (let r = FIRST_ROW; r <= ws.rowCount; r++) {
    const o = { fila: r };
    COLS.forEach((c, i) => { let v = cellVal(ws.getCell(r, i + 1)); if (c.date) v = empty(v) ? "" : dateToIso(v); o[c.k] = v; }); // fecha inválida → null
    if (empty(o.uid) && empty(o.desc) && WORK_KEYS.every((k) => empty(o[k]))) continue;
    rows.push(o);
  }
  return { meta, rows };
}

// ---------- Validar y armar los cambios ----------
// Cada fila produce { estado: "ok" | "aviso" | "error" | "omitida", msgs, reg?, task?, nueva? }.
export function planCambios(meta, rows, cargadoPor) {
  const w = toDay(meta.semana);
  const out = []; const nums = {};
  for (const o of rows) {
    const msgs = []; let estado = "ok";
    const warn = (m) => { msgs.push(m); if (estado === "ok") estado = "aviso"; };
    const fail = (m) => { msgs.push(m); estado = "error"; };
    let a = o.uid ? byUid(o.uid) : null;
    const nueva = !o.uid;
    if (o.uid && !a) { out.push({ o, estado: "error", msgs: ["La actividad ya no existe en el proyecto."] }); continue; }
    const hasWork = WORK_KEYS.some((k) => !empty(o[k]));
    const hasReprog = !empty(o.nuevoIni) || !empty(o.nuevoFin);
    if (!hasWork && !hasReprog) { out.push({ o, a, estado: "omitida", msgs: [o.comp === "Sí" ? "Comprometida sin datos de campo: no se carga." : "Sin datos."] }); continue; }
    for (const k of ["inicioReal", "finReal", "nuevoIni", "nuevoFin"]) if (o[k] === null) fail(`Fecha no válida en "${COLS[IDX[k] - 1].h}".`);
    for (const k of ["metEjec", "dias", "horas", "hhExtra", "horasPer", "persPer", "metrado", ...CATS.map(([c]) => "cat_" + c)])
      if (!empty(o[k]) && !(typeof o[k] === "number" || !isNaN(Number(o[k])))) fail(`"${COLS[IDX[k] - 1].h}" debe ser un número.`);

    if (nueva) { // trabajo no planificado: se crea la tarea con Id nuevo
      const tipo = codeOf(o.tipo); const d = discOfTipo(tipo); const sector = String(o.sector || "").toUpperCase().replace(/[\s.]/g, "");
      if (!o.desc) fail("Falta la descripción del trabajo no planificado.");
      if (!d) fail("Elige un tipo de actividad válido.");
      if (!SECTOR_RE.test(sector)) fail("Sector/Zona no válido (ej. ESP0310).");
      if (estado !== "error") {
        nums[tipo] = Math.max(nums[tipo] || 0, nextNum(tipo)) ; const n = nums[tipo]++;
        const ini = o.inicioReal || toIso(w), fin = o.finReal || o.nuevoFin || toIso(w + 6);
        const persTot = CATS.reduce((s, [c]) => s + num(o["cat_" + c]), 0);
        a = { uid: newId("t"), idTarea: makeId(sector, tipo, n), num: n, desc: String(o.desc), disciplina: d.name, especialidad: "", tipo, sector,
          inicio: ini, fin: toDay(fin) >= toDay(ini) ? fin : ini, personal: persTot, metrado: empty(o.metrado) ? null : num(o.metrado), unidad: o.unidad || "",
          resp: "", nivel: "", ejes: "", plano: "", pred: "", obs: "Creada desde Excel de campo (trabajo no planificado).", noPlanificada: true,
          creado: new Date().toISOString(), modificado: new Date().toISOString() };
        warn(`Trabajo no planificado: se crea ${a.idTarea}.`);
      }
    }
    if (estado === "error") { out.push({ o, a, estado, msgs }); continue; }

    // Reprogramación del programa vigente (la línea base no cambia).
    let task = null;
    if (!nueva) {
      const ini = o.inicioReal || o.nuevoIni || a.inicio;
      const fin = o.finReal || o.nuevoFin || a.fin;
      if (toDay(fin) < toDay(ini)) fail("La nueva fecha de fin queda antes del inicio.");
      else if (ini !== a.inicio || fin !== a.fin) { task = { ...a, inicio: ini, fin, modificado: new Date().toISOString() }; msgs.push(`Programa: ${fmtIso(a.inicio)}→${fmtIso(a.fin)} pasa a ${fmtIso(ini)}→${fmtIso(fin)}.`); }
    }
    let reg = null;
    if (hasWork && estado !== "error") {
      const c = nueva ? null : compOf(a.uid, w);
      const auto = c ? cumplidaAuto(c.metradoComp, o.metEjec) : null;
      const x = {
        comprometida: c ? "Sí" : "No", cumplida: auto || (o.cumplidaManual === "Sí" || o.cumplidaManual === "No" ? o.cumplidaManual : ""),
        causaNC: codeOf(o.causaNC), inicioReal: o.inicioReal || "", finReal: o.finReal || "",
        dias: empty(o.dias) ? "" : num(o.dias), horasDia: empty(o.horas) ? horasDia() : num(o.horas),
        personal: Object.fromEntries(CATS.map(([k]) => [k, num(o["cat_" + k])])), hhExtra: empty(o.hhExtra) ? null : num(o.hhExtra),
        metradoEjec: empty(o.metEjec) ? "" : num(o.metEjec), avanceManual: null,
        perdidas: o.causaPer ? [{ causa: codeOf(o.causaPer), horas: num(o.horasPer), personas: num(o.persPer) }] : [],
        registradoPor: cargadoPor || "—", fuente: "Excel de campo", obs: o.obs || undefined,
      };
      if (empty(o.horas)) warn(`Sin horas por día: se usan ${fmtN(horasDia(), 1)} h.`);
      if (x.causaNC && !CAUSAS.some(([k]) => k === x.causaNC)) fail(`Causa "${o.causaNC}" no está en el catálogo.`);
      if (x.perdidas[0] && !CAUSAS.some(([k]) => k === x.perdidas[0].causa)) fail(`Causa de pérdida "${o.causaPer}" no está en el catálogo.`);
      if (x.perdidas[0] && !(x.perdidas[0].horas > 0 && x.perdidas[0].personas > 0)) warn("Pérdida sin horas o personas: suma 0 HH.");
      if (!(num(a.metrado) > 0)) x.avanceManual = x.finReal ? 100 : (regOf(a.uid, w - 7)?.avance ?? 0);
      const val = validarEntrada(x, a).filter((e) => e.campo !== "registradoPor");
      for (const e of val) fail(e.msg);
      if (estado !== "error") {
        const prev = nueva ? null : regOf(a.uid, w);
        reg = construirRegistro(a, w, x, prev);
        if (prev) warn("Reemplaza el registro que ya tenía esta semana.");
        if (c && num(c.metradoComp) > 0 && reg.cumplida === "No" && !x.causaNC) fail("No alcanzó el metrado comprometido: falta la causa de no cumplimiento.");
        if (num(a.metrado) > 0 && reg.metradoAcum > num(a.metrado) * 1.001) warn(`El metrado acumulado (${fmtN(reg.metradoAcum, 2)}) supera el total planificado (${fmtN(a.metrado, 2)}).`);
      }
    }
    out.push({ o, a, estado, msgs, reg: estado === "error" ? null : reg, task: estado === "error" ? null : task, nueva: nueva && estado !== "error" ? a : null });
  }
  return out;
}

// ---------- Vista previa y carga ----------
const PILL = { ok: '<span class="pill ok">OK</span>', aviso: '<span class="pill warn">Aviso</span>', error: '<span class="pill bad">Error</span>', omitida: '<span class="pill">Omitida</span>' };

export async function importCampo() {
  if (!requirePid()) return;
  if (!window.ExcelJS) return toast("No se pudo cargar el lector de Excel. Revisa tu conexión y recarga la página.");
  const file = await pickFile(".xlsx");
  if (!file) return;
  let parsed;
  try { parsed = await readCampo(await file.arrayBuffer()); } catch (e) { return toast(e.message || "No se pudo leer el archivo.", 6000); }
  if (parsed.meta.pid !== state.pid) return toast(`Este Excel es del proyecto "${parsed.meta.proyecto}". Ábrelo primero para cargar el corte.`, 6000);
  const w = toDay(parsed.meta.semana);
  if (!planOf(w)) toast("Aviso: la semana del archivo no tiene plan congelado; el PAC no se podrá calcular.", 5000);
  showPreview(parsed, w, file.name);
}

function showPreview(parsed, w, fileName) {
  let who = lsGet(WHO_KEY) || "";
  let res = planCambios(parsed.meta, parsed.rows, who);
  const draw = (box) => {
    const n = (e) => res.filter((x) => x.estado === e).length;
    const loadable = res.filter((x) => (x.reg || x.task || x.nueva)).length;
    box.querySelector("#pv-sum").innerHTML = `${res.length} filas leídas · <strong>${loadable}</strong> se cargarán · ${n("aviso")} con aviso · ${n("error")} con error (se omiten) · ${n("omitida")} sin datos.`;
    box.querySelector("#pv-body").innerHTML = res.map((x) => `<tr class="${x.estado === "error" ? "row-bad" : ""}">
      <td class="mono">${x.o.fila}</td><td class="code">${esc(x.a?.idTarea || x.o.idTarea || "")}</td><td class="desc">${esc(x.a?.desc || x.o.desc || "")}</td>
      <td class="mono num">${x.reg && x.reg.metradoEjec != null ? `${fmtN(x.reg.metradoEjec, 2)}${x.reg.metradoComp ? " / " + fmtN(x.reg.metradoComp, 2) : ""} ${esc(x.a?.unidad || "")}` : "—"}</td>
      <td class="mono num">${x.reg ? fmtN(x.reg.hhTrab + num(x.reg.hhExtra)) : "—"}</td>
      <td>${x.reg?.cumplida ? `<span class="pill ${x.reg.cumplida === "Sí" ? "ok" : "bad"}">${x.reg.cumplida}</span>` : '<span class="sub">—</span>'}</td>
      <td>${PILL[x.estado]}</td><td class="help">${x.msgs.map(esc).join("<br>")}</td></tr>`).join("");
    const btn = box.querySelector("#pv-ok"); btn.disabled = !loadable; btn.textContent = `Cargar ${loadable} ${loadable === 1 ? "fila" : "filas"}`;
  };
  openModal(`<h2 id="modalTitle">Cargar corte · semana ${esc(fmt(w))} – ${esc(fmt(w + 6, true))}</h2>
    <p class="help" style="margin:0">Archivo <span class="mono">${esc(fileName)}</span>. Revisa los cambios antes de guardarlos. Los registros se guardan como ejecución real; la línea base no cambia.</p>
    <div class="info" id="pv-sum"></div>
    <div class="scroll-x" style="max-height:48vh;overflow:auto"><table><thead><tr><th>Fila</th><th>Id Tarea</th><th>Descripción</th><th class="num">Metrado ejec. / comp.</th><th class="num">HH</th><th>Cumplida</th><th>Estado</th><th>Detalle</th></tr></thead><tbody id="pv-body"></tbody></table></div>
    <div class="field"><label for="pv-who">Cargado por <span class="req">*</span></label><input id="pv-who" maxlength="60" value="${esc(who)}"><div class="err" id="pv-err"></div></div>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn btn-primary" id="pv-ok">Cargar</button></div>`, (box) => {
    draw(box);
    box.querySelector("#pv-ok").addEventListener("click", async () => {
      who = box.querySelector("#pv-who").value.trim();
      if (!who) { box.querySelector("#pv-err").textContent = "Indica quién carga el corte."; return; }
      lsSet(WHO_KEY, who);
      res = planCambios(parsed.meta, parsed.rows, who); // vuelve a armar con el nombre definitivo
      const btn = box.querySelector("#pv-ok"); btn.disabled = true; btn.textContent = "Guardando…";
      try { await aplicar(res, w, who, fileName); closeModal(); state.exec.week = w; }
      catch (ex) { btn.disabled = false; btn.textContent = "Reintentar"; writeFailed(ex); }
    });
  }, true);
}

async function aplicar(res, w, who, fileName) {
  let nReg = 0, nNew = 0, nProg = 0;
  for (const x of res) {
    if (x.nueva) { await saveTask(x.nueva); nNew++; }
    if (x.task) { await saveTask(x.task); nProg++; }
    if (x.reg) { await saveReg(x.reg); nReg++; }
  }
  // Foto del programa vigente tras el corte: permite reconstruir cómo evolucionó el cronograma.
  const prog = new Map(state.acts.map((a) => [a.uid, a]));
  for (const x of res) { if (x.nueva) prog.set(x.nueva.uid, x.nueva); if (x.task) prog.set(x.task.uid, x.task); }
  await saveCorte({ semana: toIso(w), fecha: new Date().toISOString(), cargadoPor: who, archivo: fileName,
    resumen: { filas: res.length, registros: nReg, nuevas: nNew, reprogramadas: nProg, errores: res.filter((x) => x.estado === "error").length },
    programa: [...prog.values()].map((a) => ({ uid: a.uid, idTarea: a.idTarea, inicio: a.inicio, fin: a.fin, duracion: durOf(a) })),
    log: res.map((x) => ({ fila: x.o.fila, idTarea: x.a?.idTarea || "", estado: x.estado, detalle: x.msgs.join(" ") })) });
  toast(`Corte cargado: ${nReg} registros, ${nProg} reprogramaciones, ${nNew} no planificadas.`, 5000);
}
