"""Genera el proyecto de ejemplo de 2 meses (Proy_Ejem_2M) con ejecución simulada.

Salida: un JSON {ruta: documento} con el mismo formato que la base de datos de la app
(ver docs/ARQUITECTURA.md › Modelo de datos). Uso:
    python3 scripts/ejemplo_2m.py > ejemplo_2m.json

Escenario: 8 semanas (07-sep a 01-nov-2026), lunes a sábado, 10 h/día, dos sectores.
Lo real se simula hasta el corte de la semana 7 (25-oct); la semana 8 tiene plan congelado
y ningún registro, para probar el flujo con el Excel de campo.

Con --concluido genera Proy_Ejem_Concluido: el mismo proyecto ejecutado hasta el final
(todas las semanas registradas, restricciones liberadas) y desplazado 9 semanas antes
(06-jul a 29-ago-2026 en línea base), para revisar el ciclo completo y el as-built.
    python3 scripts/ejemplo_2m.py --concluido > ejemplo_concluido.json
"""
import json, sys, re, datetime as dt, random

random.seed(7)
CONC = "--concluido" in sys.argv
PID = "proy-ejem-concluido" if CONC else "proy-ejem-2m"
NOMBRE = "Proy_Ejem_Concluido" if CONC else "Proy_Ejem_2M"
SHIFT = -63 if CONC else 0  # días que se desplazan todas las fechas al final
BASE = f"proyectos/{PID}"
H = 10  # horas por día
D = lambda s: dt.date.fromisoformat(s)
iso = lambda d: d.isoformat()
work = lambda d: d.weekday() != 6  # lunes a sábado
monday = lambda d: d - dt.timedelta(days=d.weekday())
W1 = D("2026-09-07"); CUT = D("2026-12-06") if CONC else D("2026-10-25")  # último día con datos reales
WEEKS = [W1 + dt.timedelta(weeks=i) for i in range(13 if CONC else 8)]

def workdays(a, b):
    n, d = [], a
    while d <= b:
        if work(d): n.append(d)
        d += dt.timedelta(days=1)
    return n

def add_workdays(start, n):
    """Devuelve el n-ésimo día laborable contando start (n >= 1)."""
    d = start
    while not work(d): d += dt.timedelta(days=1)
    k = 1
    while k < n:
        d += dt.timedelta(days=1)
        if work(d): k += 1
    return d

