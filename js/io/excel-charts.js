// Gráficos nativos de Excel para el reporte (hoja "Gráficos").
// ExcelJS no escribe gráficos, así que después de generar el .xlsx se abre el ZIP con JSZip y se agregan
// las piezas de DrawingML: xl/charts/chartN.xml, xl/drawings/drawingN.xml, sus relaciones y los tipos de contenido.
// Cada gráfico apunta a rangos de celdas del libro (editable en Excel) y lleva una copia de los valores (caché)
// para que se vea aunque el programa no recalcule.
//
// Especificación de un gráfico:
//   { title, at: [col0, row0, col1, row1] (celdas, base 0), horizontal?, legend?, yFmt?, yMax?, labels?,
//     cats: { ref, vals: [texto] },
//     series: [{ name, ref, vals: [número|null], color, kind: "bar" | "line", dash? }] }

const NS_C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
const CT_CHART = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const CT_DRAW = "application/vnd.openxmlformats-officedocument.drawing+xml";
const INK = "52514E", GRID = "E3E6EA";

const x = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const txt = (sz, color = INK, b = 0) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="es-PE"/></a:p></c:txPr>`;

function strRef(ref, vals) {
  return `<c:strRef><c:f>${x(ref)}</c:f><c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${x(v)}</c:v></c:pt>`).join("")}</c:strCache></c:strRef>`;
}
function numRef(ref, vals, fmt) {
  const pts = vals.map((v, i) => (v == null || !isFinite(v) ? "" : `<c:pt idx="${i}"><c:v>${+v}</c:v></c:pt>`)).join("");
  return `<c:numRef><c:f>${x(ref)}</c:f><c:numCache><c:formatCode>${x(fmt)}</c:formatCode><c:ptCount val="${vals.length}"/>${pts}</c:numCache></c:numRef>`;
}
const dLbls = (fmt) => `<c:dLbls><c:numFmt formatCode="${x(fmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txt(800)}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`;

function serXml(s, i, spec) {
  const head = `<c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${x(s.name)}</c:v></c:tx>`;
  const data = `<c:cat>${strRef(spec.cats.ref, spec.cats.vals)}</c:cat><c:val>${numRef(s.ref, s.vals, spec.yFmt || "General")}</c:val>`;
  if (s.kind === "line") {
    const ln = `<a:ln w="22225" cap="rnd"><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill>${s.dash ? '<a:prstDash val="dash"/>' : ""}<a:round/></a:ln>`;
    const marker = s.dash ? '<c:marker><c:symbol val="none"/></c:marker>'
      : `<c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:marker>`;
    return `<c:ser>${head}<c:spPr>${ln}</c:spPr>${marker}${data}<c:smooth val="0"/></c:ser>`;
  }
  return `<c:ser>${head}<c:spPr><a:solidFill><a:srgbClr val="${s.color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>${spec.labels ? dLbls(spec.labelFmt || spec.yFmt || "General") : ""}${data}</c:ser>`;
}

function chartXml(spec) {
  const bars = spec.series.map((s, i) => [s, i]).filter(([s]) => s.kind !== "line");
  const lines = spec.series.map((s, i) => [s, i]).filter(([s]) => s.kind === "line");
  const hz = !!spec.horizontal;
  const axIds = '<c:axId val="500001"/><c:axId val="500002"/>';
  const barXml = bars.length ? `<c:barChart><c:barDir val="${hz ? "bar" : "col"}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${bars.map(([s, i]) => serXml(s, i, spec)).join("")}<c:gapWidth val="${bars.length > 1 ? 60 : 50}"/>${bars.length > 1 ? '<c:overlap val="-8"/>' : ""}${axIds}</c:barChart>` : "";
  const lineXml = lines.length ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${lines.map(([s, i]) => serXml(s, i, spec)).join("")}<c:marker val="1"/>${axIds}</c:lineChart>` : "";
  const axLine = `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="BFC5CC"/></a:solidFill></a:ln></c:spPr>`;
  const catAx = `<c:catAx><c:axId val="500001"/><c:scaling><c:orientation val="${hz ? "maxMin" : "minMax"}"/></c:scaling><c:delete val="0"/><c:axPos val="${hz ? "l" : "b"}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${axLine}${txt(800)}<c:crossAx val="500002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const valAx = `<c:valAx><c:axId val="500002"/><c:scaling><c:orientation val="minMax"/>${spec.yMax != null ? `<c:max val="${spec.yMax}"/>` : ""}<c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="${hz ? "b" : "l"}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="${GRID}"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${x(spec.yFmt || "General")}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txt(800)}<c:crossAx val="500001"/><c:crosses val="${hz ? "max" : "autoZero"}"/><c:crossBetween val="between"/></c:valAx>`;
  const legend = spec.legend ? `<c:legend><c:legendPos val="t"/><c:overlay val="0"/>${txt(900)}</c:legend>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="es-PE" sz="1200" b="1"><a:solidFill><a:srgbClr val="1F2328"/></a:solidFill></a:rPr><a:t>${x(spec.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${barXml}${lineXml}${catAx}${valAx}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>
<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="${GRID}"/></a:solidFill></a:ln></c:spPr></c:chartSpace>`;
}

