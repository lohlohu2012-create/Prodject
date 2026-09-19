const PRESETS = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189]
};

const state = {
  sourceSvg: null,
  parts: [],
  result: [],
  sheet: { w: 841, h: 1189 },
  unit: "mm"
};

const $ = (id) => document.getElementById(id);
const status = (message) => { $("status").textContent = message; };

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

function parseSvg(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") throw new Error("Файл не является SVG");
  return root;
}

function collectParts(root) {
  const elements = [...root.querySelectorAll("path, polygon, polyline, rect, circle, ellipse, line")];
  if (!elements.length) throw new Error("В файле не найдена векторная геометрия");

  const measureSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  measureSvg.setAttribute("width", "1");
  measureSvg.setAttribute("height", "1");
  measureSvg.style.position = "absolute";
  measureSvg.style.left = "-100000px";
  measureSvg.style.top = "-100000px";
  document.body.appendChild(measureSvg);

  const parts = [];
  elements.forEach((el, index) => {
    const clone = el.cloneNode(true);
    clone.removeAttribute("id");
    clone.setAttribute("vector-effect", "non-scaling-stroke");
    measureSvg.appendChild(clone);

    let box;
    try { box = clone.getBBox(); } catch (_) { box = null; }
    if (box && box.width > 0.001 && box.height > 0.001) {
      parts.push({
        id: index + 1,
        markup: new XMLSerializer().serializeToString(clone),
        x: box.x, y: box.y, w: box.width, h: box.height,
        area: Math.max(box.width * box.height, 0.001)
      });
    }
    measureSvg.removeChild(clone);
  });

  document.body.removeChild(measureSvg);
  return parts;
}

function normalizePartMarkup(part) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.innerHTML = part.markup;
  const node = g.firstElementChild;
  if (!node) return part.markup;
  node.setAttribute("transform", `translate(${-part.x} ${-part.y})`);
  return new XMLSerializer().serializeToString(node);
}

function readSheetSettings() {
  const preset = $("preset").value;
  let [w, h] = preset === "custom" ? [Number($("sheetW").value), Number($("sheetH").value)] : PRESETS[preset];
  if ($("orientation").value === "landscape" && h > w) [w, h] = [h, w];
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error("Некорректный размер листа");
  state.sheet = { w, h };
}

function readNumber(id, fallback = 0) {
  const n = Number($(id).value);
  return Number.isFinite(n) ? n : fallback;
}

function clonePartsForQuantity() {
  const qty = Math.max(1, Math.floor(readNumber("quantity", 1)));
  const out = [];
  for (let i = 0; i < qty; i++) {
    for (const p of state.parts) {
      out.push({ ...p, copy: i + 1, instanceId: `${p.id}-${i + 1}` });
    }
  }
  return out;
}

function placeParts(parts) {
  const margin = readNumber("margin", 10);
  const gap = readNumber("gap", 3);
  const rot90 = $("rotation").value === "90";
  const innerW = state.sheet.w - 2 * margin;
  const innerH = state.sheet.h - 2 * margin;

  if (innerW <= 0 || innerH <= 0) throw new Error("Поле листа больше размера листа");

  const sheets = [];
  let current = [];
  let x = 0;
  let y = 0;
  let rowH = 0;

  const tryPlace = (part, rotation) => {
    let w = part.w, h = part.h;
    if (rotation === 90) [w, h] = [h, w];
    if (w > innerW || h > innerH) return false;

    if (x + w > innerW + 1e-9) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    if (y + h > innerH + 1e-9) return false;

    current.push({ ...part, x: margin + x, y: margin + y, w, h, rotation });
    x += w + gap;
    rowH = Math.max(rowH, h);
    return true;
  };

  for (const part of parts.sort((a, b) => Math.max(b.w, b.h) * Math.max(b.w, b.h) - Math.max(a.w, a.h) * Math.max(a.w, a.h))) {
    const rotations = rot90 ? [0, 90] : [0];
    let placed = false;
    for (const r of rotations) {
      const snapshot = { x, y, rowH, currentLength: current.length };
      if (tryPlace(part, r)) { placed = true; break; }
      x = snapshot.x; y = snapshot.y; rowH = snapshot.rowH; current.length = snapshot.currentLength;
    }
    if (!placed) {
      if (current.length) {
        sheets.push(current);
        current = [];
        x = 0; y = 0; rowH = 0;
      }
      let ok = false;
      for (const r of rotations) if (tryPlace(part, r)) { ok = true; break; }
      if (!ok) throw new Error(`Деталь ${part.id} не помещается на выбранный лист`);
    }
  }

  if (current.length) sheets.push(current);
  return sheets;
}

