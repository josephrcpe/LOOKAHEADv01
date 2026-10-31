// Capa de almacenamiento. Ofrece la misma interfaz en dos modos:
//  - "db": base de datos compartida de la página publicada (window.claude.use("db")).
//  - "local": copia en el navegador (localStorage), para uso sin conexión o fuera de la página publicada.
// Interfaz usada por la app: db.doc(path).{get,set,delete,onSnapshot} y db.collection(path).{doc,get,onSnapshot}.
// Las rutas alternan colección/documento: "proyectos/{pid}/tareas/{uid}".

import { LS_KEY } from "./config.js";
import { lsSet } from "./util.js";

export function makeLocalDb() {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { data = {}; }
  const listeners = new Set();
  const persist = () => lsSet(LS_KEY, JSON.stringify(data));
  const notify = () => { for (const l of [...listeners]) l(); };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const snapDoc = (path) => ({ id: path.split("/").pop(), exists: path in data, data: () => (path in data ? clone(data[path]) : undefined) });
  const snapCol = (path) => {
    const pre = path + "/";
    const docs = Object.keys(data).filter((k) => k.startsWith(pre) && !k.slice(pre.length).includes("/")).map(snapDoc);
    return { docs, size: docs.length, empty: !docs.length };
  };
  const listen = (fn) => { listeners.add(fn); setTimeout(fn, 0); return () => listeners.delete(fn); };
  const docRef = (path) => ({
    id: path.split("/").pop(), path,
    async get() { return snapDoc(path); },
    async set(d) { data[path] = clone(d); persist(); notify(); },
    async delete() { delete data[path]; persist(); notify(); },
    onSnapshot(cb) { return listen(() => cb(snapDoc(path))); },
  });
  return {
    doc: docRef,
    collection: (path) => ({ path, doc: (id) => docRef(path + "/" + id), async get() { return snapCol(path); }, onSnapshot(cb) { return listen(() => cb(snapCol(path))); } }),
  };
}

// Devuelve { db, mode, readOnly }. Intenta la base compartida y, si no existe, usa la local.
export async function openStore() {
  let handle = null;
  if (window.claude && typeof window.claude.use === "function") {
    try { handle = await window.claude.use("db"); } catch (e) { handle = null; }
  }
  if (!handle) return { db: makeLocalDb(), mode: "local", readOnly: false };
  let readOnly = false;
  try {
    const user = await window.claude.use("user");
    const can = user && typeof user.can === "function" ? await user.can("data.write") : null;
    if (can === false) readOnly = true;
  } catch (e) { /* sin información de permisos */ }
  return { db: handle, mode: "db", readOnly };
}
