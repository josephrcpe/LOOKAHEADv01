// Reglas del registro semanal, compartidas por el formulario de Ejecución y la carga del Excel de campo.
// Así una misma entrada produce el mismo registro venga de donde venga.

import { CATS } from "../config.js";
import { num, toDay, toIso } from "../util.js";
import { hhPlan, regId, compOf, planOf, metradoPrev, avanceFrom } from "../state.js";

// Estado de compromiso de una actividad en la semana w según el plan congelado (si existe).
export function compromisoDe(a, w) {
  const c = compOf(a.uid, w);
  return { hayPlan: !!planOf(w), comp: c, metradoComp: c ? num(c.metradoComp) : null };
}

// Cumplida automática: con metrado comprometido, se cumple si el ejecutado lo alcanza (tolerancia 0,1 %).
export function cumplidaAuto(metradoComp, metradoEjec) {
  if (!(num(metradoComp) > 0)) return null;
  return num(metradoEjec) >= num(metradoComp) * 0.999 ? "Sí" : "No";
}

// Valida la entrada. Devuelve [{ campo, msg }]; vacío = válida.
export function validarEntrada(x, a) {
  const e = []; const err = (campo, msg) => e.push({ campo, msg });
  if (x.comprometida === "Sí" && !x.cumplida) err("cumplida", "Indica si se cumplió el compromiso.");
  if (x.cumplida === "No" && !x.causaNC) err("causaNC", "Falta la causa de no cumplimiento.");
  if (x.dias === "" || x.dias == null || num(x.dias) < 0 || num(x.dias) > 7) err("dias", "Días trabajados entre 0 y 7.");
  if (x.horasDia === "" || x.horasDia == null || num(x.horasDia) < 0 || num(x.horasDia) > 24) err("horasDia", "Horas por día entre 0 y 24.");
  if (x.inicioReal === null) err("inicioReal", "Fecha de inicio real no válida.");
  if (x.finReal === null) err("finReal", "Fecha de fin real no válida.");
  if (x.inicioReal && x.finReal && toDay(x.finReal) < toDay(x.inicioReal)) err("finReal", "El fin real no puede ser anterior al inicio real.");
  if (num(x.metradoEjec) < 0) err("metradoEjec", "El metrado no puede ser negativo.");
  if (!(num(a.metrado) > 0) && (x.avanceManual === "" || x.avanceManual == null || num(x.avanceManual) < 0 || num(x.avanceManual) > 100))
    err("avance", "Sin metrado planificado, indica el avance acumulado (0 a 100 %).");
  for (const [c] of CATS) if (num(x.personal?.[c]) < 0) err("personal", "Las cantidades de personal no pueden ser negativas.");
  if ((x.perdidas || []).some((p) => !p.causa && (p.horas || p.personas))) err("perdidas", "Cada pérdida necesita una causa.");
  if (!x.registradoPor) err("registradoPor", "Indica quién registra.");
  return e;
}

// Construye el documento de registros/{uid}_{lunes}. `prev` es el registro existente (se conservan sus listas
// de equipos y calidad si la entrada no las trae, como pasa con el Excel de campo).
export function construirRegistro(a, w, x, prev = null) {
  const wIso = toIso(w);
  const { hayPlan, comp, metradoComp } = compromisoDe(a, w);
  const personal = {}; let tot = 0;
  for (const [c] of CATS) { const n = num(x.personal?.[c]); if (n) { personal[c] = n; tot += n; } }
  const met = x.metradoEjec === "" || x.metradoEjec == null ? null : num(x.metradoEjec);
  const acum = metradoPrev(a.uid, wIso) + num(met);
  const comprometida = comp ? "Sí" : hayPlan ? "No" : x.comprometida || "No"; // con plan congelado manda el plan
  const auto = comp ? cumplidaAuto(metradoComp, met) : null;
  const cumplida = comprometida === "Sí" ? auto || x.cumplida || "" : "";
  const keep = (k, d = null) => (x[k] !== undefined ? x[k] : prev?.[k] ?? d);
  return {
    id: regId(a.uid, w), uid: a.uid, idTarea: a.idTarea, semana: wIso,
    comprometida, cumplida, causaNC: cumplida === "No" ? x.causaNC || "" : "",
    metradoComp: comp ? metradoComp : null,
    inicioReal: x.inicioReal || "", finReal: x.finReal || "", turno: keep("turno", "Día"),
    dias: num(x.dias), horasDia: num(x.horasDia), personal, personalTotal: tot, hhTrab: tot * num(x.dias) * num(x.horasDia),
    hhExtra: x.hhExtra === "" || x.hhExtra == null ? null : num(x.hhExtra), hhImprod: keep("hhImprod"),
    hhPlanSemana: hhPlan(a, w, w + 6),
    metradoEjec: met, unidad: a.unidad || "", metradoAcum: acum,
    avance: x.finReal ? 100 : avanceFrom(a.metrado, acum, x.avanceManual),
    perdidas: (x.perdidas || []).filter((p) => p.causa),
    equipos: keep("equipos", []), protocolos: keep("protocolos"), noConformidades: keep("noConformidades"), retrabajoHH: keep("retrabajoHH"), incidentes: keep("incidentes"),
    registradoPor: x.registradoPor, fuente: x.fuente || "Tareo", fechaRegistro: new Date().toISOString(), obs: x.obs ?? prev?.obs ?? "",
  };
}