MONTAJE, CIVIL = "Montaje de estructuras", "Obras civiles"
# (sector, tipo, desc, inicio, fin, personal, metrado, unidad, pred#, especialidad, extra)
ACTS = [
    ("ESP0310", "EX", "Excavación de zapatas ejes 1-4", "2026-09-07", "2026-09-12", 8, 420, "m³", None, "Movimiento de tierras", {}),
    ("ESP0310", "AC", "Acero de refuerzo de zapatas", "2026-09-12", "2026-09-19", 10, 18, "t", 1, "Concreto", {}),
    ("ESP0310", "EN", "Encofrado de zapatas y pedestales", "2026-09-14", "2026-09-22", 8, 260, "m²", 1, "Concreto", {}),
    ("ESP0310", "VC", "Vaciado de concreto de zapatas y pedestales", "2026-09-21", "2026-09-26", 9, 210, "m³", 3, "Concreto", {}),
    ("ESP0310", "RC", "Relleno y compactación alrededor de zapatas", "2026-09-28", "2026-10-03", 6, 380, "m³", 4, "Movimiento de tierras", {}),
    ("ESP0310", "NI", "Nivelación de placas base y grout", "2026-09-28", "2026-10-02", 4, 32, "pza", 4, "Estructuras metálicas", {}),
    ("ESP0310", "PE", "Pre-ensamble de columnas y vigas en piso", "2026-09-28", "2026-10-10", 8, 95, "t", None, "Estructuras metálicas", {}),
    ("ESP0310", "MO", "Montaje de columnas ejes 1-4", "2026-10-05", "2026-10-14", 12, 60, "t", 6, "Estructuras pesadas", {"peso": 8.5, "altura": 18, "ejes": "1-4 / A-D", "plano": "0310-ST-DWG-101 Rev. 2"}),
    ("ESP0310", "MO", "Montaje de vigas y arriostres", "2026-10-12", "2026-10-22", 12, 48, "t", 8, "Estructuras metálicas", {"peso": 4.2, "altura": 22, "nivel": "EL. +18.00", "plano": "0310-ST-DWG-102 Rev. 1"}),
    ("ESP0310", "AL", "Alineamiento y aplome de estructura", "2026-10-19", "2026-10-24", 6, 108, "t", 9, "Estructuras metálicas", {}),
    ("ESP0310", "TQ", "Torqueo de pernos de conexión", "2026-10-21", "2026-10-29", 6, 1450, "perno", 10, "Pernos y conexiones", {}),
    ("ESP0310", "TU", "Touch-up de pintura", "2026-10-26", "2026-10-31", 4, 620, "m²", 11, "Pintura", {}),
    ("ESP0240", "EX", "Excavación de túnel de recuperación", "2026-09-07", "2026-09-16", 10, 650, "m³", None, "Movimiento de tierras", {}),
    ("ESP0240", "AC", "Acero de refuerzo de losa y muros del túnel", "2026-09-16", "2026-09-30", 12, 42, "t", 13, "Concreto", {}),
    ("ESP0240", "EN", "Encofrado de muros del túnel", "2026-09-21", "2026-10-06", 10, 540, "m²", None, "Concreto", {}),
    ("ESP0240", "VC", "Vaciado de losa y muros del túnel", "2026-09-28", "2026-10-10", 10, 380, "m³", 15, "Concreto", {}),
    ("ESP0240", "RC", "Relleno sobre túnel", "2026-10-12", "2026-10-24", 8, 1200, "m³", 16, "Movimiento de tierras", {}),
    ("ESP0240", "NI", "Nivelación de placas base de faja", "2026-10-12", "2026-10-15", 4, 24, "pza", 16, "Estructuras metálicas", {}),
    ("ESP0240", "MO", "Montaje de estructura de faja transportadora", "2026-10-15", "2026-10-27", 10, 38, "t", 18, "Estructuras metálicas", {"peso": 3.1, "altura": 14}),
    ("ESP0240", "TQ", "Torqueo de estructura de faja", "2026-10-26", "2026-10-30", 4, 620, "perno", 19, "Pernos y conexiones", {}),
    ("ESP0240", "TU", "Touch-up de estructura de faja", "2026-10-29", "2026-10-31", 3, 180, "m²", 20, "Pintura", {}),
]
DISC_OF = {t: (MONTAJE if t in ("NI", "PE", "MO", "AL", "TQ", "TU") else CIVIL) for t in ["EX", "EN", "AC", "VC", "RC", "NI", "PE", "MO", "AL", "TQ", "TU"]}
RESP = {CIVIL: "J. Quispe", MONTAJE: "R. Salazar"}

# Realidad simulada: (inicio real, factor de duración, factor de personal, eventos {fecha: (causa, horas_perdidas)})
REAL = {
    1: ("2026-09-07", 1.0, 1.0, {}),
    2: ("2026-09-12", 1.0, 1.0, {}),
    3: ("2026-09-14", 1.15, 1.0, {}),
    4: ("2026-09-23", 1.0, 1.1, {}),
    5: ("2026-09-30", 1.0, 1.0, {}),
    6: ("2026-09-30", 1.0, 1.0, {}),
    7: ("2026-10-01", 1.1, 0.9, {"2026-10-02": ("MAT-FAL", 10), "2026-10-03": ("MAT-FAL", 10)}),
    8: ("2026-10-08", 1.05, 1.0, {"2026-10-09": ("EQP-ESP", 4), "2026-10-14": ("CLI-TEL", 4), "2026-10-15": ("CLI-TEL", 3)}),
    9: ("2026-10-16", 1.0, 1.0, {"2026-10-21": ("CLI-VIE", 3)}),
    10: ("2026-10-28", 1.0, 1.0, {}) if CONC else None,
    11: ("2026-11-02", 1.1, 1.0, {"2026-11-05": ("MAT-FAL", 10)}) if CONC else None,
    12: ("2026-11-12", 1.0, 1.0, {"2026-11-14": ("CLI-LLU", 5)}) if CONC else None,
    13: ("2026-09-07", 1.2, 1.0, {"2026-09-15": ("CLI-LLU", 10), "2026-09-16": ("CLI-LLU", 6)}),
    14: ("2026-09-18", 1.05, 1.0, {}),
    15: ("2026-09-22", 1.0, 0.9, {}),
    16: ("2026-10-01", 1.15, 1.0, {"2026-10-06": ("EQP-FAL", 6)}),
    17: ("2026-10-15", 1.0, 1.0, {}),
    18: ("2026-10-15", 1.0, 1.0, {}),
    19: ("2026-10-21", 1.0, 1.0, {"2026-10-23": ("EQP-ESP", 4)}),
    20: ("2026-11-04", 1.0, 1.0, {}) if CONC else None,
    21: ("2026-11-10", 1.0, 1.0, {}) if CONC else None,
}
CAT_MIX = {CIVIL: [("CAP", 1), ("OPE", .4), ("OFI", .3), ("AYU", .3)], MONTAJE: [("CAP", 1), ("RIG", .3), ("SOL", .15), ("OPE", .25), ("AYU", .2), ("OPG", .1)]}

