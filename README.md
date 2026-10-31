# Lookahead de Obra (v4)

Herramienta web para planificar y controlar obras con un **lookahead de 3 semanas**, registrar la **ejecución semanal** (manual o con un **Excel de campo**) y comparar el **cronograma proyectado** (línea base) con el **real** (as-built), con indicadores en **HH**.

- Página publicada: https://claude.ai/artifact/E5LB68eGP35DgYSpP8tcVV (datos compartidos en la nube).
- Copia sin conexión: `dist/lookahead.html` (guarda en el navegador). Trae los proyectos de ejemplo incluidos y los carga sola la primera vez que se abre sin proyectos.
- Respaldo físico: **Guardar respaldo** descarga el proyecto completo en un `.json`; **Abrir → Restaurar respaldo…** lo vuelve a cargar (en la nube o en la copia local).
- Proyectos de ejemplo: **Proy_Ejem_2M** (en curso, con registros hasta la semana 7) y **Proy_Ejem_Concluido** (terminado, con todas las semanas registradas).

## Documentación

| Documento | Para quién |
|---|---|
| [docs/MANUAL_USUARIO.md](docs/MANUAL_USUARIO.md) | Planificadores, oficina técnica y supervisores: cómo usar la herramienta y el ciclo semanal. |
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Desarrolladores (o agentes): módulos, modelo de datos, flujos, cálculos y cómo extender. |

## Inicio rápido (desarrollo)

```bash
npm install          # solo instala esbuild (empaquetador)
npm run dev          # sirve la carpeta en http://localhost:8080 (módulos ES, sin compilar)
npm run build        # genera dist/index.html (publicación) y dist/lookahead.html (sin conexión)
python3 scripts/ejemplo_2m.py > ejemplo_2m.json                    # ejemplo en curso
python3 scripts/ejemplo_2m.py --concluido > ejemplo_concluido.json # ejemplo terminado
npm run ejemplos     # regenera data/ejemplos.js (ejemplos incluidos en la copia sin conexión)
```

No hay servidor propio: la página usa la base de datos de la plataforma de Artifacts cuando está publicada, y `localStorage` en cualquier otro caso. ExcelJS y JSZip se cargan desde cdnjs.

## Estructura

```
index.html            marcado de la página (pestañas y paneles)
css/app.css           estilos y tokens de color (claro/oscuro)
js/
  main.js             arranque y render general
  config.js           catálogos (disciplinas, tipos, causas, categorías…) y constantes
  util.js             fechas (días UTC), formato, utilidades DOM
  ui.js               toast, modal, descarga y selección de archivos
  store.js            base de datos: nube (Artifact) o local, misma interfaz
  state.js            estado en memoria + consultas derivadas (selectores)
  data.js             TODAS las escrituras y suscripciones a la base
  model/metrics.js    PV/EV/AC, SPI/CPI/EAC, PAC, histogramas, segmentos as-built
  model/registro.js   reglas del registro semanal (formulario y Excel usan las mismas)
  views/*.js          una por pestaña (+ charts.js para SVG y nav.js para pestañas)
  io/excel-campo.js   Excel de campo: exportar, leer, validar, vista previa y carga
  io/excel-report.js  Excel de reporte con fórmulas
  io/excel-charts.js  gráficos nativos de Excel (hoja Gráficos) agregados al .xlsx
  io/csv-export.js    ZIP de CSV por tabla + datos.json
  io/respaldo.js      respaldo .json del proyecto: guardar y restaurar
scripts/build.mjs     empaquetado a un solo HTML
scripts/ejemplo_2m.py generador del proyecto de ejemplo
scripts/ejemplos_js.py empaqueta ambos ejemplos en data/ejemplos.js
data/ejemplos.js      ejemplos incluidos en la copia sin conexión
```
