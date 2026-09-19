const state={sourceSvg:null,resultSvgs:[],resultMeta:null,running:false,startedAt:0,durationMs:0};

const $=id=>document.getElementById(id);
const status=value=>{$("status").textContent=value};

function readNumber(id,fallback){const n=Number($(id).value);return Number.isFinite(n)?n:fallback}
function qualityConfig(){const q=$("quality").value;if(q==="fast")return{seconds:10,populationSize:12,mutationRate:12};if(q==="max")return{seconds:90,populationSize:40,mutationRate:18};return{seconds:30,populationSize:24,mutationRate:15}}
function getSheet(){const w=readNumber("sheetW",1500),h=readNumber("sheetH",3000);if(w<=0||h<=0)throw new Error("Размер листа должен быть больше нуля.");return{w,h,auto:$("orientation").value==="auto"}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",""":"&quot;","'":"&#39;"}[c]))}

function updateSheetPreview(){
  const w=readNumber("sheetW",1500),h=readNumber("sheetH",3000);
  const ratio=Math.max(.25,Math.min(3,w/h));
  $("sheetShape").style.setProperty("--ratio",ratio);
  $("previewW").textContent=w+" мм";
  $("previewH").textContent=h+" мм";
  $("previewMaterial").textContent=$("material").value+" · "+readNumber("thickness",3)+" мм";
}
function sourceElements(svgText){
  const doc=new DOMParser().parseFromString(svgText,"image/svg+xml"),root=doc.documentElement;
  if(!root||root.nodeName.toLowerCase()!=="svg")throw new Error("Файл не является корректным SVG.");
  const result=Array.from(root.children).filter(node=>!["defs","style","title","desc","metadata"].includes(node.tagName.toLowerCase()));
  if(!result.length)throw new Error("В файле не найдена векторная геометрия.");
  return result.map(node=>node.cloneNode(true));
}

function buildNestingSvg(w,h,quantity){
  const margin=Math.max(0,readNumber("margin",10));
  const innerW=w-2*margin,innerH=h-2*margin;
  if(innerW<=0||innerH<=0)throw new Error("Поле от края больше размера металлического листа.");
  const elements=sourceElements(state.sourceSvg),ns="http://www.w3.org/2000/svg";
  const root=document.createElementNS(ns,"svg");
  root.setAttribute("xmlns",ns);root.setAttribute("viewBox",`0 0 ${innerW} ${innerH}`);root.setAttribute("width",String(innerW));root.setAttribute("height",String(innerH));
  const bin=document.createElementNS(ns,"rect");bin.setAttribute("id","sheet-bin");bin.setAttribute("x","0");bin.setAttribute("y","0");bin.setAttribute("width",String(innerW));bin.setAttribute("height",String(innerH));root.appendChild(bin);
  const repeat=Math.max(1,Math.floor(quantity));
  for(let copy=0;copy<repeat;copy++)for(const element of elements){const clone=element.cloneNode(true);clone.removeAttribute("id");root.appendChild(clone)}
  return new XMLSerializer().serializeToString(root);
}

function resetEngine(){
  try{SvgNest.stop()}catch(_){}
  const q=qualityConfig();
  SvgNest.config({spacing:readNumber("gap",2),rotations:Math.max(1,Math.floor(readNumber("rotations",2))),populationSize:q.populationSize,mutationRate:q.mutationRate,curveTolerance:.2,useHoles:true,exploreConcave:true});
}

function addSvgEl(svg,name,attrs){
  const el=document.createElementNS("http://www.w3.org/2000/svg",name);
  Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));
  svg.appendChild(el); return el;
}

