// Exportación de datos para análisis ("Exportar datos (CSV)"): un ZIP con un CSV por tabla + datos.json.
// Cada fila lleva id_proyecto para poder juntar varios proyectos en un mismo modelo de datos.
// Las tablas se unen por uid (actividad) y semana (lunes, AAAA-MM-DD).

import { DISC, CATS, CAUSAS, RTIPOS } from "../config.js";
import { num, toIso, todayDay } from "../util.js";
import { state, P, horasDia, sectores, hhPlan, byUid, sortActs, regLostHH } from "../state.js";
import { sCurve } from "../model/metrics.js";
import { toast, saveFile } from "../ui.js";
import { fileBase } from "./excel-report.js";

export function buildTables() {
  const pid = state.pid;
  const actRow = (a) => ({ id_proyecto: pid, uid: a.uid, id_tarea: a.idTarea, descripcion: a.desc, no_planificada: a.noPlanificada ? "Sí" : "No", disciplina: a.disciplina, especialidad: a.especialidad || "", tipo: a.tipo, sector: a.sector, sector_nombre: sectores()[a.sector] || "",
    inicio_plan: a.inicio, fin_plan: a.fin, personal_plan: num(a.personal), metrado_plan: a.metrado ?? "", unidad: a.unidad || "", hh_plan: hhPlan(a), peso_t: a.peso ?? "", altura_izaje_m: a.altura ?? "",
    predecesora_uid: a.pred || "", responsable: a.resp || "", nivel: a.nivel || "", ejes: a.ejes || "", plano: a.plano || "", observaciones: a.obs || "" });
  return {
    proyecto: [{ id_proyecto: pid, nombre: P().nombre, inicio_horizonte: P().inicio, jornada_dias_semana: P().jornada, horas_dia: horasDia(), exportado: new Date().toISOString() }],
    actividades: sortActs(state.acts).map(actRow),
    linea_base: state.baselines.flatMap((b) => (b.tareas || []).map((t) => ({ id_proyecto: pid, version: b.version, fecha_congelamiento: b.fecha, motivo: b.motivo || "", uid: t.uid, id_tarea: t.idTarea, descripcion: t.desc, disciplina: t.disciplina, tipo: t.tipo, sector: t.sector,
      inicio_plan: t.inicio, fin_plan: t.fin, personal_plan: t.personal, metrado_plan: t.metrado ?? "", unidad: t.unidad || "", hh_plan: t.hhPlan, peso_t: t.peso ?? "", altura_izaje_m: t.altura ?? "", predecesora_uid: t.pred || "" }))),
    registro_semanal: [...state.regs].sort((a, b) => a.semana.localeCompare(b.semana) || a.idTarea.localeCompare(b.idTarea)).map((r) => ({ id_proyecto: pid, semana: r.semana, uid: r.uid, id_tarea: r.idTarea,
      comprometida: r.comprometida, metrado_comprometido: r.metradoComp ?? "", cumplida: r.cumplida || "", causa_nc: r.causaNC || "", turno: r.turno, dias_trabajados: r.dias, horas_dia: r.horasDia,
      ...Object.fromEntries(CATS.map(([c]) => ["pers_" + c, num((r.personal || {})[c])])), personal_total: r.personalTotal, hh_trabajadas: r.hhTrab, hh_extra: r.hhExtra ?? "", hh_improductivas: r.hhImprod ?? "",
      hh_perdidas: regLostHH(r), hh_plan_semana: r.hhPlanSemana, metrado_ejecutado: r.metradoEjec ?? "", metrado_acumulado: r.metradoAcum ?? "", unidad: r.unidad || "", avance_acum_pct: r.avance,
      inicio_real: r.inicioReal || "", fin_real: r.finReal || "", protocolos: r.protocolos ?? "", no_conformidades: r.noConformidades ?? "", retrabajo_hh: r.retrabajoHH ?? "", incidentes: r.incidentes ?? "",
      registrado_por: r.registradoPor, fuente: r.fuente, fecha_registro: r.fechaRegistro, observaciones: r.obs || "" })),
    perdidas: state.regs.flatMap((r) => (r.perdidas || []).map((p) => ({ id_proyecto: pid, semana: r.semana, uid: r.uid, id_tarea: r.idTarea, causa: p.causa, horas: p.horas, personas: p.personas, hh_perdidas: num(p.horas) * num(p.personas) }))),
    equipos: state.regs.flatMap((r) => (r.equipos || []).map((q) => ({ id_proyecto: pid, semana: r.semana, uid: r.uid, id_tarea: r.idTarea, equipo: q.equipo, capacidad: q.capacidad, horas_operativas: q.horasOp, horas_espera: q.horasEspera }))),
    restricciones: state.restr.map((r) => ({ id_proyecto: pid, id_restriccion: r.id, uid: r.uid, id_tarea: byUid(r.uid)?.idTarea || r.idTarea, tipo: r.tipo, descripcion: r.desc, responsable: r.responsable || "", fecha_compromiso: r.fechaCompromiso || "", fecha_liberacion: r.fechaLiberacion || "", estado: r.estado, creado: r.creado })),
    catalogo_tipos_actividad: DISC.flatMap((d) => d.tipos.map(([c, n]) => ({ disciplina: d.name, codigo: c, tipo: n }))),
    catalogo_causas: CAUSAS.map(([c, n]) => ({ codigo: c, causa: n })),
    catalogo_tipos_restriccion: RTIPOS.map(([c, n]) => ({ codigo: c, tipo: n })),
    catalogo_categorias_personal: CATS.map(([c, n]) => ({ codigo: c, categoria: n })),
    catalogo_sectores: Object.entries(sectores()).map(([c, n]) => ({ codigo: c, nombre: n })),
  };
}
const toCsv = (rows) => {
  if (!rows.length) return "﻿";
  const cols = Object.keys(rows[0]);
  const q = (v) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\r\n");
};
export async function exportData() {
  if (!state.pid) return toast("Abre un proyecto primero.");
  const t = buildTables();
  const stamp = toIso(todayDay());
  if (window.JSZip) {
    const zip = new JSZip();
    for (const [k, rows] of Object.entries(t)) zip.file(k + ".csv", toCsv(rows));
    zip.file("datos.json", JSON.stringify(t, null, 2));
    zip.file("LEEME.txt", "Datos del lookahead exportados por tabla. Cada fila lleva id_proyecto para combinar varios proyectos.\r\nLas tablas se unen por uid (actividad) y semana (lunes). Fechas en formato AAAA-MM-DD. Archivos CSV en UTF-8 separados por comas.\r\n");
    await saveFile(`Datos ${fileBase()} ${stamp}.zip`, await zip.generateAsync({ type: "blob" }));
  } else await saveFile(`Datos ${fileBase()} ${stamp}.json`, new Blob([JSON.stringify(t, null, 2)], { type: "application/json" }));
}
