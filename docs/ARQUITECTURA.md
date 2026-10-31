# Arquitectura (para desarrolladores y agentes)

Guía para revisar o extender el código. Léela junto con los comentarios de cabecera de cada módulo.

## 1. Principios

1. **Sin servidor propio.** Página estática. Persistencia vía `window.claude.use("db")` en la página publicada o `localStorage` fuera de ella (`store.js`, misma interfaz).
2. **Un solo lugar para cada responsabilidad.**
   - Escrituras a la base: solo `data.js`.
   - Reglas del registro semanal: solo `model/registro.js` (las usan el formulario y el Excel de campo).
   - Cálculos de control: solo `model/metrics.js` (sin DOM, fáciles de probar).
   - Catálogos: solo `config.js`.
3. **Lo real nunca sobrescribe lo planificado.** La línea base es inmutable; los registros semanales se guardan aparte; el programa vigente (tareas) sí se reprograma, y cada corte guarda una foto del programa.
4. **Fechas como días enteros UTC** (`util.toDay`, `toIso`): evita errores de huso horario. En la base se guardan como texto `AAAA-MM-DD`. Las semanas empiezan en **lunes**.
5. **Módulos ES sin framework.** Las vistas generan HTML con plantillas y `esc()` para todo texto del usuario.

## 2. Flujo de datos

```
base (nube/local) ──onSnapshot──► data.js ──► state (state.js) ──emit──► main.renderAll()
       ▲                                                                       │
       └──────────── data.js (saveTask, saveReg, savePlan, saveCorte…) ◄── vistas / io
```

- `data.openProject(pid)` se suscribe al documento del proyecto y a sus 6 subcolecciones; cada cambio actualiza `state` y emite el nombre de la colección (`acts`, `regs`, …) y `render`.
- `main.renderAll()` agrupa repintados (microtarea) y pinta la cabecera y **solo la pestaña visible**.
- Eventos (`state.on/emit`): `render`, `project`, `opened`, y uno por colección.

## 3. Modelo de datos

Rutas alternan colección/documento. Todas cuelgan de `proyectos/{pid}`.

| Ruta | Contenido | Escribe |
|---|---|---|
| `proyectos/{pid}` | `nombre, inicio` (inicio del horizonte de 3 semanas), `jornada` ("7", "6", "5"), `horasDia`, `sectores {código: nombre}`, `creado, modificado` | `saveProj`, `createProject` |
| `…/tareas/{uid}` | **Programa vigente.** `idTarea, num, desc, disciplina, especialidad, tipo, sector, inicio, fin, personal, metrado, unidad, peso, altura, resp, nivel, ejes, plano, pred (uid), obs, noPlanificada?` | `saveTask`, carga de corte |
| `…/lineasBase/v{n}` | **Cronograma proyectado** congelado: `version, fecha, motivo, jornada, horasDia, tareas[]` (copia con `hhPlan`) | `freezeBaseline` |
| `…/planesSemanales/{lunes}` | Compromisos de la semana: `semana, fecha, congeladoPor, compromisos[{uid, idTarea, metradoComp, unidad, hhComp}]` | `savePlan`, `deletePlan` (solo sin registros) |
| `…/registros/{uid}_{lunes}` | **Ejecución real** semanal (ver §5) | `saveReg` |
| `…/cortes/{lunes}` | Historial de cargas de Excel: `fecha, cargadoPor, archivo, resumen, programa[] (foto del programa), log[]` | `saveCorte` |
| `…/restricciones/{id}` | `uid, idTarea, tipo, desc, responsable, fechaCompromiso, fechaLiberacion, estado` | `addRestr`, `freeRestr` |

**Id Tarea** = `{Sector}.{Tipo}.{NNN}`; el correlativo es por tipo en todo el proyecto (`views/entrada.nextNum`). El `uid` es la clave estable: el Excel de campo y los registros se enlazan por `uid`, no por Id Tarea.

## 4. Cálculos (`model/metrics.js`) — alternativa B, solo HH