function renderResult() {
  const wrap = $("canvasWrap");
  wrap.innerHTML = "";

  const scale = Math.min(0.9, 900 / Math.max(state.sheet.w, state.sheet.h));
  let totalArea = 0;

  state.result.forEach((sheetParts, sheetIndex) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("sheet");
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("viewBox", `0 0 ${state.sheet.w} ${state.sheet.h}`);
    svg.setAttribute("width", state.sheet.w * scale);
    svg.setAttribute("height", state.sheet.h * scale);

    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", state.sheet.w);
    bg.setAttribute("height", state.sheet.h);
    bg.setAttribute("fill", "#ffffff");
    bg.setAttribute("stroke", "#111827");
    bg.setAttribute("stroke-width", "0.6");
    svg.appendChild(bg);

    const border = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    border.setAttribute("x", readNumber("margin", 10));
    border.setAttribute("y", readNumber("margin", 10));
    border.setAttribute("width", state.sheet.w - 2 * readNumber("margin", 10));
    border.setAttribute("height", state.sheet.h - 2 * readNumber("margin", 10));
    border.setAttribute("fill", "none");
    border.setAttribute("stroke", "#c5cad1");
    border.setAttribute("stroke-dasharray", "3 3");
    border.setAttribute("stroke-width", "0.5");
    svg.appendChild(border);

    sheetParts.forEach((part, i) => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const transform = part.rotation === 90
        ? `translate(${part.x + part.w} ${part.y}) rotate(90)`
        : `translate(${part.x} ${part.y})`;
      g.setAttribute("transform", transform);

      const inner = document.createElementNS("http://www.w3.org/2000/svg", "g");
      inner.innerHTML = normalizePartMarkup(part);
      const node = inner.firstElementChild;
      if (node) g.appendChild(node);
      svg.appendChild(g);
      totalArea += part.w * part.h;
    });

    const caption = document.createElement("div");
    caption.className = "muted";
    caption.style.margin = "0 0 6px";
    caption.textContent = `Лист ${sheetIndex + 1} · ${state.sheet.w} × ${state.sheet.h} мм · деталей: ${sheetParts.length}`;
    wrap.appendChild(caption);
    wrap.appendChild(svg);
  });

  const used = state.result.reduce((sum, s) => sum + s.reduce((a, p) => a + p.area, 0), 0);
  const sheetArea = state.result.length * state.sheet.w * state.sheet.h;
  $("statSheets").textContent = state.result.length;
  $("statParts").textContent = state.result.reduce((n, s) => n + s.length, 0);
  $("statEfficiency").textContent = sheetArea ? `${Math.round((used / sheetArea) * 100)}%` : "0%";
  $("downloadButton").disabled = state.result.length === 0;
}

function buildDownloadSvg() {
  const groups = [];
  const gap = 40;
  let yOffset = 0;
  for (const sheetParts of state.result) {
    const parts = sheetParts.map(part => {
      const transform = part.rotation === 90
        ? `translate(${part.x + part.w} ${part.y}) rotate(90)`
        : `translate(${part.x} ${part.y})`;
      return `<g transform="${transform}">${normalizePartMarkup(part)}</g>`;
    }).join("");

    groups.push(`<g transform="translate(0 ${yOffset})"><rect x="0" y="0" width="${state.sheet.w}" height="${state.sheet.h}" fill="white" stroke="black" stroke-width="0.5"/>${parts}</g>`);
    yOffset += state.sheet.h + gap;
  }
  const height = Math.max(1, yOffset - gap);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${state.sheet.w}" height="${height}" viewBox="0 0 ${state.sheet.w} ${height}">${groups.join("")}</svg>`;
}

$("preset").addEventListener("change", () => {
  const preset = $("preset").value;
  if (preset !== "custom") {
    const [w, h] = PRESETS[preset];
    $("sheetW").value = w;
    $("sheetH").value = h;
  }
  if (state.parts.length) {
    try { readSheetSettings(); state.result = placeParts(clonePartsForQuantity()); renderResult(); } catch (_) {}
  }
});

$("orientation").addEventListener("change", () => {
  try { readSheetSettings(); if (state.parts.length) { state.result = placeParts(clonePartsForQuantity()); renderResult(); } } catch (_) {}
});

$("fileInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  $("fileName").textContent = file.name;
  status("Загрузка...");

  try {
    const ext = file.name.split(".").pop().toLowerCase();
    let svgText;

    if (ext === "svg") {
      svgText = await file.text();
    } else {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(ext === "dwg" ? "/api/import/dwg" : "/api/import/dxf", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ошибка импорта");
      svgText = data.svg;
    }

    const root = parseSvg(svgText);
    state.sourceSvg = svgText;
    state.parts = collectParts(root);
    $("geometryInfo").textContent = `Загружено геометрических элементов: ${state.parts.length}`;
    status("Чертёж загружен");
  } catch (err) {
    status("Ошибка");
    alert(err.message);
  }
});

$("nestButton").addEventListener("click", () => {
  try {
    if (!state.parts.length) throw new Error("Сначала загрузите чертёж");
    readSheetSettings();
    const items = clonePartsForQuantity();
    state.result = placeParts(items);
    renderResult();
    status("Раскладка готова");
  } catch (err) {
    status("Ошибка");
    alert(err.message);
  }
});

$("downloadButton").addEventListener("click", () => {
  const svg = buildDownloadSvg();
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sheetnest-layout.svg";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
