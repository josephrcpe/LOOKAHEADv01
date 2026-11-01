// Catálogos y constantes de la herramienta. Cambiar aquí un catálogo lo cambia en formularios, Excel y CSV.
// Los códigos se guardan en la base de datos: no renombres un código existente, solo agrega nuevos.

export const DAYS = 21; // horizonte del lookahead (3 semanas)
export const MS = 86400000;
export const DOW = ["D", "L", "M", "M", "J", "V", "S"];
export const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Claves de almacenamiento del navegador (modo local y preferencias de vista).
export const LS_KEY = "lookahead-db-v3";
export const PID_KEY = "lookahead-pid";
export const EJ_KEY = "lookahead-ejemplos-v1"; // marca: los ejemplos ya se ofrecieron en este navegador
export const UI_KEY = "lookahead-ui-v2";
export const WHO_KEY = "lookahead-registrador";

// Versión del formato del Excel de campo; el importador rechaza archivos de otra versión.
export const CAMPO_VERSION = "campo-v1";

// Disciplinas con sus tipos de actividad (el código del tipo forma parte del Id Tarea).
export const DISC = [
  { name: "Montaje de estructuras", short: "ME", cssVar: "--d0", hex: "2F6DB5",
    tipos: [["NI", "Nivelación de placas base"], ["PE", "Pre-ensamble en piso"], ["MO", "Montaje (izaje)"], ["AL", "Alineamiento"], ["TQ", "Torqueo"], ["TU", "Touch-up"]],
    esp: ["Estructuras metálicas", "Estructuras pesadas", "Pernos y conexiones", "Pintura"] },
  { name: "Obras civiles", short: "OC", cssVar: "--d1", hex: "B8682A",
    tipos: [["EX", "Excavación"], ["EN", "Encofrado y desencofrado"], ["AC", "Acero de refuerzo"], ["VC", "Vaciado de concreto"], ["RC", "Relleno y compactación"]],
    esp: ["Movimiento de tierras", "Concreto", "Cimentaciones", "Grouting"] },
];

// Categorías de personal del registro semanal (promedio diario por categoría).
export const CATS = [["CAP", "Capataz"], ["OPE", "Operario"], ["OFI", "Oficial"], ["AYU", "Ayudante"], ["RIG", "Rigger"], ["SOL", "Soldador"], ["OPG", "Operador de equipo"]];

// Causas de no cumplimiento y de pérdida de horas (mismo catálogo para PAC y Pareto).
export const CAUSAS = [
  ["CLI-LLU", "Clima: lluvia o nieve"], ["CLI-TEL", "Clima: tormenta eléctrica"], ["CLI-VIE", "Clima: viento fuerte"],
  ["EQP-ESP", "Espera de grúa o equipo"], ["EQP-FAL", "Falla de equipo"],
  ["MAT-FAL", "Falta de material o suministro"], ["MAT-NC", "Material defectuoso o no conforme"],
  ["ING-INF", "Falta de planos o información (RFI)"], ["FRE-NOD", "Frente de trabajo no disponible"],
  ["PRE-PEN", "Predecesora no terminada"], ["INT-OTR", "Interferencia con otros contratistas"],
  ["PER-PEN", "Permisos o autorizaciones pendientes"], ["SEG-PAR", "Parada por seguridad"],
  ["MO-FAL", "Falta de personal"], ["PLA-REN", "Rendimiento planificado no realista"], ["OTR", "Otra causa"],
];

export const RTIPOS = [["DIS", "Diseño o ingeniería"], ["MAT", "Materiales"], ["EQP", "Equipos"], ["MO", "Mano de obra"], ["PER", "Permisos"], ["PRE", "Predecesora"], ["FRE", "Frente de trabajo"], ["SEG", "Seguridad"], ["CAL", "Calidad"], ["OTR", "Otra"]];
export const UNIDADES = ["t", "pza", "und", "perno", "m", "m²", "m³", "kg", "glb"];
export const FUENTES = ["Tareo", "Parte diario", "Reporte de supervisión", "Excel de campo"];
export const EQUIPOS = ["Grúa sobre orugas", "Grúa telescópica", "Camión grúa", "Manlift", "Telehandler", "Retroexcavadora", "Excavadora", "Rodillo compactador", "Mixer", "Bomba de concreto"];

// Sector/Zona: código de Oficina Técnica, solo mayúsculas, números y guiones.
export const SECTOR_RE = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;

// Meta de PAC (Porcentaje de Actividades Completadas) para el gráfico semanal.
export const PAC_META = 0.8;

// Lookups sobre los catálogos.
export const name = (list, code) => (list.find(([c]) => c === code) || [code, code || ""])[1];
export const discOf = (n) => DISC.find((d) => d.name === n);
export const discIdx = (n) => Math.max(0, DISC.findIndex((d) => d.name === n));
export const tipoName = (code) => { for (const d of DISC) for (const [c, n] of d.tipos) if (c === code) return n; return code || ""; };
export const discOfTipo = (code) => DISC.find((d) => d.tipos.some(([c]) => c === code)) || null;
