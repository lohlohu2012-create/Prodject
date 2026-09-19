const state = { sourceSvg:null, resultSvgs:[], resultMeta:null, running:false, startedAt:0, durationMs:0, stopTimer:null };

const $ = id => document.getElementById(id);
const status = value => $("status").textContent = value;

function readNumber(id, fallback) {
  const n = Number($(id).value);
  return Number.isFinite(n) ? n : fallback;
}

function qualityConfig() {
  const quality = $("quality").value;
  if (quality === "fast") return { seconds:10, populationSize:12, mutationRate:12 };
  if (quality === "max") return { seconds:90, populationSize:40, mutationRate:18 };
  return { seconds:30, populationSize:24, mutationRate:15 };
}

function getSheet() {
  const w = readNumber("sheetW",1500), h = readNumber("sheetH",3000);
  if (w <= 0 || h <= 0) throw new Error("Размер листа должен быть больше нуля.");
  return { w, h, auto: $("orientation").value === "auto" };
}

function sourceElements(svgText) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") throw new Error("Файл не является корректным SVG.");

  const result = Array.from(root.children).filter(node => !["defs","style","title","desc","metadata"].includes(node.tagName.toLowerCase()));
  if (!result.length) throw new Error("В файле не найдена векторная геометрия.");
  return result.map(node => node.cloneNode(true));
}

function buildNestingSvg(w, h, quantity) {
  const elements = sourceElements(state.sourceSvg);
  const ns = "http://www.w3.org/2000/svg";
  const root = document.createElementNS(ns,"svg");
  root.setAttribute("xmlns",ns);
  root.setAttribute("viewBox",`0 0 ${w} ${h}`);
  root.setAttribute("width",String(w));
  root.setAttribute("height",String(h));

  const bin = document.createElementNS(ns,"rect");
  bin.setAttribute("id","sheet-bin");
  bin.setAttribute("x","0"); bin.setAttribute("y","0");
  bin.setAttribute("width",String(w)); bin.setAttribute("height",String(h));
  root.appendChild(bin);

  const repeat = Math.max(1,Math.floor(quantity));
  for (let copy=0; copy<repeat; copy++) {
    for (const element of elements) {
      const clone = element.cloneNode(true);
      clone.removeAttribute("id");
      root.appendChild(clone);
    }
  }
  return new XMLSerializer().serializeToString(root);
}

function resetEngine() {
  try { SvgNest.stop(); } catch (_) {}
  const q = qualityConfig();
  SvgNest.config({
    spacing: readNumber("gap",2),
    rotations: Math.max(1,Math.floor(readNumber("rotations",2))),
    populationSize: q.populationSize,
    mutationRate: q.mutationRate,
    curveTolerance: 0.2,
    useHoles: true,
    exploreConcave: true
  });
}

