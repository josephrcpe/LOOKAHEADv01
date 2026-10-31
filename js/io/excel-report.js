// Excel de reporte (botón "Exportar a Excel"): lookahead con fórmulas y hojas de control.
// Hojas: Lookahead (Gantt de 21 días con fórmulas), Gráficos (nativos, ver excel-charts.js), Ejecución semanal, Pérdidas, Equipos, Restricciones,
// Planes semanales, Curva S, Indicadores, Línea base vN, Registro y Catálogos.
// Las columnas B (Id Tarea) y U (HH trabajadas) de "Ejecución semanal" son referenciadas por otras hojas:
// si agregas columnas, hazlo al final.

import { DAYS, MS, DOW, DISC, CATS, CAUSAS, RTIPOS, PAC_META, name, tipoName } from "../config.js";
import { num, toDay, toIso, dow, todayDay, fmt, colL } from "../util.js";
import { state, P, horasDia, sectores, startDay, isWork, personalOn, hhPlan, durOf, byUid, sortActs, inHorizon, latestBaseline, latestReg, regLostHH } from "../state.js";
import { groupTree, dailyTotals } from "../views/gantt.js";
import { sCurve, pacSeries, weekRange, personalSemanal, paretoPerdidas, productividadPorTipo } from "../model/metrics.js";
import { insertarGraficos } from "./excel-charts.js";
import { toast, saveFile } from "../ui.js";