def personal_cats(disc, total):
    cats, rest = {}, total
    for c, k in CAT_MIX[disc]:
        n = 1 if k == 1 else max(0, round((total - 1) * k))
        n = min(n, rest); cats[c] = n; rest -= n
    if rest > 0: cats["AYU"] = cats.get("AYU", 0) + rest
    return {c: n for c, n in cats.items() if n}

docs = {}
counter = {}
acts = []
for i, (sec, tipo, desc, ini, fin, pers, met, uni, pred, esp, extra) in enumerate(ACTS, 1):
    counter[tipo] = counter.get(tipo, 0) + 1
    uid = f"e2m{i:02d}"
    acts.append(dict(uid=uid, idTarea=f"{sec}.{tipo}.{counter[tipo]:03d}", num=counter[tipo], desc=desc, disciplina=DISC_OF[tipo], especialidad=esp,
                     tipo=tipo, sector=sec, inicio=ini, fin=fin, personal=pers, metrado=met, unidad=uni, peso=extra.get("peso"), altura=extra.get("altura"),
                     resp=RESP[DISC_OF[tipo]], nivel=extra.get("nivel", ""), ejes=extra.get("ejes", ""), plano=extra.get("plano", ""),
                     pred=f"e2m{pred:02d}" if pred else "", obs="", creado="2026-09-02T14:00:00.000Z", modificado="2026-09-02T14:00:00.000Z"))
byn = {i + 1: a for i, a in enumerate(acts)}

# Línea base v1 (proyectado).
docs[f"{BASE}/lineasBase/v1"] = {"version": 1, "fecha": "2026-09-04T22:00:00.000Z", "motivo": "Línea base inicial", "jornada": "6", "horasDia": H,
    "tareas": [dict(uid=a["uid"], idTarea=a["idTarea"], desc=a["desc"], disciplina=a["disciplina"], especialidad=a["especialidad"], tipo=a["tipo"], sector=a["sector"],
                    inicio=a["inicio"], fin=a["fin"], personal=a["personal"], metrado=a["metrado"], unidad=a["unidad"],
                    hhPlan=a["personal"] * len(workdays(D(a["inicio"]), D(a["fin"]))) * H, peso=a["peso"], altura=a["altura"], pred=a["pred"]) for a in acts]}

# Simulación diaria de lo real.
daily = {}   # uid -> list of (date, metrado, horas_trab, perdida(causa, horas) | None, personal)
real_end = {}
for n, a in byn.items():
    r = REAL[n]
    if not r: continue
    ini, fdur, fpers, ev = r
    plan_days = len(workdays(D(a["inicio"]), D(a["fin"])))
    need = max(1, round(plan_days * fdur))
    pers = max(2, round(a["personal"] * fpers))
    rate = a["metrado"] / need
    d, done, rows = D(ini), 0.0, []
    effective = 0
    while effective < need and d <= CUT:
        if work(d):
            e = ev.get(iso(d))
            lost = e[1] if e else 0
            frac = (H - lost) / H
            m = rate * frac if lost < H else 0
            if lost < H: effective += frac
            m = min(m, a["metrado"] - done); done += m
            rows.append((d, m, H - lost, (e[0], lost) if e else None, pers))
        d += dt.timedelta(days=1)
    daily[a["uid"]] = rows
    if done >= a["metrado"] - 1e-6: real_end[a["uid"]] = max(x[0] for x in rows if x[1] > 0)

