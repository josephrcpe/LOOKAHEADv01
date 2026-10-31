"""Genera data/ejemplos.js con los dos proyectos de ejemplo para incluirlos en la app.

La copia sin conexión (dist/lookahead.html) guarda en el navegador y arranca vacía; con este
módulo la app ofrece cargar los ejemplos sin depender de la nube. Uso: npm run ejemplos
"""
import json, subprocess, sys, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
docs = {}
for args in ([], ["--concluido"]):
    out = subprocess.run([sys.executable, str(root / "scripts/ejemplo_2m.py"), *args], check=True, capture_output=True, text=True).stdout
    docs.update(json.loads(out))
js = ("// Generado por scripts/ejemplos_js.py (no editar a mano).\n"
      "// Proyectos de ejemplo como {ruta: documento}, mismo formato que la base de datos.\n"
      "export default " + json.dumps(docs, ensure_ascii=False, separators=(",", ":")) + ";\n")
(root / "data/ejemplos.js").write_text(js, encoding="utf-8")
print(f"data/ejemplos.js: {len(docs)} documentos, {len(js) // 1024} KB")