| Indicador | Definición |
|---|---|
| HH plan de una tarea | personal × días laborables × h/día (`state.hhPlan`) |
| **PV** semanal | HH de la última línea base repartidas por día laborable (jornada y h/día de esa línea base) |
| **Avance** | por metrados: metrado acumulado ÷ metrado planificado (tope 100 %). Con fecha real de fin = 100 %. Sin metrado: % manual. |
| **EV** | Σ avance × HH de línea base, al cierre de cada semana hasta el corte |
| **AC** | Σ (HH trabajadas + HH extra) de los registros |
| SPI, CPI, EAC | EV/PV, EV/AC, BAC/CPI |
| **PAC** | compromisos con `cumplida = "Sí"` ÷ compromisos del plan congelado. Cumplida automática si metrado ejecutado ≥ comprometido. |
| Personal plan vs real | personas-día ÷ días laborables de la semana |
| Pareto | HH perdidas (horas × personas) por causa |
| Factor de productividad | AC ÷ EV por tipo de actividad (1 = plan) |
| Segmentos as-built | días trabajados de cada semana, colocados desde el inicio real en días laborables |

**Corte** = la última semana con registros (`cutWeek`).

## 5. Registro semanal (`model/registro.js`)

`construirRegistro(tarea, lunes, entrada, previo)` produce el documento; `validarEntrada` devuelve errores `{campo, msg}`. Campos principales: `comprometida, cumplida, causaNC, metradoComp, inicioReal, finReal, dias, horasDia, personal{CAP,OPE,…}, personalTotal, hhTrab, hhExtra, hhPlanSemana, metradoEjec, metradoAcum, avance, perdidas[], equipos[], registradoPor, fuente, fechaRegistro`. Si existe plan congelado, **manda el plan** (comprometida no se edita).

## 6. Excel de campo (`io/excel-campo.js`)

- `COLS` define columnas una sola vez (clave, encabezado, tipo `lock | new | edit | f`). Exportación y lectura dependen de ese orden: **agrega columnas al final de su bloque y sube `CAMPO_VERSION`** en `config.js` si cambias el formato.
- Hoja `_meta` (muy oculta): `version, pid, semana`. El importador rechaza otro proyecto u otra versión.
- `readCampo` → `planCambios` (valida y arma registros, reprogramaciones y tareas no planificadas; estados `ok | aviso | error | omitida`) → vista previa → `aplicar` (escribe y guarda el corte). Las filas con error no se cargan.

### Respaldo (`io/respaldo.js`)

- Archivo `.json`: `{ formato: "lookahead-respaldo", version: 1, exportado, pid, proyecto, colecciones: { tareas, lineasBase, planesSemanales, registros, cortes, restricciones } }`. Las colecciones salen de `SUBS` en `data.js`, así que una subcolección nueva entra sola en el respaldo.
- Restaurar: `validar` → resumen → `data.js → escribirProyecto(pid, proyecto, colecciones, reemplazar)`. Como nuevo usa un pid nuevo; reemplazar usa el pid del respaldo y borra antes los documentos que el respaldo no trae. Si cambias la forma del archivo, sube `VERSION` y acepta las anteriores.

## 7. Cómo extender

- **Nuevo tipo de actividad, causa o categoría:** agrégalo en `config.js` (no renombres códigos existentes).
- **Nuevo campo de tarea:** `index.html` (input `f-xxx`), `views/entrada.js` (`FIELDS`, validación), exportaciones en `io/`.
- **Nuevo indicador:** función pura en `model/metrics.js` + presentación en `views/indicadores.js` usando `charts.js` (un eje Y, colores `--s1..--s3`, tooltip `data-tip`).
- **Nueva pestaña:** `<section id="view-x">` y botón `.tab` en `index.html`, agregar a `VIEWS` (`nav.js`) y a `RENDER` (`main.js`).

## 8. Pruebas y publicación

- Desarrollo: `npm run dev` y abrir `http://localhost:8080`. Sin conexión a la plataforma usa `localStorage` (clave `lookahead-db-v3`); en modo local, si no hay proyectos, `data.js → cargarEjemplos()` importa `data/ejemplos.js` (generado con `npm run ejemplos`) y lo escribe con `db.setMany`. El mismo botón está en Abrir → Cargar proyectos de ejemplo.
- Prueba integral usada (Playwright): carga el ejemplo, recorre las 5 pestañas, exporta el Excel de campo, lo llena, lo vuelve a cargar, exporta Excel y CSV, revisa modo oscuro y ancho de 390 px sin desborde.
- Publicación: `npm run build` y publicar `dist/index.html` en el mismo Artifact (capacidades `db`, `user`, `downloads`).