def week_rows(uid, w):
    return [x for x in daily.get(uid, []) if w <= x[0] <= w + dt.timedelta(days=6)]

def acum_before(uid, w):
    return sum(x[1] for x in daily.get(uid, []) if x[0] < w)

# Planes semanales (semanas 1-7): se compromete lo que el programa vigente de ese momento esperaba hacer
# (ritmo planificado × días programados en la semana). Las pérdidas reales y el optimismo generan incumplimientos.
regs, planes = {}, {}
OPTIMISMO = {"e2m03": 1.15, "e2m15": 1.12, "e2m14": 1.08}
NC_DEFAULT = {"e2m03": "PLA-REN", "e2m07": "MAT-FAL", "e2m08": "EQP-ESP", "e2m15": "MO-FAL", "e2m16": "EQP-FAL", "e2m13": "CLI-LLU", "e2m09": "CLI-VIE", "e2m19": "EQP-ESP", "e2m14": "PLA-REN"}
LAST = max(x[0] for rows in daily.values() for x in rows)
REGW = [w for w in WEEKS if w <= LAST] if CONC else WEEKS[:7]  # semanas con registro
need_of = {}
for n, a in byn.items():
    r = REAL[n]
    if r: need_of[a["uid"]] = max(1, round(len(workdays(D(a["inicio"]), D(a["fin"]))) * r[1]))
for wi, w in enumerate(REGW):
    comps = []
    for a in acts:
        rows = week_rows(a["uid"], w)
        if not rows: continue
        pend = a["metrado"] - acum_before(a["uid"], w)
        comp = min(pend, a["metrado"] / need_of[a["uid"]] * len(rows) * OPTIMISMO.get(a["uid"], 1.0))
        dec = 0 if a["unidad"] in ("pza", "perno", "und") else 1
        comp = round(comp, dec)
        if comp <= 0: continue
        hh = a["personal"] * len([d for d in workdays(D(a["inicio"]), D(a["fin"])) if w <= d <= w + dt.timedelta(days=6)]) * H
        comps.append({"uid": a["uid"], "idTarea": a["idTarea"], "comprometida": True, "metradoComp": comp, "unidad": a["unidad"], "hhComp": hh})
    planes[iso(w)] = {"semana": iso(w), "fecha": iso(w - dt.timedelta(days=2)) + "T21:00:00.000Z", "congeladoPor": "Vicente", "compromisos": comps}