function anchor(spec, i) {
  const [c0, r0, c1, r1] = spec.at;
  const cell = (c, r) => `<xdr:col>${c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;
  return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from>${cell(c0, r0)}</xdr:from><xdr:to>${cell(c1, r1)}</xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${x(spec.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
}

const rels = (items) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.join("")}</Relationships>`;
const nextFree = (zip, pre, ext) => { let n = 1; while (zip.file(`${pre}${n}${ext}`)) n++; return n; };

// Agrega los gráficos a la hoja `sheetName` del .xlsx `buf` y devuelve el nuevo contenido (ArrayBuffer).
export async function insertarGraficos(buf, sheetName, specs) {
  if (!specs.length || !window.JSZip) return buf;
  const zip = await JSZip.loadAsync(buf);
  // Archivo de la hoja: workbook.xml (nombre → r:id) y sus relaciones (r:id → ruta).
  const wbXml = await zip.file("xl/workbook.xml").async("string");
  const wbRels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const sheetTag = [...wbXml.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`name="${x(sheetName)}"`));
  const rid = sheetTag && /r:id="([^"]+)"/.exec(sheetTag)[1];
  const relTag = rid && [...wbRels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`Id="${rid}"`));
  if (!relTag) return buf;
  const target = /Target="([^"]+)"/.exec(relTag)[1].replace(/^\/?(xl\/)?/, "");
  const sheetPath = "xl/" + target, sheetFile = sheetPath.split("/").pop();
  const sheetRelsPath = `xl/worksheets/_rels/${sheetFile}.rels`;

  const dn = nextFree(zip, "xl/drawings/drawing", ".xml");
  let cn = nextFree(zip, "xl/charts/chart", ".xml");
  const chartRels = [], overrides = [`<Override PartName="/xl/drawings/drawing${dn}.xml" ContentType="${CT_DRAW}"/>`];
  specs.forEach((spec, i) => {
    zip.file(`xl/charts/chart${cn}.xml`, chartXml(spec));
    chartRels.push(`<Relationship Id="rId${i + 1}" Type="${REL}chart" Target="../charts/chart${cn}.xml"/>`);
    overrides.push(`<Override PartName="/xl/charts/chart${cn}.xml" ContentType="${CT_CHART}"/>`);
    cn++;
  });
  zip.file(`xl/drawings/drawing${dn}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${NS_A}" xmlns:r="${NS_R}">${specs.map(anchor).join("")}</xdr:wsDr>`);
  zip.file(`xl/drawings/_rels/drawing${dn}.xml.rels`, rels(chartRels));

  // Relación hoja → dibujo y etiqueta <drawing> en el orden que exige el esquema (antes de legacyDrawing/tableParts/extLst).
  const drawRid = "rIdGraficos1";
  const sr = zip.file(sheetRelsPath) ? await zip.file(sheetRelsPath).async("string") : rels([]);
  zip.file(sheetRelsPath, sr.replace("</Relationships>", `<Relationship Id="${drawRid}" Type="${REL}drawing" Target="../drawings/drawing${dn}.xml"/></Relationships>`));
  let sx = await zip.file(sheetPath).async("string");
  if (!/<worksheet\b[^>]*xmlns:r=/.test(sx)) sx = sx.replace("<worksheet ", `<worksheet xmlns:r="${NS_R}" `);
  const tag = `<drawing r:id="${drawRid}"/>`;
  const m = /<(legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(sx);
  sx = m ? sx.slice(0, m.index) + tag + sx.slice(m.index) : sx.replace("</worksheet>", tag + "</worksheet>");
  zip.file(sheetPath, sx);

  const ct = await zip.file("[Content_Types].xml").async("string");
  zip.file("[Content_Types].xml", ct.replace("</Types>", overrides.join("") + "</Types>"));
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}