function decorateResultSvg(svg,meta,sheetIndex){
  const ns="http://www.w3.org/2000/svg",margin=meta.margin;
  svg.setAttribute("viewBox",`0 0 ${meta.sheetW} ${meta.sheetH}`);
  svg.setAttribute("preserveAspectRatio","xMidYMid meet");

  const defs=document.createElementNS(ns,"defs");
  defs.innerHTML=`<linearGradient id="metalFill${sheetIndex}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dfe4e9"/><stop offset=".52" stop-color="#b8c1ca"/><stop offset="1" stop-color="#d5dbe1"/></linearGradient><pattern id="metalHatch${sheetIndex}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(20)"><line x1="0" y1="0" x2="0" y2="14" stroke="#fff" stroke-opacity=".13" stroke-width="2"/></pattern>`;
  svg.insertBefore(defs,svg.firstChild);

  const bin=svg.querySelector(".bin")||svg.querySelector("#sheet-bin");
  if(bin){
    bin.setAttribute("x",margin);bin.setAttribute("y",margin);
    bin.setAttribute("width",meta.sheetW-2*margin);bin.setAttribute("height",meta.sheetH-2*margin);
    bin.setAttribute("fill",`url(#metalFill${sheetIndex})`);bin.setAttribute("stroke","#687481");bin.setAttribute("stroke-width",".9");
    const hatch=document.createElementNS(ns,"rect");hatch.setAttribute("x",margin);hatch.setAttribute("y",margin);hatch.setAttribute("width",meta.sheetW-2*margin);hatch.setAttribute("height",meta.sheetH-2*margin);hatch.setAttribute("fill",`url(#metalHatch${sheetIndex})`);hatch.setAttribute("pointer-events","none");svg.insertBefore(hatch,bin.nextSibling);
  }

  const placedGroups=Array.from(svg.querySelectorAll("g")).filter(g=>g!==svg.firstChild&&g.getAttribute("transform")&&/translate\(/.test(g.getAttribute("transform")));
  let partNo=1;
  placedGroups.forEach(group=>{
    const raw=group.getAttribute("transform")||"";
    const match=raw.match(/translate\(([-+\d.eE]+)[ ,]+([-+\d.eE]+)/);
    if(!match)return;
    const rawX=Number(match[1]), rawY=Number(match[2]);
    const x=rawX+margin, y=rawY+margin;
    const shifted=raw.replace(/translate\\(([-+\\d.eE]+)[ ,]+([-+\\d.eE]+)/, `translate(${x} ${y}`);
    group.setAttribute("transform", shifted);
    const wrapper=document.createElementNS(ns,"g");
    const dot=document.createElementNS(ns,"circle");dot.setAttribute("cx",x);dot.setAttribute("cy",y);dot.setAttribute("r","4.2");dot.setAttribute("fill","#111820");dot.setAttribute("opacity",".88");
    const text=document.createElementNS(ns,"text");text.setAttribute("x",x);text.setAttribute("y",y+1.7);text.setAttribute("text-anchor","middle");text.setAttribute("font-size","4.8");text.setAttribute("font-family","Arial,sans-serif");text.setAttribute("font-weight","700");text.setAttribute("fill","#fff");text.textContent=partNo++;
    svg.appendChild(dot);svg.appendChild(text);
  });

  const safe=document.createElementNS(ns,"rect");safe.setAttribute("x",margin);safe.setAttribute("y",margin);safe.setAttribute("width",Math.max(0,meta.sheetW-2*margin));safe.setAttribute("height",Math.max(0,meta.sheetH-2*margin));safe.setAttribute("fill","none");safe.setAttribute("stroke","#3f4954");safe.setAttribute("stroke-width",".45");safe.setAttribute("stroke-dasharray","5 4");safe.setAttribute("opacity",".65");svg.appendChild(safe);

  const labelBg=document.createElementNS(ns,"rect");labelBg.setAttribute("x","8");labelBg.setAttribute("y","8");labelBg.setAttribute("width","190");labelBg.setAttribute("height","25");labelBg.setAttribute("rx","5");labelBg.setAttribute("fill","#ffffff");labelBg.setAttribute("fill-opacity",".8");labelBg.setAttribute("stroke","#b8c1ca");labelBg.setAttribute("stroke-width",".4");svg.appendChild(labelBg);
  const title=document.createElementNS(ns,"text");title.setAttribute("x","15");title.setAttribute("y","19");title.setAttribute("font-size","7");title.setAttribute("font-family","Arial,sans-serif");title.setAttribute("font-weight","700");title.setAttribute("fill","#26303a");title.textContent=`Лист ${sheetIndex+1} · ${meta.sheetW} × ${meta.sheetH} мм`;svg.appendChild(title);
  const sub=document.createElementNS(ns,"text");sub.setAttribute("x","15");sub.setAttribute("y","27");sub.setAttribute("font-size","5.5");sub.setAttribute("font-family","Arial,sans-serif");sub.setAttribute("fill","#65707c");sub.textContent=`${meta.material} · ${meta.thickness} мм · поле ${margin} мм · зазор ${meta.gap} мм`;svg.appendChild(sub);

  const dim=document.createElementNS(ns,"text");dim.setAttribute("x",meta.sheetW/2);dim.setAttribute("y",Math.max(7,meta.sheetH-7));dim.setAttribute("text-anchor","middle");dim.setAttribute("font-size","6");dim.setAttribute("font-family","Arial,sans-serif");dim.setAttribute("fill","#4d5863");dim.textContent=`${meta.sheetW} мм`;svg.appendChild(dim);
  const dimV=document.createElementNS(ns,"text");dimV.setAttribute("x","7");dimV.setAttribute("y",meta.sheetH/2);dimV.setAttribute("text-anchor","middle");dimV.setAttribute("font-size","6");dimV.setAttribute("font-family","Arial,sans-serif");dimV.setAttribute("fill","#4d5863");dimV.setAttribute("transform",`rotate(-90 7 ${meta.sheetH/2})`);dimV.textContent=`${meta.sheetH} мм`;svg.appendChild(dimV);
}

function renderResults(svgList,efficiency,placed,total,sheet){
  const wrap=$("canvasWrap");wrap.innerHTML="";
  const meta={material:$("material").value,thickness:readNumber("thickness",3),sheetW:sheet.w,sheetH:sheet.h,margin:readNumber("margin",10),gap:readNumber("gap",2),efficiency:Number(efficiency||0),placed:Number(placed||0),total:Number(total||0)};
  state.resultMeta=meta;

  svgList.forEach((svg,index)=>{
    const card=document.createElement("div");card.className="result-card";
    const title=document.createElement("div");title.className="result-title";
    title.innerHTML=`<strong>Лист ${index+1}</strong><span>${sheet.w} × ${sheet.h} мм · ${escapeHtml(meta.material)} · ${meta.thickness} мм</span>`;
    const clone=svg.cloneNode(true);clone.classList.add("sheet-svg");clone.removeAttribute("width");clone.removeAttribute("height");
    decorateResultSvg(clone,meta,index);
    card.appendChild(title);card.appendChild(clone);
    const summary=document.createElement("div");summary.className="sheet-summary";
    summary.innerHTML=`<span>Поле: <strong>${meta.margin} мм</strong> · зазор: <strong>${meta.gap} мм</strong></span><span>Деталей на листе: <strong>${Math.round((placed||0)/Math.max(1,svgList.length))}</strong></span>`;
    card.appendChild(summary);wrap.appendChild(card);
  });

  $("statSheets").textContent=svgList.length;$("statParts").textContent=placed||0;$("statEfficiency").textContent=`${Math.round((efficiency||0)*100)}%`;$("downloadButton").disabled=svgList.length===0;
}

function updateProgress(){
  if(!state.running)return;
  const elapsed=Date.now()-state.startedAt,p=Math.min(1,elapsed/state.durationMs);
  $("progressBar").style.width=`${Math.round(p*100)}%`;
  $("runInfo").textContent=`Ищем более компактную раскладку… ${Math.max(0,Math.ceil((state.durationMs-elapsed)/1000))} с`;
}

function startOneRun(sheet,runDurationMs){
  resetEngine();
  const quantity=Math.max(1,Math.floor(readNumber("quantity",1)));
  const parsed=SvgNest.parsesvg(buildNestingSvg(sheet.w,sheet.h,quantity));
  const bin=parsed.querySelector("#sheet-bin");if(!bin)throw new Error("Не удалось создать металлический лист.");
  SvgNest.setbin(bin);
  SvgNest.start(progress=>{if(state.running)$("progressBar").style.width=`${Math.max(2,Math.round((progress||0)*100))}%`},(svglist,efficiency,placed,total)=>{if(!svglist||!svglist.length)return;state.resultSvgs=svglist;renderResults(svglist,efficiency,placed,total,sheet);$("runInfo").textContent=`Найден улучшенный вариант: ${svglist.length} лист(ов), ${placed||0}/${total||0} деталей`});
  return new Promise(resolve=>{const timer=setInterval(()=>{if(!state.running){clearInterval(timer);resolve();return}updateProgress();if(Date.now()-state.startedAt>=runDurationMs){clearInterval(timer);try{SvgNest.stop()}catch(_){}resolve()}},200)});
}

async function runSearch(){
  if(!state.sourceSvg)throw new Error("Сначала загрузите чертёж.");
  const sheet=getSheet(),q=qualityConfig(),orientations=sheet.auto?[{w:sheet.w,h:sheet.h},{w:sheet.h,h:sheet.w}]:[{w:sheet.w,h:sheet.h}];
  $("nestButton").disabled=true;$("stopButton").disabled=false;$("downloadButton").disabled=true;status("Расчёт...");
  state.running=true;state.resultSvgs=[];state.resultMeta=null;state.durationMs=q.seconds*1000/orientations.length;$("progressBar").style.width="0%";
  let best=null;
  for(const candidate of orientations){
    if(!state.running)break;
    state.resultSvgs=[];state.startedAt=Date.now();await startOneRun(candidate,state.durationMs);
    const meta=state.resultMeta;
    if(meta&&state.resultSvgs.length){const score=state.resultSvgs.length*1000000-meta.efficiency;if(!best||score<best.score)best={score,results:state.resultSvgs,meta}}
  }
  try{SvgNest.stop()}catch(_){}
  state.running=false;$("nestButton").disabled=false;$("stopButton").disabled=true;
  if(best){state.resultSvgs=best.results;state.resultMeta=best.meta;renderResults(best.results,best.meta.efficiency,best.meta.placed,best.meta.total,{w:best.meta.sheetW,h:best.meta.sheetH});$("runInfo").textContent=`Итог: ${best.results.length} лист(ов), ${best.meta.placed}/${best.meta.total} деталей. Показан лучший найденный вариант.`;$("progressBar").style.width="100%";status("Раскрой рассчитан")}else{$("runInfo").textContent="Допустимую раскладку не удалось найти.";status("Нет результата")}
}

$("fileInput").addEventListener("change",async event=>{
  const file=event.target.files?.[0];if(!file)return;
  $("fileName").textContent=file.name;status("Загрузка...");
  try{
    const ext=file.name.split(".").pop().toLowerCase();let svgText;
    if(ext==="svg")svgText=await file.text();
    else if(ext==="dxf"){
      const form=new FormData();form.append("file",file);
      const response=await fetch("/api/import/dxf",{method:"POST",body:form});const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Ошибка импорта DXF.");svgText=data.svg;
    }else throw new Error("Поддерживаются только DXF и SVG.");
    const elements=sourceElements(svgText);state.sourceSvg=svgText;
    $("geometryInfo").innerHTML=`<span class="chip-dot"></span><span>Загружено элементов: ${elements.length}</span>`;status("Чертёж загружен");
  }catch(err){state.sourceSvg=null;$("geometryInfo").innerHTML='<span class="chip-dot"></span><span>Ошибка импорта</span>';status("Ошибка");alert(err.message)}
});

$("nestButton").addEventListener("click",()=>runSearch().catch(err=>{state.running=false;try{SvgNest.stop()}catch(_){}$("nestButton").disabled=false;$("stopButton").disabled=true;status("Ошибка");alert(err.message)}));
$("stopButton").addEventListener("click",()=>{state.running=false;try{SvgNest.stop()}catch(_){}$("nestButton").disabled=false;$("stopButton").disabled=true;$("runInfo").textContent="Поиск остановлен. Показан лучший найденный вариант.";status("Остановлено");$("progressBar").style.width="100%"});
$("downloadButton").addEventListener("click",()=>{if(!state.resultSvgs.length)return;const svg=state.resultSvgs.map(item=>new XMLSerializer().serializeToString(item)).join("\n");const out=`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;const blob=new Blob([out],{type:"image/svg+xml;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="sheetnest-metal-layout.svg";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});

["sheetW","sheetH","material","thickness"].forEach(id=>$(id).addEventListener("input",updateSheetPreview));
updateSheetPreview();