# Manual de usuario

## Qué hace

Planifica la obra en un **lookahead de 3 semanas**, registra lo **ejecutado cada semana** y compara al final dos cronogramas: el **proyectado** (línea base) y el **real**. Todo el control se mide en **HH** y el avance se calcula **por metrados**.

## Pestañas

| Pestaña | Para qué |
|---|---|
| **Entrada de actividades** | Crear y editar actividades (programa vigente) y congelar la línea base. |
| **Diagrama de Gantt** | Ver las 3 semanas del horizonte con personal por día y totales. La barra gris delgada es la línea base. |
| **Ejecución** | Ciclo semanal: plan, Excel de campo, corte y registros. Restricciones. |
| **Gantt real** | Todo el proyecto: proyectado (gris) frente a lo ejecutado (color) y lo que falta (punteado). |
| **Indicadores** | Curva S (PV, EV, AC), SPI, CPI, EAC, PAC semanal, personal plan vs real, Pareto de pérdidas y factor de productividad. |

Arriba: **Nuevo**, **Guardar como…** (copia completa) y **Abrir** para cambiar de proyecto; inicio del horizonte, jornada y horas por día.

## 1. Planificar

1. En **Entrada**, registra cada actividad: descripción, disciplina, tipo, sector/zona, fechas, personal y **metrado con su unidad** (necesario para medir avance).
2. El **Id Tarea** se genera solo: `Sector.Tipo.001`.
3. Cuando el plan esté aprobado, pulsa **Congelar línea base**. Desde ahí, todo cambio de fechas se ve como desvío.

## 2. Ciclo semanal (Ejecución)

| Cuándo | Quién | Qué hacer |
|---|---|---|
| Antes de empezar la semana | Planificador | **1 · Congelar plan**: marca los compromisos y el metrado comprometido (la herramienta sugiere uno). |
| Inicio de semana | Planificador | **2 · Exportar Excel de campo** y entregarlo al supervisor. |
| Durante la semana | Personal de campo | Llenar solo las **celdas amarillas** del Excel. |
| Cierre (p. ej. domingo) | Oficina técnica | **3 · Cargar corte (Excel)**, revisar la vista previa y confirmar. |

### Cómo se llena el Excel de campo

- **Metrado ejecutado (semana)**: lo hecho esa semana, en la unidad de la actividad.
- **Días trabajados** y **horas efectivas/día**; **personal por categoría** (promedio diario).
- **Causa no cumplimiento**: obligatoria si no se alcanzó el metrado comprometido.
- **Causa de pérdida, horas perdidas, personas afectadas**: para el Pareto de pérdidas.
- **Inicio real / Fin real** cuando corresponda. **Nuevo inicio/fin proyectado** si cambia la fecha prevista.
- Filas **(nueva)** al final: trabajos no planificados (descripción, sector, tipo, unidad).
- No cambies nombres de hojas ni el orden de columnas.

### Qué pasa al cargar el corte

- Cada fila se valida. La vista previa marca **OK**, **Aviso** (se carga) o **Error** (no se carga; corrige el Excel y vuelve a cargar).
- Se guarda un registro semanal por actividad, se actualizan las fechas del programa vigente y se crean las actividades no planificadas.
- La **línea base no cambia**. Volver a cargar la misma semana reemplaza los registros de esa semana.
- También puedes registrar o corregir una actividad a mano con **Registrar / Editar**.

## 3. Leer los indicadores

- **SPI < 1**: vas atrasado (ganaste menos HH de las planificadas a la fecha).
- **CPI < 1**: estás usando más HH de las que vale lo avanzado.
- **EAC**: HH que costará terminar si el rendimiento sigue igual.
- **PAC**: % de compromisos semanales cumplidos (meta 80 %). Mira sus causas debajo del gráfico.
- **Factor de productividad > 1**: ese tipo de actividad consume más HH que lo planificado.

## 4. Exportar

- **Exportar a Excel**: reporte con fórmulas (lookahead, ejecución, pérdidas, equipos, restricciones, planes semanales, curva S, indicadores, línea base y catálogos).
- **Exportar datos (CSV)**: ZIP con una tabla por archivo, lista para análisis y para juntar varios proyectos.

## 5. Proyectos de ejemplo

**Proy_Ejem_2M**: 21 actividades en dos sectores (ESP0240 Stock Pile, ESP0310 Edificio de Molienda), del 7 de setiembre al 1 de noviembre de 2026. Tiene registros hasta la semana 7 y la **semana 8 con plan congelado y sin registros**, para que pruebes el flujo del Excel de campo.

**Proy_Ejem_Concluido**: el mismo proyecto ejecutado hasta el final. La línea base iba del 6 de julio al 29 de agosto de 2026 y la obra terminó el 17 de septiembre (+19 días). Tiene 11 semanas con plan congelado, registros y corte, y todas las restricciones están liberadas. Sirve para ver el ciclo completo: la curva S cerrada, el PAC semana a semana, el as-built frente al proyectado y las causas de pérdida. Al terminar un proyecto, el SPI vuelve a 1 aunque haya atraso; el atraso real se lee en **Gantt real**.