for wi, w in enumerate(REGW):
    comp_by = {c["uid"]: c for c in planes[iso(w)]["compromisos"]}
    for a in acts:
        rows = week_rows(a["uid"], w)
        c = comp_by.get(a["uid"])
        if not rows and not c: continue
        dias = sum(1 for x in rows if x[2] > 0)
        met = round(sum(x[1] for x in rows), 2)
        prev = acum_before(a["uid"], w)
        pers = rows[0][4] if rows else 0
        losses = {}
        for x in rows:
            if x[3]: losses[x[3][0]] = losses.get(x[3][0], 0) + x[3][1]
        hh_eff = sum(x[2] for x in rows) / dias if dias else 0
        perdidas = [{"causa": k, "horas": v, "personas": pers} for k, v in losses.items()]
        cats = personal_cats(a["disciplina"], pers) if rows else {}
        tot = sum(cats.values())
        cumplida = ""
        if c: cumplida = "Sí" if met >= c["metradoComp"] * 0.999 else "No"
        causa = ""
        if cumplida == "No":
            causa = max(losses, key=losses.get) if losses else ("PRE-PEN" if not rows else NC_DEFAULT.get(a["uid"], "PLA-REN"))
        acum = prev + met
        ini_real = iso(daily[a["uid"]][0][0]) if a["uid"] in daily and daily[a["uid"]] and daily[a["uid"]][0][0] <= w + dt.timedelta(days=6) else ""
        fin_real = iso(real_end[a["uid"]]) if a["uid"] in real_end and w <= real_end[a["uid"]] <= w + dt.timedelta(days=6) else ""
        hh_extra = 0
        if a["tipo"] in ("MO",) and rows: hh_extra = 2 * tot  # sábados con horas extra en izajes
        avance = 100 if fin_real else round(min(100, 100 * acum / a["metrado"]), 1)
        equipos = []
        if a["tipo"] == "MO" and rows:
            esp = sum(v for k, v in losses.items() if k.startswith("EQP") or k.startswith("CLI"))
            equipos = [{"equipo": "Grúa sobre orugas" if a["sector"] == "ESP0310" else "Grúa telescópica", "capacidad": "250 t" if a["sector"] == "ESP0310" else "90 t", "horasOp": dias * 9, "horasEspera": esp}]
        if a["tipo"] in ("VC",) and rows:
            equipos = [{"equipo": "Bomba de concreto", "capacidad": "42 m", "horasOp": dias * 6, "horasEspera": losses.get("EQP-FAL", 0)}]
        rid = f"{a['uid']}_{iso(w)}"
        hhPlanSem = a["personal"] * len([d for d in workdays(D(a["inicio"]), D(a["fin"])) if w <= d <= w + dt.timedelta(days=6)]) * H
        regs[rid] = {"id": rid, "uid": a["uid"], "idTarea": a["idTarea"], "semana": iso(w), "comprometida": "Sí" if c else "No", "cumplida": cumplida, "causaNC": causa,
            "metradoComp": c["metradoComp"] if c else None, "inicioReal": ini_real, "finReal": fin_real, "turno": "Día", "dias": dias, "horasDia": round(hh_eff, 1),
            "personal": cats, "personalTotal": tot, "hhTrab": round(tot * dias * round(hh_eff, 1), 1), "hhExtra": hh_extra or None, "hhImprod": None, "hhPlanSemana": hhPlanSem,
            "metradoEjec": met, "unidad": a["unidad"], "metradoAcum": round(acum, 2), "avance": avance, "perdidas": perdidas, "equipos": equipos,
            "protocolos": (1 if fin_real else None), "noConformidades": (1 if a["uid"] == "e2m04" and fin_real else None), "retrabajoHH": (16 if a["uid"] == "e2m04" and fin_real else None), "incidentes": None,
            "registradoPor": "Supervisor de campo", "fuente": "Excel de campo", "fechaRegistro": iso(w + dt.timedelta(days=7)) + "T15:00:00.000Z",
            "obs": "Lluvias intensas, se drenó la excavación." if a["uid"] == "e2m13" and losses else ""}

# Programa vigente al corte (tareas): reales donde ya hay datos; pronóstico para lo pendiente.
fin_fc = {}
for n in sorted(byn):
    a = byn[n]; uid = a["uid"]
    plan_days = len(workdays(D(a["inicio"]), D(a["fin"])))
    if uid in daily and daily[uid]:
        ini = daily[uid][0][0]
        if uid in real_end: fin = real_end[uid]
        else:
            done = sum(x[1] for x in daily[uid]); worked = sum(1 for x in daily[uid] if x[1] > 0)
            rate = done / worked if worked else a["metrado"] / plan_days
            rem = max(1, round((a["metrado"] - done) / rate))
            fin = add_workdays(CUT + dt.timedelta(days=1), rem)
    else:
        ini = D(a["inicio"])
        if a["pred"]:
            p = fin_fc[a["pred"]]
            if p >= ini: ini = p + dt.timedelta(days=1)
        ini = max(ini, CUT + dt.timedelta(days=1))
        while not work(ini): ini += dt.timedelta(days=1)
        fin = add_workdays(ini, plan_days)
    a["inicio"], a["fin"] = iso(ini), iso(fin)
    fin_fc[uid] = fin
    a["modificado"] = "2026-10-26T15:00:00.000Z"
    docs[f"{BASE}/tareas/{uid}"] = a

# Plan de la semana 8 congelado a partir del programa vigente (sin registros: para probar el Excel de campo).
w8 = WEEKS[7]; comps = []
for a in ([] if CONC else acts):
    days = [d for d in workdays(D(a["inicio"]), D(a["fin"])) if d >= w8]
    in_w = [d for d in days if d <= w8 + dt.timedelta(days=6)]
    if not in_w: continue
    pend = a["metrado"] - acum_before(a["uid"], w8 + dt.timedelta(days=7))
    dec = 0 if a["unidad"] in ("pza", "perno", "und") else 1
    comp = round(pend * len(in_w) / len(days), dec)
    if comp > 0: comps.append({"uid": a["uid"], "idTarea": a["idTarea"], "comprometida": True, "metradoComp": comp, "unidad": a["unidad"], "hhComp": a["personal"] * len(in_w) * H})
