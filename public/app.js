const state={sourceSvg:null,resultSvgs:[],resultMeta:null,running:false,startedAt:0,durationMs:0};

const $=id=>document.getElementById(id);
const status=value=>{$("status").textContent=value};

function readNumber(id,fallback){const n=Number($(id).value);return Number.isFinite(n)?n:fallback}
function qualityConfig(){const q=$("quality").value;if(q==="fast")return{seconds:10,populationSize:12,mutationRate:12};if(q==="max")return{seconds:90,populationSize:40,mutationRate:18};return{seconds:30,populationSize:24,mutationRate:15}}
function getSheet(){const w=readNumber("sheetW",1500),h=readNumber("sheetH",3000);if(w<=0||h<=0)throw new Error("Размер листа должен быть больше нуля.");return{w,h,auto:$("orientation").value==="auto"}}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;"}[c]))}

function updateSheetPreview(){
  const w=readNumber("sheetW",1500),h=readNumber("sheetH",3000);
  const ratio=Math.max(.25,Math.min(3,w/h));
  $("sheetShape").style.setProperty("--ratio",ratio);
  $("previewW").textContent=w+" мм";
  $("previewH").textContent=h+" мм";
  $("previewMaterial").textContent=$("material").value+" · "+readNumber("thickness",3)+" мм";
}

