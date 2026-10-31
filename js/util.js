// Utilidades puras: DOM mínimo, formato de números y fechas.
// Convención de fechas: un "día" es un entero (días desde 1970-01-01 en UTC). Así se evitan
// errores de huso horario; las fechas se guardan como texto ISO "AAAA-MM-DD".

import { MS, MONTHS } from "./config.js";

export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
export const fmtN = (n, d = 0) => Number(n || 0).toLocaleString("es-PE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
export const fmtPct = (x, d = 0) => (x == null || !isFinite(x) ? "—" : fmtN(100 * x, d) + " %");
export const newId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export const CHEV = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// <option> a partir de un catálogo [[código, nombre], ...].
export const opts = (list, cur, empty) => (empty !== undefined ? `<option value="">${empty}</option>` : "") +
  list.map(([c, n]) => `<option value="${esc(c)}"${c === cur ? " selected" : ""}>${esc(c)} · ${esc(n)}</option>`).join("");

// ---------- Fechas ----------
export const toDay = (iso) => { if (!iso) return NaN; const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d) / MS; };
export const toIso = (day) => new Date(day * MS).toISOString().slice(0, 10);
export const dow = (day) => new Date(day * MS).getUTCDay();
export const todayDay = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / MS; };
export const mondayOf = (day) => day - ((dow(day) + 6) % 7);
export const fmt = (day, withYear) => { const d = new Date(day * MS); return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]}${withYear ? " " + d.getUTCFullYear() : ""}`; };
export const fmtIso = (iso) => (iso ? fmt(toDay(iso), false) : "");
export const dayToDate = (day) => new Date(day * MS); // para Excel (fecha a medianoche UTC)
export const dateToIso = (v) => { // celda de Excel (Date o texto) → ISO o ""
  if (v == null || v === "") return "";
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null; // inválida
};

// Letra de columna de Excel (1 → A, 27 → AA).
export const colL = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// Almacenamiento del navegador tolerante a fallos (modo privado, sandbox).
export const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
