// Empaqueta la app en un solo HTML (CSS y JS en línea).
//   dist/index.html           → página que se publica como Artifact (sin <!doctype>, la plataforma la envuelve)
//   dist/lookahead.html       → copia independiente para abrir sin conexión (guarda en el navegador)
// Uso: npm run build

import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const src = await readFile(new URL("index.html", root), "utf8");
const css = await readFile(new URL("css/app.css", root), "utf8");
const part = (name) => {
  const m = src.match(new RegExp(`<!-- build:${name}[^>]*-->([\\s\\S]*?)<!-- /build:${name} -->`));
  if (!m) throw new Error(`Falta el bloque build:${name} en index.html`);
  return m[1].trim();
};
const libs = [...src.matchAll(/<script src="(https:[^"]+)"><\/script>/g)].map((m) => `<script src="${m[1]}"></script>`).join("\n");

const out = await build({ entryPoints: [new URL("js/main.js", root).pathname], bundle: true, format: "iife", write: false, target: "es2020", legalComments: "none" });
let js = out.outputFiles[0].text;
if (js.includes("</script")) js = js.replace(/<\/script/g, "<\\/script");

const page = `${part("head")}\n<style>\n${css}</style>\n\n${part("body")}\n\n${libs}\n<script>\n${js}</script>\n`;
await mkdir(new URL("dist/", root), { recursive: true });
await writeFile(new URL("dist/index.html", root), page);
await writeFile(new URL("dist/lookahead.html", root), `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${page}</html>\n`);
console.log(`dist/index.html ${(page.length / 1024).toFixed(0)} KB`);