if not CONC: planes[iso(w8)] = {"semana": iso(w8), "fecha": "2026-10-24T21:00:00.000Z", "congeladoPor": "Vicente", "compromisos": comps}

docs[BASE] = {"nombre": NOMBRE, "inicio": iso(REGW[-3]) if CONC else "2026-10-19", "jornada": "6", "horasDia": H, "sectores": {"ESP0240": "Stock Pile", "ESP0310": "Edificio de Molienda"},
              "creado": "2026-09-02T14:00:00.000Z", "modificado": "2026-10-26T15:00:00.000Z",
              "descripcion": "Proyecto de 2 meses concluido: línea base, planes semanales, registros y cortes de todas las semanas." if CONC else "Ejemplo de 2 meses con ejecución simulada hasta el corte del 25-oct (semana 7). La semana 8 tiene plan congelado y sin registros."}
for k, p in planes.items(): docs[f"{BASE}/planesSemanales/{k}"] = p
for k, r in regs.items(): docs[f"{BASE}/registros/{k}"] = r

# Cortes semanales (semanas 1 a 7).
for wi, w in enumerate(REGW):
    end = w + dt.timedelta(days=6)
    prog = []
    for a in acts:
        uid = a["uid"]; rows = [x for x in daily.get(uid, []) if x[0] <= end]
        bl = next(t for t in docs[f"{BASE}/lineasBase/v1"]["tareas"] if t["uid"] == uid)
        ini = iso(rows[0][0]) if rows else bl["inicio"]
        fin = iso(real_end[uid]) if uid in real_end and real_end[uid] <= end else (a["fin"] if rows else bl["fin"])
        prog.append({"uid": uid, "idTarea": a["idTarea"], "inicio": ini, "fin": fin})
    n = sum(1 for r in regs.values() if r["semana"] == iso(w))
    docs[f"{BASE}/cortes/{iso(w)}"] = {"semana": iso(w), "fecha": iso(end + dt.timedelta(days=1)) + "T15:00:00.000Z", "cargadoPor": "Oficina Técnica", "archivo": f"Campo {NOMBRE} {iso(w)}.xlsx",
        "resumen": {"filas": n, "registros": n, "nuevas": 0, "reprogramadas": 0, "errores": 0}, "programa": prog, "log": []}

RESTR = [
    ("rs2m1", "e2m07", "MAT", "Falta de planchas de conexión (despacho de proveedor)", "Logística", "2026-10-01", "2026-10-03", "Liberada"),
    ("rs2m2", "e2m19", "EQP", "Grúa de 90 t compartida con Molienda", "R. Salazar", "2026-10-20", "2026-10-21", "Liberada"),
    ("rs2m3", "e2m11", "MAT", "Llegada de pernos A325 lote 2", "Logística", "2026-11-02", "", "Abierta"),
    ("rs2m4", "e2m12", "CAL", "Aprobación de pintura de retoque RAL 7035", "Calidad", "2026-11-05", "", "Abierta"),
    ("rs2m5", "e2m20", "PER", "Permiso de trabajo en altura para la faja", "Seguridad", "2026-11-03", "", "Abierta"),
]
if CONC:  # en el proyecto concluido todas se liberaron
    RESTR = [r[:6] + (r[5] if r[6] else iso(D(r[5]) - dt.timedelta(days=1)), "Liberada") for r in RESTR]
for rid, uid, tipo, desc, resp, comp, lib, est in RESTR:
    a = next(x for x in acts if x["uid"] == uid)
    docs[f"{BASE}/restricciones/{rid}"] = {"id": rid, "uid": uid, "idTarea": a["idTarea"], "tipo": tipo, "desc": desc, "responsable": resp, "fechaCompromiso": comp,
                                          "fechaLiberacion": lib, "estado": est, "creado": "2026-09-28T15:00:00.000Z"}

out = json.dumps(docs, ensure_ascii=False, indent=1)
if SHIFT:  # desplaza todas las fechas AAAA-MM-DD del documento
    out = re.sub(r"\d{4}-\d{2}-\d{2}", lambda m: iso(D(m.group(0)) + dt.timedelta(days=SHIFT)), out)
sys.stdout.write(out)