function renderResults(svgList, efficiency, placed, total, sheet) {
  const wrap = $("canvasWrap");
  wrap.innerHTML = "";

  state.resultMeta = {
    material: $("material").value,
    thickness: readNumber("thickness",3),
    sheetW: sheet.w,
    sheetH: sheet.h,
    efficiency: Number(efficiency || 0),
    placed: Number(placed || 0),
    total: Number(total || 0)
  };

  svgList.forEach((svg,index) => {
    const card = document.createElement("div");
    card.className = "result-card";
    const title = document.createElement("div");
    title.className = "result-title";
    title.innerHTML = `<strong>Лист ${index+1}</strong><span>${sheet.w} × ${sheet.h} мм · ${escapeHtml(state.resultMeta.material)} · ${state.resultMeta.thickness} мм</span>`;
    const clone = svg.cloneNode(true);
    clone.classList.add("sheet-svg");
    clone.removeAttribute("width"); clone.removeAttribute("height");
    card.appendChild(title); card.appendChild(clone); wrap.appendChild(card);
  });

  $("statSheets").textContent = svgList.length;
  $("statParts").textContent = placed || 0;
  $("statEfficiency").textContent = `${Math.round((efficiency || 0)*100)}%`;
  $("downloadButton").disabled = svgList.length === 0;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g,c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function updateProgress() {
  if (!state.running) return;
  const elapsed = Date.now() - state.startedAt;
  const p = Math.min(1, elapsed / state.durationMs);
  $("progressBar").style.width = `${Math.round(p*100)}%`;
  $("runInfo").textContent = `Ищем более компактную раскладку… ${Math.max(0,Math.ceil((state.durationMs-elapsed)/1000))} с`;
}

function startOneRun(sheet, runDurationMs) {
  resetEngine();
  const quantity = Math.max(1,Math.floor(readNumber("quantity",1)));
  const parsed = SvgNest.parsesvg(buildNestingSvg(sheet.w,sheet.h,quantity));
  const bin = parsed.querySelector("#sheet-bin");
  if (!bin) throw new Error("Не удалось создать металлический лист.");
  SvgNest.setbin(bin);

  SvgNest.start(
    progress => {
      if (state.running) $("progressBar").style.width = `${Math.max(2,Math.round((progress || 0)*100))}%`;
    },
    (svglist,efficiency,placed,total) => {
      if (!svglist || !svglist.length) return;
      state.resultSvgs = svglist;
      renderResults(svglist,efficiency,placed,total,sheet);
      $("runInfo").textContent = `Найден улучшенный вариант: ${svglist.length} лист(ов), ${placed || 0}/${total || 0} деталей`;
    }
  );

  return new Promise(resolve => {
    const timer = setInterval(() => {
      if (!state.running) { clearInterval(timer); resolve(); return; }
      updateProgress();
      if (Date.now() - state.startedAt >= runDurationMs) {
        clearInterval(timer);
        try { SvgNest.stop(); } catch (_) {}
        resolve();
      }
    },200);
  });
}

async function runSearch() {
  if (!state.sourceSvg) throw new Error("Сначала загрузите чертёж.");
  const sheet = getSheet();
  const q = qualityConfig();
  const orientations = sheet.auto ? [{w:sheet.w,h:sheet.h},{w:sheet.h,h:sheet.w}] : [{w:sheet.w,h:sheet.h}];

  $("nestButton").disabled = true; $("stopButton").disabled = false; $("downloadButton").disabled = true;
  status("Расчёт...");
  state.running = true; state.resultSvgs = []; state.resultMeta = null;
  state.durationMs = q.seconds * 1000 / orientations.length;
  state.startedAt = Date.now();
  $("progressBar").style.width = "0%";

  let best = null;
  for (const candidate of orientations) {
    if (!state.running) break;
    state.resultSvgs = [];
    state.startedAt = Date.now();
    await startOneRun(candidate,state.durationMs);
    const meta = state.resultMeta;
    if (meta && state.resultSvgs.length) {
      const score = state.resultSvgs.length * 1000000 - meta.efficiency;
      if (!best || score < best.score) best = { score, results:state.resultSvgs, meta };
    }
  }

  try { SvgNest.stop(); } catch (_) {}
  state.running = false; $("nestButton").disabled = false; $("stopButton").disabled = true;

  if (best) {
    state.resultSvgs = best.results; state.resultMeta = best.meta;
    renderResults(best.results,best.meta.efficiency,best.meta.placed,best.meta.total,{w:best.meta.sheetW,h:best.meta.sheetH});
    $("runInfo").textContent = `Итог: ${best.results.length} лист(ов), ${best.meta.placed}/${best.meta.total} деталей. Показан лучший найденный вариант.`;
    $("progressBar").style.width = "100%"; status("Раскрой рассчитан");
  } else {
    $("runInfo").textContent = "Допустимую раскладку не удалось найти.";
    status("Нет результата");
  }
}

$("fileInput").addEventListener("change",async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  $("fileName").textContent = file.name; status("Загрузка...");
  try {
    const ext = file.name.split(".").pop().toLowerCase();
    let svgText;
    if (ext === "svg") svgText = await file.text();
    else {
      const form = new FormData(); form.append("file",file);
      const response = await fetch(ext === "dwg" ? "/api/import/dwg" : "/api/import/dxf",{method:"POST",body:form});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ошибка импорта.");
      svgText = data.svg;
    }
    sourceElements(svgText);
    state.sourceSvg = svgText;
    $("geometryInfo").textContent = "Чертёж готов к раскрою.";
    status("Чертёж загружен");
  } catch (err) {
    state.sourceSvg = null; $("geometryInfo").textContent = "Ошибка импорта."; status("Ошибка"); alert(err.message);
  }
});

$("nestButton").addEventListener("click",() => runSearch().catch(err => { state.running=false; try{SvgNest.stop();}catch(_){}; $("nestButton").disabled=false; $("stopButton").disabled=true; status("Ошибка"); alert(err.message); }));
$("stopButton").addEventListener("click",() => { state.running=false; try{SvgNest.stop();}catch(_){}; $("nestButton").disabled=false; $("stopButton").disabled=true; $("runInfo").textContent="Поиск остановлен. Показан лучший найденный вариант."; status("Остановлено"); $("progressBar").style.width="100%"; });

$("downloadButton").addEventListener("click",() => {
  if (!state.resultSvgs.length) return;
  const svg = state.resultSvgs.map(item => new XMLSerializer().serializeToString(item)).join("\n");
  const out = `<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
  const blob = new Blob([out],{type:"image/svg+xml;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download="sheetnest-metal-layout.svg"; a.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
});