function dxfNum(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback}
function dxfPoint(x,y){return{x:dxfNum(x),y:dxfNum(y)}}
function dxfSame(a,b){return Math.hypot(a.x-b.x,a.y-b.y)<=0.01}
function dxfPathFromPoints(points){
  if(!points||points.length<2)return "";
  let d=`M ${points[0].x} ${-points[0].y}`;
  for(let i=1;i<points.length;i++)d+=` L ${points[i].x} ${-points[i].y}`;
  return d+" Z";
}
function dxfRecords(text){
  const lines=String(text||"").replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n").split("\n");
  const records=[];
  for(let i=0;i+1<lines.length;i+=2){
    const code=Number(lines[i].trim());
    const value=lines[i+1];
    if(Number.isFinite(code))records.push({type:code,value:value.trim()});
  }
  return records;
}
function dxfEntities(text){
  const records=dxfRecords(text);
  const entities=[];
  let inEntities=false;
  for(let i=0;i<records.length;i++){
    const r=records[i];
    if(r.type===0&&r.value==="SECTION"){
      const next=records[i+1];
      inEntities=Boolean(next&&next.type===2&&next.value==="ENTITIES");
      continue;
    }
    if(r.type===0&&r.value==="ENDSEC"){inEntities=false;continue}
    if(!inEntities||r.type!==0)continue;
    const entity={type:r.value,pairs:[]};
    i++;
    while(i<records.length&&records[i].type!==0){entity.pairs.push(records[i]);i++}
    i--;
    entities.push(entity);
  }
  return entities;
}
function dxfPair(entity,code,fallback=null){
  const pair=entity.pairs.find(item=>item.type===code);
  return pair?pair.value:fallback;
}
function dxfPairs(entity,code){
  return entity.pairs.filter(item=>item.type===code).map(item=>item.value);
}
function dxfPolylinePoints(entity){
  const points=[];
  let x=null,y=null;
  for(const pair of entity.pairs){
    if(pair.type===10)x=dxfNum(pair.value);
    if(pair.type===20)y=dxfNum(pair.value);
    if(pair.type===10&&x!==null&&y!==null){points.push(dxfPoint(x,y));x=null;y=null}
  }
  return points;
}
function dxfParse(){
  const contours={closed:[],open:[],segments:[]};
  return contours;
}
function dxfTextToSvg(text){
  const entities=dxfEntities(text),closed=[],open=[],segments=[];
  for(let i=0;i<entities.length;i++){
    const e=entities[i],type=String(e.type||"").toUpperCase();
    if(type==="LWPOLYLINE"){
      const xs=dxfPairs(e,10).map(Number),ys=dxfPairs(e,20).map(Number),pts=[];
      for(let k=0;k<Math.min(xs.length,ys.length);k++)pts.push(dxfPoint(xs[k],ys[k]));
      if(pts.length>=2){
        const flags=dxfNum(dxfPair(e,70,0));
        (flags&1?closed:open).push(pts);
      }
      continue;
    }
    if(type==="POLYLINE"){
      const pts=[];let j=i+1;
      for(;j<entities.length;j++){
        const child=entities[j],ct=String(child.type||"").toUpperCase();
        if(ct==="VERTEX"){
          const x=dxfPair(child,10),y=dxfPair(child,20);
          if(x!==null&&y!==null)pts.push(dxfPoint(x,y));
          continue;
        }
        if(ct==="SEQEND")break;
        break;
      }
      i=j;
      if(pts.length>=2){
        const flags=dxfNum(dxfPair(e,70,0));
        (flags&1?closed:open).push(pts);
      }
      continue;
    }
    if(type==="LINE"){
      const x1=dxfPair(e,10),y1=dxfPair(e,20),x2=dxfPair(e,11),y2=dxfPair(e,21);
      if(x1!==null&&y1!==null&&x2!==null&&y2!==null)segments.push({a:dxfPoint(x1,y1),b:dxfPoint(x2,y2)});
      continue;
    }
    if(type==="CIRCLE"){
      const cx=dxfNum(dxfPair(e,10)),cy=dxfNum(dxfPair(e,20)),r=Math.abs(dxfNum(dxfPair(e,40)));
      const steps=Math.max(24,Math.ceil(2*Math.PI*Math.max(r,1)/2)),pts=[];
      for(let k=0;k<steps;k++){const t=2*Math.PI*k/steps;pts.push(dxfPoint(cx+r*Math.cos(t),cy+r*Math.sin(t)))}
      closed.push(pts);
      continue;
    }
    if(type==="ARC"){
      const cx=dxfNum(dxfPair(e,10)),cy=dxfNum(dxfPair(e,20)),r=Math.abs(dxfNum(dxfPair(e,40)));
      const a0=dxfNum(dxfPair(e,50)),a1=dxfNum(dxfPair(e,51));let delta=(a1-a0)%360;if(delta<0)delta+=360;
      const steps=Math.max(8,Math.ceil(delta/5)),pts=[];
      for(let k=0;k<=steps;k++){const a=(a0+delta*k/steps)*Math.PI/180;pts.push(dxfPoint(cx+r*Math.cos(a),cy+r*Math.sin(a)))}
      open.push(pts);
    }
  }

  while(segments.length){
    const seed=segments.pop();let chain=[seed.a,seed.b],extended=true;
    while(extended){
      extended=false;
      for(let i=segments.length-1;i>=0;i--){
        const s=segments[i];
        if(dxfSame(chain[chain.length-1],s.a)){chain.push(s.b);segments.splice(i,1);extended=true;break}
        if(dxfSame(chain[chain.length-1],s.b)){chain.push(s.a);segments.splice(i,1);extended=true;break}
        if(dxfSame(chain[0],s.b)){chain.unshift(s.a);segments.splice(i,1);extended=true;break}
        if(dxfSame(chain[0],s.a)){chain.unshift(s.b);segments.splice(i,1);extended=true;break}
      }
    }
    if(chain.length>=3&&dxfSame(chain[0],chain[chain.length-1])){chain.pop();closed.push(chain)}
    else if(chain.length>=2)open.push(chain);
  }

  if(!closed.length)throw new Error("В DXF не найден замкнутый контур детали.");

  const points=closed.flat(),bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
  for(const p of points){bounds.minX=Math.min(bounds.minX,p.x);bounds.maxX=Math.max(bounds.maxX,p.x);bounds.minY=Math.min(bounds.minY,p.y);bounds.maxY=Math.max(bounds.maxY,p.y)}
  const padding=1,minX=bounds.minX-padding,maxY=bounds.maxY+padding;
  const width=Math.max(1,bounds.maxX-bounds.minX+2*padding),height=Math.max(1,bounds.maxY-bounds.minY+2*padding);
  const paths=closed.map(c=>{
    const shifted=c.map(p=>({x:p.x-minX,y:p.y-maxY}));
    return "<path d=\"" + dxfPathFromPoints(shifted).replace(/"/g,"&quot;") + "\" />";
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-contours="${closed.length}" data-open="${open.length}"><g fill="none" stroke="black" stroke-width="0.2">${paths}</g></svg>`;
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
    const shifted=raw.replace(/translate\(([-+\d.eE]+)[ ,]+([-+\d.eE]+)/, `translate(${x} ${y}`);
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

const CANVAS_ZOOM_MIN=.25,CANVAS_ZOOM_MAX=4,CANVAS_ZOOM_STEP=.25;
function clampCanvasZoom(value){return Math.max(CANVAS_ZOOM_MIN,Math.min(CANVAS_ZOOM_MAX,value))}
function updateCanvasZoomUi(){
  const value=$( "zoomFit" );
  if(value)value.textContent=Math.round(state.canvasZoom*100)+"%";
}
function applyCanvasZoom(){
  const zoom=state.canvasZoom;
  document.querySelectorAll("#canvasWrap .result-card").forEach(card=>{
    card.style.width=(zoom*100)+"%";
    card.style.minWidth="0";
  });
  updateCanvasZoomUi();
}
function setCanvasZoom(nextZoom,clientX=null,clientY=null){
  const wrap=$( "canvasWrap" );
  if(!wrap)return;
  const oldZoom=state.canvasZoom;
  const zoom=clampCanvasZoom(nextZoom);
  if(Math.abs(zoom-oldZoom)<.001)return;
  const rect=wrap.getBoundingClientRect();
  const pointerX=clientX==null?rect.width/2:clientX-rect.left;
  const pointerY=clientY==null?rect.height/2:clientY-rect.top;
  const anchorX=wrap.scrollLeft+pointerX;
  const anchorY=wrap.scrollTop+pointerY;
  state.canvasZoom=zoom;
  applyCanvasZoom();
  requestAnimationFrame(()=>{
    wrap.scrollLeft=Math.max(0,anchorX*(zoom/oldZoom)-pointerX);
    wrap.scrollTop=Math.max(0,anchorY*(zoom/oldZoom)-pointerY);
  });
}
function resetCanvasZoom(){setCanvasZoom(1)}
function fitCanvasZoom(){setCanvasZoom(1)}
function setupCanvasZoom(){
  const wrap=$( "canvasWrap" );
  if(!wrap)return;
  $( "zoomOut" )?.addEventListener("click",()=>setCanvasZoom(state.canvasZoom-CANVAS_ZOOM_STEP));
  $( "zoomIn" )?.addEventListener("click",()=>setCanvasZoom(state.canvasZoom+CANVAS_ZOOM_STEP));
  $( "zoomFit" )?.addEventListener("click",fitCanvasZoom);
  $( "zoomReset" )?.addEventListener("click",resetCanvasZoom);
  wrap.addEventListener("wheel",event=>{
    if(!document.querySelector("#canvasWrap .result-card"))return;
    event.preventDefault();
    const direction=event.deltaY<0?1:-1;
    const factor=Math.pow(1.2,direction);
    setCanvasZoom(state.canvasZoom*factor,event.clientX,event.clientY);
  },{passive:false});
  updateCanvasZoomUi();
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

  $("statSheets").textContent=svgList.length;$("statParts").textContent=placed||0;$("statEfficiency").textContent=`${Math.round((efficiency||0)*100)}%`;$("downloadButton").disabled=svgList.length===0;applyCanvasZoom();
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
    else if(ext==="dxf")svgText=dxfTextToSvg(await file.text());
    else throw new Error("Поддерживаются только DXF и SVG.");
    const elements=sourceElements(svgText);state.sourceSvg=svgText;
    $("geometryInfo").innerHTML=`<span class="chip-dot"></span><span>Загружено элементов: ${elements.length}</span>`;status("Чертёж загружен");
  }catch(err){state.sourceSvg=null;$("geometryInfo").innerHTML='<span class="chip-dot"></span><span>Ошибка импорта</span>';status("Ошибка");alert(err.message)}
});

$("nestButton").addEventListener("click",()=>runSearch().catch(err=>{state.running=false;try{SvgNest.stop()}catch(_){}$("nestButton").disabled=false;$("stopButton").disabled=true;status("Ошибка");alert(err.message)}));
$("stopButton").addEventListener("click",()=>{state.running=false;try{SvgNest.stop()}catch(_){}$("nestButton").disabled=false;$("stopButton").disabled=true;$("runInfo").textContent="Поиск остановлен. Показан лучший найденный вариант.";status("Остановлено");$("progressBar").style.width="100%"});
$("downloadButton").addEventListener("click",()=>{if(!state.resultSvgs.length||!state.resultMeta)return;const prepared=state.resultSvgs.map((item,index)=>{const clone=item.cloneNode(true);decorateResultSvg(clone,state.resultMeta,index);return new XMLSerializer().serializeToString(clone)}).join("\n");const out=`<svg xmlns="http://www.w3.org/2000/svg">${prepared}</svg>`;const blob=new Blob([out],{type:"image/svg+xml;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="sheetnest-metal-layout.svg";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});

["sheetW","sheetH","material","thickness"].forEach(id=>$(id).addEventListener("input",updateSheetPreview));
setupCanvasZoom();updateSheetPreview();