export const fileBase = () => (P().nombre || "proyecto").replace(/[\\/:*?"<>|]/g, "").trim();

export async function exportExcel() {
  if (!state.pid) return toast("Abre un proyecto primero.");
  if (!window.ExcelJS) return toast("No se pudo cargar el generador de Excel. Revisa tu conexión y recarga la página.");
  const h0 = startDay(), today = todayDay();
  const xDate = (day) => new Date(day * MS);
  const xIso = (iso) => iso ? xDate(toDay(iso)) : null;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Lookahead de Obra"; wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const thin = { style: "thin", color: { argb: "FFC9D1DA" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const headFill = solid("FF1F5F8B"), headFont = { bold: true, color: { argb: "FFFFFFFF" } };
  const inputFill = solid("FFFFF1D6");
  const DF = "dd/mm/yyyy";
  const ESH = "'Ejecución semanal'";

  // Hoja principal: Lookahead
  const C = ["Id Tarea", "Descripción", "Disciplina", "Especialidad", "Tipo", "Sector/Zona", "Nivel", "Ejes", "Plano de referencia", "Predecesora", "Responsable", "Personal", "Metrado plan", "Unidad", "Inicio", "Fin", "Duración (d)", "Días-hombre (horizonte)", "HH plan (horizonte)", "HH real (acum.)", "% Avance", "Estado", "Observaciones"];
  const W = [17, 38, 20, 18, 6, 11, 9, 10, 18, 17, 16, 8, 9, 7, 11, 11, 9, 11, 11, 11, 8, 12, 30];
  const col = Object.fromEntries(C.map((n, i) => [n, i + 1]));
  const L = Object.fromEntries(C.map((n, i) => [n, colL(i + 1)]));
  const D0 = C.length + 1, DL0 = colL(D0), DLN = colL(D0 + DAYS - 1);
  const R_WEEK = 5, R_WORK = 6, R_DOW = 7, R_DATE = 8, R0 = 9;

  const ws = wb.addWorksheet("Lookahead", { views: [{ state: "frozen", xSplit: 2, ySplit: R_DATE }], properties: { outlineProperties: { summaryBelow: false } } });
  W.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (let i = 0; i < DAYS; i++) ws.getColumn(D0 + i).width = 4.8;
  ws.getCell("A1").value = P().nombre || "Proyecto"; ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = `Lookahead de 3 semanas: ${fmt(h0, true)} al ${fmt(h0 + DAYS - 1, true)}` + (latestBaseline() ? ` · Línea base v${latestBaseline().version}` : "");
  ws.getCell("A2").font = { color: { argb: "FF5A6876" } };
  ws.getCell("A3").value = "Fecha de control"; ws.getCell("A3").font = { bold: true };
  ws.getCell("B3").value = { formula: "TODAY()", result: xDate(today) }; ws.getCell("B3").numFmt = DF; ws.getCell("B3").fill = inputFill; ws.getCell("B3").alignment = { horizontal: "left" };
  ws.getCell("C3").value = "Reemplaza la fórmula por una fecha fija para evaluar el avance a un corte."; ws.getCell("C3").font = { italic: true, size: 9, color: { argb: "FF5A6876" } };
  ws.getCell("A4").value = "Horas por día"; ws.getCell("A4").font = { bold: true };
  ws.getCell("B4").value = horasDia(); ws.getCell("B4").fill = inputFill; ws.getCell("B4").alignment = { horizontal: "left" };

  for (let w = 0; w < 3; w++) {
    const c0 = D0 + w * 7; ws.mergeCells(R_WEEK, c0, R_WEEK, c0 + 6);
    const c = ws.getCell(R_WEEK, c0); c.value = `Semana ${w + 1}`; c.fill = headFill; c.font = headFont; c.alignment = { horizontal: "center" };
  }
  const note = (r, text, italic) => { const c = ws.getCell(r, D0 - 1); c.value = text; c.alignment = { horizontal: "right" }; c.font = { size: 9, italic: !!italic, color: { argb: "FF5A6876" } }; };
  note(R_WORK, "Laborable (1 = sí) →"); note(R_DOW, "Cambia la primera fecha para mover el horizonte →", true);
  for (let i = 0; i < DAYS; i++) {
    const d = h0 + i, cc = D0 + i, L_ = colL(cc);
    const cw = ws.getCell(R_WORK, cc); cw.value = isWork(d) ? 1 : 0; cw.alignment = { horizontal: "center" }; cw.font = { size: 9 }; cw.fill = inputFill; cw.border = border;
    const cd = ws.getCell(R_DOW, cc); cd.value = { formula: `MID("DLMMJVS",WEEKDAY(${L_}${R_DATE}),1)`, result: DOW[dow(d)] }; cd.alignment = { horizontal: "center" }; cd.font = { size: 9, color: { argb: "FF5A6876" } };
    const ct = ws.getCell(R_DATE, cc);
    ct.value = i === 0 ? xDate(d) : { formula: `${colL(cc - 1)}${R_DATE}+1`, result: xDate(d) };
    ct.numFmt = "dd"; ct.alignment = { horizontal: "center" }; ct.font = { bold: true, size: 9 }; ct.fill = solid("FFE9EDF1"); ct.border = border;
  }
  ws.getCell(R_DATE, D0).fill = inputFill;
  C.forEach((n, i) => { const c = ws.getCell(R_DATE, i + 1); c.value = n; c.fill = headFill; c.font = headFont; c.border = border; c.alignment = { vertical: "middle", wrapText: true }; });
  ws.getRow(R_DATE).height = 30;

  const list = sortActs(state.acts).filter(inHorizon);
  const plan = [];
  for (const g1 of groupTree(list, "sector")) {
    plan.push({ kind: 1, g: g1 });
    for (const g2 of g1.children) { plan.push({ kind: 2, g: g2 }); for (const a of g2.acts) plan.push({ kind: 3, a }); }
  }
  let r = R0;
  plan.forEach((p) => { p.row = r++; });
  const lastRow = Math.max(R0, r - 1);
  const endOf = (idx) => { const lvl = plan[idx].kind; let j = idx + 1; while (j < plan.length && plan[j].kind > lvl) j++; return plan[j - 1].row; };
  const hhRealOf = (uid) => state.regs.filter((x) => x.uid === uid).reduce((s, x) => s + num(x.hhTrab), 0);
  plan.forEach((p, idx) => {
    const row = ws.getRow(p.row); const R = p.row;
    if (p.kind === 3) {
      const a = p.a; row.outlineLevel = 2;
      const lr = latestReg(a.uid);
      const vals = {
        "Id Tarea": a.idTarea, "Descripción": a.desc, "Disciplina": a.disciplina, "Especialidad": a.especialidad || null, "Tipo": a.tipo,
        "Sector/Zona": a.sector, "Nivel": a.nivel || null, "Ejes": a.ejes || null, "Plano de referencia": a.plano || null,
        "Predecesora": a.pred && byUid(a.pred) ? byUid(a.pred).idTarea : null, "Responsable": a.resp || null, "Personal": num(a.personal),
        "Metrado plan": a.metrado ?? null, "Unidad": a.unidad || null, "Inicio": xIso(a.inicio), "Fin": xIso(a.fin),
        "% Avance": lr ? num(lr.avance) / 100 : 0, "Observaciones": a.obs || null,
      };
      for (const [k, v] of Object.entries(vals)) row.getCell(col[k]).value = v;
      const days = Array.from({ length: DAYS }, (_, i) => personalOn(a, h0 + i));
      const dh = days.reduce((s, v) => s + v, 0);
      row.getCell(col["Duración (d)"]).value = { formula: `${L["Fin"]}${R}-${L["Inicio"]}${R}+1`, result: durOf(a) };
      row.getCell(col["Días-hombre (horizonte)"]).value = { formula: `SUM(${DL0}${R}:${DLN}${R})`, result: dh };
      row.getCell(col["HH plan (horizonte)"]).value = { formula: `${L["Días-hombre (horizonte)"]}${R}*$B$4`, result: dh * horasDia() };
      row.getCell(col["HH real (acum.)"]).value = { formula: `SUMIFS(${ESH}!$U:$U,${ESH}!$B:$B,${L["Id Tarea"]}${R})`, result: hhRealOf(a.uid) };
      const st = lr && num(lr.avance) >= 100 ? "Completada" : today > toDay(a.fin) ? "Atrasada" : today >= toDay(a.inicio) ? "En curso" : "Por iniciar";
      row.getCell(col["Estado"]).value = { formula: `IF(${L["% Avance"]}${R}>=1,"Completada",IF($B$3>${L["Fin"]}${R},"Atrasada",IF($B$3>=${L["Inicio"]}${R},"En curso","Por iniciar")))`, result: st };
      for (let i = 0; i < DAYS; i++) {
        const Ld = colL(D0 + i);
        row.getCell(D0 + i).value = { formula: `IF(AND(${Ld}$${R_DATE}>=$${L["Inicio"]}${R},${Ld}$${R_DATE}<=$${L["Fin"]}${R},${Ld}$${R_WORK}=1),$${L["Personal"]}${R},"")`, result: days[i] || "" };
        row.getCell(D0 + i).alignment = { horizontal: "center" };
      }
      row.getCell(col["Inicio"]).numFmt = DF; row.getCell(col["Fin"]).numFmt = DF;
      row.getCell(col["HH plan (horizonte)"]).numFmt = "#,##0"; row.getCell(col["HH real (acum.)"]).numFmt = "#,##0";
      row.getCell(col["% Avance"]).numFmt = "0%"; row.getCell(col["% Avance"]).fill = inputFill;
      row.getCell(col["% Avance"]).dataValidation = { type: "decimal", operator: "between", allowBlank: true, formulae: [0, 1], showErrorMessage: true, errorTitle: "% Avance", error: "Ingresa un valor entre 0% y 100%." };
      row.getCell(col["Descripción"]).alignment = { wrapText: true, vertical: "top" };
      for (let c = 1; c < D0 + DAYS; c++) row.getCell(c).border = border;
    } else {
      const g = p.g; const end = endOf(idx);
      const actsIn = p.kind === 1 ? g.children.flatMap((c) => c.acts) : g.acts;
      row.outlineLevel = p.kind === 1 ? 0 : 1;
      row.getCell(1).value = p.kind === 1 ? g.key : "  " + g.key;
      row.getCell(2).value = p.kind === 1 ? (sectores()[g.key] || null) : `${actsIn.length} ${actsIn.length === 1 ? "actividad" : "actividades"}`;
      row.getCell(col["Inicio"]).value = { formula: `SUBTOTAL(5,${L["Inicio"]}${R + 1}:${L["Inicio"]}${end})`, result: xDate(Math.min(...actsIn.map((a) => toDay(a.inicio)))) };
      row.getCell(col["Fin"]).value = { formula: `SUBTOTAL(4,${L["Fin"]}${R + 1}:${L["Fin"]}${end})`, result: xDate(Math.max(...actsIn.map((a) => toDay(a.fin)))) };
      row.getCell(col["Inicio"]).numFmt = DF; row.getCell(col["Fin"]).numFmt = DF;
      const tot = dailyTotals(actsIn); const dh = tot.reduce((s, v) => s + v, 0);
      for (const [k, res] of [["Días-hombre (horizonte)", dh], ["HH plan (horizonte)", dh * horasDia()], ["HH real (acum.)", actsIn.reduce((s, a) => s + hhRealOf(a.uid), 0)]]) {
        row.getCell(col[k]).value = { formula: `SUBTOTAL(9,${L[k]}${R + 1}:${L[k]}${end})`, result: res }; row.getCell(col[k]).numFmt = "#,##0";
      }
      for (let i = 0; i < DAYS; i++) {
        const Ld = colL(D0 + i);
        row.getCell(D0 + i).value = { formula: `SUBTOTAL(9,${Ld}${R + 1}:${Ld}${end})`, result: tot[i] };
        row.getCell(D0 + i).alignment = { horizontal: "center" };
      }
      const fill = solid(p.kind === 1 ? "FFD5DEE7" : "FFE9EDF1");
      for (let c = 1; c < D0 + DAYS; c++) { const cell = row.getCell(c); cell.fill = fill; cell.font = { bold: true, size: p.kind === 1 ? 11 : 10 }; cell.border = border; }
    }
  });
  if (!plan.length) ws.getCell(R0, 1).value = "Sin actividades dentro de este horizonte.";

  let tr = lastRow + 2; const totRow = tr; const totals = dailyTotals(list);
  const rowsTot = [{ label: "Personal total por día", fn: (Ld) => `SUBTOTAL(9,${Ld}${R0}:${Ld}${lastRow})`, vals: totals, bold: true }];
  for (const d of DISC) rowsTot.push({ label: "Personal · " + d.name, fn: (Ld) => `SUMIF($${L["Disciplina"]}$${R0}:$${L["Disciplina"]}$${lastRow},"${d.name}",${Ld}$${R0}:${Ld}$${lastRow})`, vals: dailyTotals(list.filter((a) => a.disciplina === d.name)), hex: d.hex });
  for (const t of rowsTot) {
    const row = ws.getRow(tr);
    const lc = row.getCell(D0 - 1); lc.value = t.label; lc.alignment = { horizontal: "right" }; lc.font = { bold: true, color: t.hex ? { argb: "FF" + t.hex } : undefined };
    for (let i = 0; i < DAYS; i++) {
      const c = row.getCell(D0 + i); c.value = { formula: t.fn(colL(D0 + i)), result: t.vals[i] };
      c.alignment = { horizontal: "center" }; c.border = border; c.font = { bold: !!t.bold };
      if (t.bold) c.fill = solid("FFD5DEE7");
    }
    tr++;
  }
  const sumLine = (rr, label, formula, result) => { const row = ws.getRow(rr); const c0 = row.getCell(D0 - 1); c0.value = label; c0.alignment = { horizontal: "right" }; c0.font = { bold: true }; const c = row.getCell(D0); c.value = { formula, result }; c.font = { bold: true }; };
  sumLine(tr + 1, "Pico de personal", `MAX(${DL0}${totRow}:${DLN}${totRow})`, Math.max(0, ...totals));
  sumLine(tr + 2, "Días-hombre en el horizonte", `SUM(${DL0}${totRow}:${DLN}${totRow})`, totals.reduce((s, v) => s + v, 0));
  sumLine(tr + 3, "HH plan en el horizonte", `${DL0}${tr + 2}*$B$4`, totals.reduce((s, v) => s + v, 0) * horasDia());

  const gridRef = `${DL0}${R0}:${DLN}${lastRow}`;
  ws.addConditionalFormatting({ ref: gridRef, rules: DISC.map((d, i) => ({
    type: "expression", priority: i + 1, formulae: [`AND(ISNUMBER(${DL0}${R0}),$${L["Disciplina"]}${R0}="${d.name}")`],
    style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FF" + d.hex } }, font: { color: { argb: "FFFFFFFF" }, bold: true } },
  })).concat([{ type: "expression", priority: 9, formulae: [`AND(${DL0}$${R_WORK}=0,$${L["Disciplina"]}${R0}<>"")`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFF1F3F5" } } } }]) });
  ws.addConditionalFormatting({ ref: `${DL0}${R_DATE}:${DLN}${R_DATE}`, rules: [{ type: "expression", priority: 10, formulae: [`${DL0}${R_DATE}=$B$3`], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFF0A04B" } } } }] });
  ws.addConditionalFormatting({ ref: `${L["Estado"]}${R0}:${L["Estado"]}${lastRow}`, rules: [
    { type: "containsText", operator: "containsText", text: "Atrasada", priority: 11, style: { font: { color: { argb: "FFB3261E" }, bold: true } } },
    { type: "containsText", operator: "containsText", text: "Completada", priority: 12, style: { font: { color: { argb: "FF2E7D4F" }, bold: true } } },
    { type: "containsText", operator: "containsText", text: "En curso", priority: 13, style: { font: { color: { argb: "FF1F5F8B" } } } },
  ] });
  ws.autoFilter = { from: { row: R_DATE, column: 1 }, to: { row: R_DATE, column: C.length } };
  const wg = wb.addWorksheet("Gráficos"); // se llena al final, cuando existen las hojas de datos

  // Utilidad para hojas tabulares
  const table = (title, cols, rows, opt = {}) => {
    const sh = wb.addWorksheet(title, { views: [{ state: "frozen", ySplit: 1, xSplit: opt.xSplit || 0 }] });
    sh.columns = cols.map((c) => ({ header: c.h, width: c.w || 12 }));
    sh.getRow(1).eachCell((c) => { c.fill = headFill; c.font = headFont; c.border = border; c.alignment = { wrapText: true, vertical: "middle" }; });
    sh.getRow(1).height = 32;
    rows.forEach((src, i) => {
      const R = i + 2;
      const row = sh.getRow(R);
      cols.forEach((c, j) => {
        const cell = row.getCell(j + 1);
        const v = c.f ? { formula: c.f(R), result: c.v ? c.v(src) : undefined } : c.v(src);
        cell.value = v == null || v === "" ? null : v;
        if (c.fmt) cell.numFmt = c.fmt;
        if (c.wrap) cell.alignment = { wrapText: true, vertical: "top" };
        if (c.input) cell.fill = inputFill;
        cell.border = border;
      });
    });
    sh.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return sh;
  };
  const pred = (a) => a.pred && byUid(a.pred) ? byUid(a.pred).idTarea : null;
  const regsSorted = [...state.regs].sort((a, b) => a.semana.localeCompare(b.semana) || a.idTarea.localeCompare(b.idTarea));
  const actBy = (uid) => byUid(uid) || {};
  const regOfW = (uid, semana) => state.regs.find((r) => r.uid === uid && r.semana === semana);

  // Ejecución semanal (columnas fijas: B = Id Tarea, U = HH trabajadas; las usan otras hojas)
  const catCols = CATS.map(([c, n]) => ({ h: n, w: 9, v: (r) => num((r.personal || {})[c]) }));
  table("Ejecución semanal", [
    { h: "Semana (lunes)", w: 11, v: (r) => xIso(r.semana), fmt: DF }, { h: "Id Tarea", w: 17, v: (r) => actBy(r.uid).idTarea || r.idTarea }, { h: "Descripción", w: 32, v: (r) => actBy(r.uid).desc, wrap: true },
    { h: "Disciplina", w: 20, v: (r) => actBy(r.uid).disciplina }, { h: "Tipo", w: 6, v: (r) => actBy(r.uid).tipo }, { h: "Sector/Zona", w: 11, v: (r) => actBy(r.uid).sector },
    { h: "Comprometida", w: 11, v: (r) => r.comprometida }, { h: "Cumplida", w: 9, v: (r) => r.cumplida }, { h: "Causa no cumplimiento", w: 14, v: (r) => r.causaNC },
    { h: "Turno", w: 9, v: (r) => r.turno }, { h: "Días trabajados", w: 9, v: (r) => r.dias }, { h: "Horas efectivas/día", w: 9, v: (r) => r.horasDia },
    ...catCols,
    { h: "Personal total", w: 9, f: (R) => `SUM(M${R}:S${R})`, v: (r) => r.personalTotal },
    { h: "HH trabajadas", w: 10, f: (R) => `T${R}*K${R}*L${R}`, v: (r) => r.hhTrab, fmt: "#,##0.0" },
    { h: "HH extra", w: 8, v: (r) => r.hhExtra }, { h: "HH improductivas", w: 10, v: (r) => r.hhImprod },
    { h: "HH perdidas", w: 9, f: (R) => `SUMIFS('Pérdidas'!$G:$G,'Pérdidas'!$A:$A,A${R},'Pérdidas'!$B:$B,B${R})`, v: (r) => regLostHH(r), fmt: "#,##0.0" },
    { h: "HH plan semana", w: 10, v: (r) => r.hhPlanSemana, fmt: "#,##0" },
    { h: "% HH real vs plan", w: 9, f: (R) => `IF(Y${R}>0,U${R}/Y${R},"")`, v: (r) => r.hhPlanSemana ? r.hhTrab / r.hhPlanSemana : "", fmt: "0%" },
    { h: "Metrado ejecutado", w: 10, v: (r) => r.metradoEjec }, { h: "Unidad", w: 7, v: (r) => r.unidad },
    { h: "Productividad (HH/unidad)", w: 11, f: (R) => `IF(N(AA${R})>0,U${R}/AA${R},"")`, v: (r) => num(r.metradoEjec) > 0 ? r.hhTrab / num(r.metradoEjec) : "", fmt: "0.00" },
    { h: "Avance acumulado", w: 9, v: (r) => num(r.avance) / 100, fmt: "0%" },
    { h: "Inicio real", w: 11, v: (r) => xIso(r.inicioReal), fmt: DF }, { h: "Fin real", w: 11, v: (r) => xIso(r.finReal), fmt: DF },
    { h: "Protocolos liberados", w: 9, v: (r) => r.protocolos }, { h: "No conformidades", w: 9, v: (r) => r.noConformidades }, { h: "Retrabajo (HH)", w: 9, v: (r) => r.retrabajoHH }, { h: "Incidentes", w: 9, v: (r) => r.incidentes },
    { h: "Registrado por", w: 16, v: (r) => r.registradoPor }, { h: "Fuente", w: 12, v: (r) => r.fuente }, { h: "Fecha de registro", w: 16, v: (r) => r.fechaRegistro ? new Date(r.fechaRegistro) : null, fmt: "dd/mm/yyyy hh:mm" },
    { h: "Observaciones", w: 30, v: (r) => r.obs, wrap: true },
    { h: "Metrado comprometido", w: 10, v: (r) => r.metradoComp },
  ], regsSorted, { xSplit: 2 });

  table("Pérdidas", [
    { h: "Semana (lunes)", w: 11, v: (x) => xIso(x.semana), fmt: DF }, { h: "Id Tarea", w: 17, v: (x) => x.idTarea }, { h: "Código de causa", w: 11, v: (x) => x.causa },
    { h: "Causa", w: 34, v: (x) => name(CAUSAS, x.causa) }, { h: "Horas", w: 8, v: (x) => x.horas }, { h: "Personas", w: 9, v: (x) => x.personas },
    { h: "HH perdidas", w: 10, f: (R) => `E${R}*F${R}`, v: (x) => num(x.horas) * num(x.personas) },
  ], regsSorted.flatMap((r) => (r.perdidas || []).map((p) => ({ ...p, semana: r.semana, idTarea: actBy(r.uid).idTarea || r.idTarea }))));

  table("Equipos", [
    { h: "Semana (lunes)", w: 11, v: (x) => xIso(x.semana), fmt: DF }, { h: "Id Tarea", w: 17, v: (x) => x.idTarea }, { h: "Equipo", w: 22, v: (x) => x.equipo }, { h: "Capacidad", w: 10, v: (x) => x.capacidad },
    { h: "Horas operativas", w: 10, v: (x) => x.horasOp }, { h: "Horas en espera", w: 10, v: (x) => x.horasEspera },
    { h: "% espera", w: 9, f: (R) => `IF(E${R}+F${R}>0,F${R}/(E${R}+F${R}),"")`, v: (x) => num(x.horasOp) + num(x.horasEspera) > 0 ? num(x.horasEspera) / (num(x.horasOp) + num(x.horasEspera)) : "", fmt: "0%" },
  ], regsSorted.flatMap((r) => (r.equipos || []).map((q) => ({ ...q, semana: r.semana, idTarea: actBy(r.uid).idTarea || r.idTarea }))));

  table("Restricciones", [
    { h: "Id Tarea", w: 17, v: (x) => actBy(x.uid).idTarea || x.idTarea }, { h: "Tipo", w: 7, v: (x) => x.tipo }, { h: "Tipo (descripción)", w: 20, v: (x) => name(RTIPOS, x.tipo) },
    { h: "Descripción", w: 40, v: (x) => x.desc, wrap: true }, { h: "Responsable", w: 18, v: (x) => x.responsable }, { h: "Fecha compromiso", w: 11, v: (x) => xIso(x.fechaCompromiso), fmt: DF },
    { h: "Fecha liberación", w: 11, v: (x) => xIso(x.fechaLiberacion), fmt: DF, input: true }, { h: "Estado", w: 10, f: (R) => `IF(G${R}<>"","Liberada","Abierta")`, v: (x) => x.estado },
    { h: "Días de atraso", w: 9, f: (R) => `IF(F${R}="","",MAX(0,IF(G${R}<>"",G${R},'Lookahead'!$B$3)-F${R}))`, v: (x) => x.fechaCompromiso ? Math.max(0, (x.fechaLiberacion ? toDay(x.fechaLiberacion) : today) - toDay(x.fechaCompromiso)) : "" },
  ], [...state.restr].sort((a, b) => (a.fechaCompromiso || "").localeCompare(b.fechaCompromiso || "")));

  // Planes semanales congelados (un renglón por compromiso).
  table("Planes semanales", [
    { h: "Semana (lunes)", w: 11, v: (x) => xIso(x.semana), fmt: DF }, { h: "Id Tarea", w: 17, v: (x) => actBy(x.uid).idTarea || x.idTarea },
    { h: "Descripción", w: 34, v: (x) => actBy(x.uid).desc, wrap: true }, { h: "Metrado comprometido", w: 11, v: (x) => x.metradoComp }, { h: "Unidad", w: 7, v: (x) => x.unidad },
    { h: "HH comprometidas", w: 10, v: (x) => x.hhComp, fmt: "#,##0" }, { h: "Congelado por", w: 16, v: (x) => x.congeladoPor },
    { h: "Metrado ejecutado", w: 10, f: (R) => `SUMIFS(${ESH}!$AA:$AA,${ESH}!$A:$A,A${R},${ESH}!$B:$B,B${R})`, v: (x) => regOfW(x.uid, x.semana)?.metradoEjec ?? 0 },
    { h: "¿Cumplida?", w: 9, v: (x) => regOfW(x.uid, x.semana)?.cumplida || "" },
  ], [...state.planes].sort((a, b) => a.semana.localeCompare(b.semana)).flatMap((p) => (p.compromisos || []).map((c) => ({ ...c, semana: p.semana, congeladoPor: p.congeladoPor }))));

  // Indicadores por semana: PAC sobre el plan congelado y HH desde Ejecución semanal.
  const pac = pacSeries();
  table("Indicadores", [
    { h: "Semana (lunes)", w: 12, v: (p) => xDate(p.w), fmt: DF },
    { h: "Compromisos", w: 12, v: (p) => p.comprometidas },
    { h: "Cumplidos", w: 10, v: (p) => p.cumplidas },
    { h: "PAC", w: 8, f: (R) => `IF(B${R}>0,C${R}/B${R},"")`, v: (p) => p.pac ?? "", fmt: "0%" },
    { h: "Plan congelado", w: 10, v: (p) => (p.congelado ? "Sí" : "No") },
    { h: "HH plan (programa)", w: 11, f: (R) => `SUMIFS(${ESH}!$Y:$Y,${ESH}!$A:$A,A${R})`, fmt: "#,##0" },
    { h: "HH trabajadas", w: 10, f: (R) => `SUMIFS(${ESH}!$U:$U,${ESH}!$A:$A,A${R})`, fmt: "#,##0" },
    { h: "HH real / plan", w: 10, f: (R) => `IF(F${R}>0,G${R}/F${R},"")`, fmt: "0%" },
    { h: "HH perdidas", w: 10, f: (R) => `SUMIFS('Pérdidas'!$G:$G,'Pérdidas'!$A:$A,A${R})`, fmt: "#,##0.0" },
    { h: "% HH perdidas", w: 10, f: (R) => `IF(G${R}+I${R}>0,I${R}/(G${R}+I${R}),"")`, fmt: "0%" },
  ], pac);

  // Curva S en HH (valores calculados por la herramienta; SPI y CPI como fórmulas).
  const sc = sCurve();
  table("Curva S", [
    { h: "Semana", w: 8, v: (x) => "S" + (sc.weeks.indexOf(x) + 1) }, { h: "Lunes", w: 11, v: (x) => xDate(x.w), fmt: DF },
    { h: "PV semana", w: 10, v: (x) => x.pv, fmt: "#,##0" }, { h: "PV acumulado", w: 11, v: (x) => x.pvCum, fmt: "#,##0" },
    { h: "EV acumulado", w: 11, v: (x) => x.evCum, fmt: "#,##0" }, { h: "AC semana", w: 10, v: (x) => x.ac, fmt: "#,##0" }, { h: "AC acumulado", w: 11, v: (x) => x.acCum, fmt: "#,##0" },
    { h: "SPI", w: 7, f: (R) => `IF(AND(N(E${R})>0,D${R}>0),E${R}/D${R},"")`, fmt: "0.00" },
    { h: "CPI", w: 7, f: (R) => `IF(AND(N(E${R})>0,N(G${R})>0),E${R}/G${R},"")`, fmt: "0.00" },
    { h: "% plan", w: 8, f: (R) => `IF(${sc.bac}>0,D${R}/${sc.bac},"")`, fmt: "0%" },
    { h: "% ganado", w: 8, f: (R) => `IF(AND(${sc.bac}>0,N(E${R})>0),E${R}/${sc.bac},"")`, fmt: "0%" },
  ], sc.weeks);

  // Línea base (última versión) y registro de actividades
  const lb = latestBaseline();
  if (lb) table(`Línea base v${lb.version}`, [
    { h: "Id Tarea", w: 17, v: (t) => t.idTarea }, { h: "Descripción", w: 36, v: (t) => t.desc, wrap: true }, { h: "Disciplina", w: 20, v: (t) => t.disciplina }, { h: "Tipo", w: 6, v: (t) => t.tipo }, { h: "Sector/Zona", w: 11, v: (t) => t.sector },
    { h: "Inicio LB", w: 11, v: (t) => xIso(t.inicio), fmt: DF }, { h: "Fin LB", w: 11, v: (t) => xIso(t.fin), fmt: DF }, { h: "Personal", w: 8, v: (t) => t.personal },
    { h: "Metrado", w: 9, v: (t) => t.metrado }, { h: "Unidad", w: 7, v: (t) => t.unidad }, { h: "HH plan", w: 10, v: (t) => t.hhPlan, fmt: "#,##0" },
    { h: "Inicio actual", w: 11, v: (t) => xIso(byUid(t.uid)?.inicio), fmt: DF }, { h: "Fin actual", w: 11, v: (t) => xIso(byUid(t.uid)?.fin), fmt: DF },
    { h: "Desvío fin (d)", w: 9, f: (R) => `IF(M${R}="","",M${R}-G${R})`, v: (t) => byUid(t.uid) ? toDay(byUid(t.uid).fin) - toDay(t.fin) : "" },
    { h: "HH real (acum.)", w: 10, f: (R) => `SUMIFS(${ESH}!$U:$U,${ESH}!$B:$B,A${R})`, v: (t) => hhRealOf(t.uid), fmt: "#,##0" },
  ], lb.tareas);

  table("Registro", [
    { h: "Id Tarea", w: 17, v: (a) => a.idTarea }, { h: "Descripción", w: 38, v: (a) => a.desc, wrap: true }, { h: "Disciplina", w: 20, v: (a) => a.disciplina }, { h: "Especialidad", w: 18, v: (a) => a.especialidad },
    { h: "Tipo", w: 6, v: (a) => a.tipo }, { h: "Tipo (descripción)", w: 24, v: (a) => tipoName(a.tipo) }, { h: "Sector/Zona", w: 11, v: (a) => a.sector }, { h: "Nombre del sector", w: 22, v: (a) => sectores()[a.sector] },
    { h: "Nivel", w: 9, v: (a) => a.nivel }, { h: "Ejes", w: 10, v: (a) => a.ejes }, { h: "Plano de referencia", w: 18, v: (a) => a.plano }, { h: "Predecesora", w: 17, v: pred }, { h: "Responsable", w: 16, v: (a) => a.resp },
    { h: "Personal", w: 8, v: (a) => num(a.personal) }, { h: "Metrado plan", w: 9, v: (a) => a.metrado }, { h: "Unidad", w: 7, v: (a) => a.unidad }, { h: "Peso (t)", w: 8, v: (a) => a.peso }, { h: "Altura izaje (m)", w: 9, v: (a) => a.altura },
    { h: "Inicio", w: 11, v: (a) => xIso(a.inicio), fmt: DF }, { h: "Fin", w: 11, v: (a) => xIso(a.fin), fmt: DF },
    { h: "Duración (d)", w: 9, f: (R) => `T${R}-S${R}+1`, v: durOf }, { h: "HH plan", w: 10, v: (a) => hhPlan(a), fmt: "#,##0" },
    { h: "Observaciones", w: 30, v: (a) => a.obs, wrap: true },
  ], sortActs(state.acts));

  const wc = wb.addWorksheet("Catálogos");
  const blocks = [["Tipos de actividad", ["Disciplina", "Código", "Tipo"], DISC.flatMap((d) => d.tipos.map(([c, n]) => [d.name, c, n]))],
    ["Causas", ["Código", "Causa"], CAUSAS], ["Tipos de restricción", ["Código", "Tipo"], RTIPOS], ["Categorías de personal", ["Código", "Categoría"], CATS],
    ["Sectores", ["Código", "Nombre"], Object.entries(sectores())]];
  let cc = 1;
  for (const [title, heads, rows] of blocks) {
    wc.getCell(1, cc).value = title; wc.getCell(1, cc).font = { bold: true };
    heads.forEach((h, j) => { const c = wc.getCell(2, cc + j); c.value = h; c.fill = headFill; c.font = headFont; wc.getColumn(cc + j).width = j === heads.length - 1 ? 30 : 12; });
    rows.forEach((row, i) => row.forEach((v, j) => (wc.getCell(3 + i, cc + j).value = v)));
    cc += heads.length + 1;
  }

  const charts = hojaGraficos(wg, sc, { headFill, headFont, border });
  let buf = await wb.xlsx.writeBuffer();
  try { buf = await insertarGraficos(buf, "Gráficos", charts); }
  catch (e) { console.error(e); toast("No se pudieron agregar los gráficos; el Excel se descarga sin ellos."); }
  await saveFile(`Lookahead ${fileBase()} ${toIso(h0)}.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}

// Hoja "Gráficos": tablas de datos a la derecha (columna V en adelante) y las especificaciones de los gráficos
// nativos que se insertan después (excel-charts.js). La curva S lee directamente la hoja "Curva S".
const COLOR = { s1: "2A78D6", s2: "EB6834", s3: "1BAF7A", meta: "8A9099" };
function hojaGraficos(ws, sc, st) {
  ws.getCell("A1").value = "Gráficos del proyecto"; ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = "Gráficos de Excel: puedes editarlos, cambiar colores o copiarlos a tu informe. Los datos de la curva S están en la hoja Curva S; los demás, en las tablas de la derecha.";
  ws.getCell("A2").font = { color: { argb: "FF52514E" }, size: 9 };
  const weeks = weekRange(); const label = (w) => { const i = weeks.indexOf(w); return i >= 0 ? `S${i + 1}` : fmt(w); };
  const Q = (c1, r1, c2 = c1, r2 = r1) => `'Gráficos'!$${c1}$${r1}:$${c2}$${r2}`;
  const specs = []; const notes = [];
  // Escribe una tabla de datos (encabezados en la fila 4) y devuelve la fila final.
  const block = (c0, title, heads, rows, fmts) => {
    ws.getCell(3, c0).value = title; ws.getCell(3, c0).font = { bold: true };
    heads.forEach((h, j) => { const c = ws.getCell(4, c0 + j); c.value = h; c.fill = st.headFill; c.font = st.headFont; c.border = st.border; ws.getColumn(c0 + j).width = j ? 11 : 22; });
    rows.forEach((r, i) => r.forEach((v, j) => { const c = ws.getCell(5 + i, c0 + j); c.value = v == null ? null : v; c.border = st.border; if (fmts[j]) c.numFmt = fmts[j]; }));
    return 4 + rows.length;
  };
  for (let c = 1; c <= 19; c++) ws.getColumn(c).width = 9.5;
  ws.pageSetup = { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1, printArea: "A1:T70" };

  // 1. Curva S (ancho completo).
  if (sc.weeks.length) {
    const n = sc.weeks.length + 1;
    const ser = (name, col, key, color) => ({ name, ref: `'Curva S'!$${col}$2:$${col}$${n}`, vals: sc.weeks.map((w) => w[key]), color, kind: "line" });
    specs.push({ title: "Curva S en HH (acumulado)", at: [0, 3, 19, 23], legend: true, yFmt: "#,##0",
      cats: { ref: `'Curva S'!$A$2:$A$${n}`, vals: sc.weeks.map((w, i) => "S" + (i + 1)) },
      series: [ser("PV · planificado", "D", "pvCum", COLOR.s1), ser("EV · ganado", "E", "evCum", COLOR.s2), ser("AC · real", "G", "acCum", COLOR.s3)] });
  }
  // 2. PAC semanal con meta (V:X).
  const pac = pacSeries();
  if (pac.length) {
    const end = block(22, "PAC semanal", ["Semana", "PAC", "Meta"], pac.map((p) => [label(p.w), p.pac ?? null, PAC_META]), [null, "0%", "0%"]);
    specs.push({ title: "PAC semanal", at: [0, 25, 9, 44], legend: true, yFmt: "0%", yMax: 1, labels: true, cats: { ref: Q("V", 5, "V", end), vals: pac.map((p) => label(p.w)) },
      series: [{ name: "PAC", ref: Q("W", 5, "W", end), vals: pac.map((p) => p.pac ?? null), color: COLOR.s1, kind: "bar" },
        { name: `Meta ${Math.round(PAC_META * 100)} %`, ref: Q("X", 5, "X", end), vals: pac.map(() => PAC_META), color: COLOR.meta, kind: "line", dash: true }] });
  } else notes.push("PAC: congela planes semanales y carga cortes para verlo.");
  // 3. Personal plan vs real (Z:AB).
  const pers = personalSemanal();
  if (pers.length) {
    const end = block(26, "Personal por semana (personas/día)", ["Semana", "Plan (LB)", "Real"], pers.map((p) => [label(p.w), +p.plan.toFixed(1), p.real == null ? null : +p.real.toFixed(1)]), [null, "0.0", "0.0"]);
    specs.push({ title: "Personal por semana: plan vs real", at: [10, 25, 19, 44], legend: true, yFmt: "0", cats: { ref: Q("Z", 5, "Z", end), vals: pers.map((p) => label(p.w)) },
      series: [{ name: "Plan (LB)", ref: Q("AA", 5, "AA", end), vals: pers.map((p) => p.plan), color: COLOR.s1, kind: "bar" },
        { name: "Real", ref: Q("AB", 5, "AB", end), vals: pers.map((p) => p.real), color: COLOR.s2, kind: "bar" }] });
  }
  // 4. Pareto de HH perdidas (AD:AF).
  const par = paretoPerdidas();
  if (par.rows.length) {
    const rows = par.rows.map((r) => [name(CAUSAS, r.causa), +r.hh.toFixed(1), r.acumPct]);
    const end = block(30, "HH perdidas por causa (Pareto)", ["Causa", "HH perdidas", "% acumulado"], rows, [null, "#,##0.0", "0%"]);
    specs.push({ title: "HH perdidas por causa", at: [0, 46, 9, 66], horizontal: true, labels: true, yFmt: "#,##0", cats: { ref: Q("AD", 5, "AD", end), vals: rows.map((r) => r[0]) },
      series: [{ name: "HH perdidas", ref: Q("AE", 5, "AE", end), vals: rows.map((r) => r[1]), color: COLOR.s1, kind: "bar" }] });
  } else notes.push("Pérdidas: sin pérdidas registradas.");
  // 5. Factor de productividad por tipo (AH:AI).
  const pf = productividadPorTipo().sort((a, b) => b.pf - a.pf);
  if (pf.length) {
    const rows = pf.map((p) => [`${p.tipo} · ${tipoName(p.tipo)}`, +p.pf.toFixed(2)]);
    const end = block(34, "Factor de productividad (HH reales ÷ HH ganadas)", ["Tipo", "Factor"], rows, [null, "0.00"]);
    specs.push({ title: "Factor de productividad por tipo (1,0 = plan)", at: [10, 46, 19, 66], horizontal: true, labels: true, yFmt: "0.0", labelFmt: "0.00", cats: { ref: Q("AH", 5, "AH", end), vals: rows.map((r) => r[0]) },
      series: [{ name: "Factor", ref: Q("AI", 5, "AI", end), vals: rows.map((r) => r[1]), color: COLOR.s1, kind: "bar" }] });
  } else notes.push("Productividad: se calcula cuando hay avance por metrados registrado.");
  notes.forEach((t, i) => { ws.getCell(68 + i, 1).value = t; ws.getCell(68 + i, 1).font = { italic: true, color: { argb: "FF52514E" } }; });
  return specs;
}
