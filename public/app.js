const SHEETNEST_ENGINE_BUILD="20260921-laser-watchdog-v1";
const state={sourceSvg:null,customParts:[],libraryParts:[],resultSvgs:[],resultMeta:null,bestResultSvgs:[],bestResultMeta:null,running:false,startedAt:0,durationMs:0,canvasZoom:1,searchFrames:0,bestFrames:0,nestingManifest:null,expectedPartCount:0,lastValidation:null,runId:0,engineAttemptId:0,instanceDiagnostics:{},unitToInstance:{},lastSearchRenderAt:0,lastDiagnosticsRenderAt:0,benchmarkActive:false,runStage:"Готово",runDeadline:0,runLastProgressAt:0,runWatchdogTimer:null,runWatchdogReason:"",runWatchdogStallMs:15000,runWatchdogLastEvent:"",runWatchdogLastInstanceId:"",runWatchdogLastUnitId:"",runWatchdogLastSheet:0,runWatchdogCandidateChecks:0,runWatchdogNfpChecks:0,runWatchdogNfpTimeouts:0,runWatchdogFeasibleCandidates:0,runWatchdogBoundsRejects:0,runWatchdogCollisionRejects:0,runWatchdogStartedAt:0,runWatchdogState:"idle"};

const $=id=>document.getElementById(id);
const status=value=>{$("status").textContent=value};

function readNumber(id,fallback){const n=Number($(id).value);return Number.isFinite(n)?n:fallback}
function qualityConfig(){
  const q=$("quality").value;
  if(q==="fast")return{mode:"fast",seconds:10,populationSize:12,mutationRate:12};
  if(q==="max")return{mode:"max",seconds:90,populationSize:40,mutationRate:18};
  return{mode:"normal",seconds:30,populationSize:24,mutationRate:15};
}
function benchmarkRuntimeConfig(orderSize,mode,budgetMs){
  const base=adaptiveNestingConfig(orderSize);
  const baseline=mode==="baseline";
  return {
    ...base,
    benchmark:true,
    batchMs:Math.max(1000,Number(budgetMs)||5000),
    persistNfpCache:!baseline,
    fastPlacementScoring:!baseline,
    secondOrientationThreshold:0,
    refillPasses:base.refillPasses,
    refillSheets:base.refillSheets,
    poolMax:base.poolMax,
    candidateVariants:base.candidateVariants,
    sheetCandidateMs:base.sheetCandidateMs,
    sheetPenalty:baseline?1:base.sheetPenalty,
    fillWeight:baseline?0:base.fillWeight,
    densePlacementScoring:!baseline,
    local:base.local
  };
}

function isLocalFileMode(){
  try{return typeof location!=="undefined"&&location.protocol==="file:"}catch(_){return false}
}
function adaptiveNestingConfig(orderSize){
  const q=qualityConfig();
  const large=orderSize>28;
  const local=isLocalFileMode();
  const hugeLocal=local&&orderSize>80;
  const veryLargeLocal=local&&orderSize>140;
  if(!large){
    return{
      ...q,
      rotations:Math.max(1,Math.floor(readNumber("rotations",2))),
      batchMs:Math.max(5000,Math.min(q.seconds*1000,q.mode==="max"?16000:9000)),
      rescueAttempts:6,
      refillCandidates:8,
      refillPasses:2,
      refillSheets:999,
      poolMax:local?16:24,
      candidateVariants:q.mode==="max"?4:3,
      candidateBudget:q.mode==="max"?2400:(q.mode==="fast"?700:1400),
      segmentSamples:q.mode==="max"?2:1,
      candidateGrid:q.mode==="max"?0.02:0.05,
      nfpSearchBudgetMs:q.mode==="max"?450:(q.mode==="fast"?140:250),
      sheetCandidateMs:local?(q.mode==="max"?9000:(q.mode==="fast"?4500:7000)):(q.mode==="max"?7000:(q.mode==="fast"?2800:5200)),
      sheetPenalty:2,
      fillWeight:1.2,
      densePlacementScoring:true,
      secondOrientationThreshold:0,
      local
    };
  }
  const rotations= q.mode==="max"
    ?Math.max(1,Math.min(4,Math.floor(readNumber("rotations",2))))
    :Math.max(1,Math.min(2,Math.floor(readNumber("rotations",2))));
  const populationCap=orderSize>120?(q.mode==="max"?20:(q.mode==="fast"?12:14)):(q.mode==="max"?26:(q.mode==="fast"?12:18));
  const populationSize=Math.min(q.populationSize,populationCap);
  const mutationRate=Math.min(q.mutationRate,q.mode==="max"?17:(q.mode==="fast"?11:14));
  const batchMs=hugeLocal
    ?(q.mode==="max"?7000:(q.mode==="fast"?4000:5000))
    :(q.mode==="max"?8000:(q.mode==="fast"?4000:6000));
  return{
    ...q,
    rotations,
    populationSize:hugeLocal?Math.min(populationSize,q.mode==="max"?18:14):populationSize,
    mutationRate:hugeLocal?Math.min(mutationRate,q.mode==="max"?15:12):mutationRate,
    batchMs,
    rescueAttempts:hugeLocal?4:(orderSize>120?4:6),
    refillCandidates:hugeLocal?6:Math.min(12,Math.max(8,Math.ceil(orderSize/20))),
    refillPasses:hugeLocal?2:3,
    refillSheets:999,
    poolMax:local
      ?(veryLargeLocal?(q.mode==="max"?10:8):(hugeLocal?(q.mode==="max"?12:10):(q.mode==="max"?14:12)))
      :(q.mode==="max"?24:20),
    candidateVariants:q.mode==="max"
      ?(local?(hugeLocal?2:3):4)
      :(local?(hugeLocal?2:2):3),
    sheetCandidateMs:local
      ?(hugeLocal
        ?(q.mode==="max"?5500:(q.mode==="fast"?3200:4500))
        :(q.mode==="max"?6500:(q.mode==="fast"?3200:4800)))
      :(q.mode==="max"?8500:(q.mode==="fast"?3500:6500)),
    sheetPenalty:q.mode==="max"?2.8:2.4,
    fillWeight:q.mode==="max"?1.7:1.5,
    densePlacementScoring:true,
    secondOrientationThreshold:hugeLocal?0.6:0.72,
    candidateBudget:q.mode==="max"?(hugeLocal?1400:2200):(hugeLocal?650:1100),
    segmentSamples:q.mode==="max"?(hugeLocal?1:2):1,
    candidateGrid:q.mode==="max"?0.03:0.06,
    nfpSearchBudgetMs:q.mode==="max"?(hugeLocal?320:420):(hugeLocal?160:240),
    local
  };
}
function getSheet(){const w=readNumber("sheetW",1500),h=readNumber("sheetH",3000);if(w<=0||h<=0)throw new Error("Размер листа должен быть больше нуля.");return{w,h,auto:$("orientation").value==="auto"}}
function escapeHtml(s){return String(s).replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}

function updateSheetPreview(){
  const w=readNumber("sheetW",1500),h=readNumber("sheetH",3000);
  const ratio=Math.max(.25,Math.min(3,w/h));
  $("sheetShape").style.setProperty("--ratio",ratio);
  $("previewW").textContent=w+" мм";
  $("previewH").textContent=h+" мм";
  $("previewMaterial").textContent=$("material").value+" · "+readNumber("thickness",3)+" мм";
}

const SHAPE_LIBRARY=[
  {id:"rect",name:"Прямоугольник",kind:"rect",params:["w","h"],w:200,h:100,size:"200 × 100 мм"},
  {id:"square",name:"Квадрат",kind:"square",params:["side"],side:120,w:120,h:120,size:"120 × 120 мм"},
  {id:"circle",name:"Круг",kind:"circle",params:["diameter"],diameter:100,w:100,h:100,size:"Ø 100 мм"},
  {id:"triangle",name:"Треугольник",kind:"triangle",params:["w","h"],w:140,h:120,size:"140 × 120 мм"},
  {id:"hex",name:"Шестиугольник",kind:"hex",params:["w","h"],w:120,h:104,size:"120 × 104 мм"},
  {id:"roundrect",name:"Скруглённый прямоугольник",kind:"roundrect",params:["w","h","radius"],w:220,h:100,radius:20,size:"220 × 100 мм · R20"}
];

function clampShapeNumber(value,min=1,max=9999){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;
}
function getShapeDefinition(shapeId){
  return SHAPE_LIBRARY.find(item=>item.id===shapeId)||null;
}
function libraryPartShape(part){
  const base=getShapeDefinition(part?.shapeId||part?.id);
  if(!base)return null;
  const shape={...base};
  if(base.kind==="square"){
    const side=clampShapeNumber(part?.side??base.side);
    shape.side=side;shape.w=side;shape.h=side;
  }else if(base.kind==="circle"){
    const diameter=clampShapeNumber(part?.diameter??base.diameter);
    shape.diameter=diameter;shape.w=diameter;shape.h=diameter;
  }else{
    shape.w=clampShapeNumber(part?.w??base.w);
    shape.h=clampShapeNumber(part?.h??base.h);
  }
  if(base.kind==="roundrect"){
    shape.radius=clampShapeNumber(part?.radius??base.radius,0,Math.min(shape.w,shape.h)/2);
  }
  shape.size=shapeSizeText(shape);
  return shape;
}
function shapeSizeText(shape){
  if(!shape)return"";
  if(shape.kind==="circle")return"Ø "+Math.round(shape.diameter)+" мм";
  if(shape.kind==="square")return Math.round(shape.side)+" × "+Math.round(shape.side)+" мм";
  if(shape.kind==="roundrect")return Math.round(shape.w)+" × "+Math.round(shape.h)+" мм · R"+Math.round(shape.radius);
  return Math.round(shape.w)+" × "+Math.round(shape.h)+" мм";
}
function shapeControlField(key,value,label,unit="мм"){
  return "<label class='shape-param'><span>"+escapeHtml(label)+"</span><div class='input-suffix'><input type='number' data-shape-param='"+key+"' min='0.5' max='9999' step='0.5' value='"+Number(value)+"'><em>"+unit+"</em></div></label>";
}
function shapeControlsHtml(shape){
  const fields=[];
  if(shape.kind==="square")fields.push(shapeControlField("side",shape.side,"Сторона"));
  else if(shape.kind==="circle")fields.push(shapeControlField("diameter",shape.diameter,"Диаметр"));
  else{
    fields.push(shapeControlField("w",shape.w,"Ширина"));
    fields.push(shapeControlField("h",shape.h,"Высота"));
    if(shape.kind==="roundrect")fields.push(shapeControlField("radius",shape.radius,"Радиус"));
  }
  return "<div class='shape-param-grid'>"+fields.join("")+"</div>";
}

function roundedRectPath(w,h,r){
  const rr=Math.max(0,Math.min(r,Math.min(w,h)/2));
  if(rr<=0)return "M0 0 L"+w+" 0 L"+w+" "+h+" L0 "+h+" Z";
  const points=[];
  const corners=[[w-rr,rr,Math.PI*1.5,Math.PI*2],[w-rr,h-rr,0,Math.PI/2],[rr,h-rr,Math.PI/2,Math.PI],[rr,rr,Math.PI,Math.PI*1.5]];
  corners.forEach(corner=>{
    const cx=corner[0],cy=corner[1],a0=corner[2],a1=corner[3],steps=5;
    for(let i=0;i<=steps;i++){
      const a=a0+(a1-a0)*i/steps;
      points.push({x:cx+rr*Math.cos(a),y:cy+rr*Math.sin(a)});
    }
  });
  return "M "+points.map(p=>p.x.toFixed(2)+" "+p.y.toFixed(2)).join(" L ")+" Z";
}

function shapePath(shapeOrPart){
  const shape=(shapeOrPart?.shapeId||shapeOrPart?.kind?libraryPartShape(shapeOrPart)||shapeOrPart:shapeOrPart)||{};
  const w=Math.max(1,Number(shape.w)||100),h=Math.max(1,Number(shape.h)||100);
  if(shape.kind==="rect")return "M0 0 L"+w+" 0 L"+w+" "+h+" L0 "+h+" Z";
  if(shape.kind==="square")return "M0 0 L"+w+" 0 L"+w+" "+h+" L0 "+h+" Z";
  if(shape.kind==="triangle")return "M0 "+h+" L"+(w/2)+" 0 L"+w+" "+h+" Z";
  if(shape.kind==="hex"){
    const inset=w*0.208333;
    return "M"+inset+" 0 L"+(w-inset)+" 0 L"+w+" "+(h/2)+" L"+(w-inset)+" "+h+" L"+inset+" "+h+" L0 "+(h/2)+" Z";
  }
  if(shape.kind==="roundrect")return roundedRectPath(w,h,Number(shape.radius)||0);
  const r=(Number(shape.diameter)||Math.min(w,h))/2,cx=w/2,cy=h/2,points=[];
  for(let i=0;i<64;i++){
    const angle=-Math.PI/2+i*(Math.PI*2/64);
    points.push({x:cx+r*Math.cos(angle),y:cy+r*Math.sin(angle)});
  }
  return "M "+points.map(p=>p.x.toFixed(2)+" "+p.y.toFixed(2)).join(" L ")+" Z";
}
function shapePreview(shapeOrPart){
  const shape=(shapeOrPart?.shapeId||shapeOrPart?.kind?libraryPartShape(shapeOrPart)||shapeOrPart:shapeOrPart);
  if(!shape)return"";
  return "<svg viewBox='0 0 "+shape.w+" "+shape.h+"' aria-hidden='true'><path d='"+shapePath(shape)+"'/></svg>";
}
function normalizedQuantity(part){return Math.max(1,Math.min(9999,Math.floor(Number(part&&part.quantity)||1)))}
function partNestingUnits(part){return Math.max(1,Math.floor(Number(part&&part.nestingUnits)||1))}
function requestedPartCount(){
  const custom=state.customParts.reduce((sum,part)=>sum+normalizedQuantity(part)*partNestingUnits(part),0);
  const library=state.libraryParts.reduce((sum,part)=>sum+normalizedQuantity(part)*partNestingUnits(part),0);
  return custom+library;
}
function estimateSvgBounds(svgText){
  const doc=new DOMParser().parseFromString(svgText,"image/svg+xml"),root=doc.documentElement;
  if(!root||root.nodeName.toLowerCase()!=="svg")return{minX:0,minY:0,width:1,height:1};
  const vb=(root.getAttribute("viewBox")||"").trim().split(/[ ,]+/).map(Number);
  if(vb.length===4&&vb.every(Number.isFinite))return{minX:vb[0],minY:vb[1],width:Math.max(1,Math.abs(vb[2])),height:Math.max(1,Math.abs(vb[3]))};
  const width=parseFloat(root.getAttribute("width"))||1,height=parseFloat(root.getAttribute("height"))||1;
  return{minX:0,minY:0,width:Math.max(1,width),height:Math.max(1,height)};
}
function stampNestingSource(node,instanceId,partId){
  if(!node||node.nodeType!==1)return;
  node.setAttribute("data-sheetnest-source-instance-id",instanceId);
  if(partId)node.setAttribute("data-sheetnest-source",partId);
  node.removeAttribute("id");
  Array.from(node.children||[]).forEach(child=>stampNestingSource(child,instanceId,partId));
}
function appendStagedInstance(root,elements,bounds,instanceId,partId,stageX,stageY){
  const ns="http://www.w3.org/2000/svg";
  const group=document.createElementNS(ns,"g");
  group.setAttribute("data-sheetnest-stage-instance",instanceId);
  group.setAttribute("transform","translate("+ (stageX-bounds.minX) +" "+ (stageY-bounds.minY) +")");
  elements.forEach(element=>{
    const clone=element.cloneNode(true);
    stampNestingSource(clone,instanceId,partId);
    group.appendChild(clone);
  });
  root.appendChild(group);
}
function createNestingManifest(){
  const manifest=[];
  state.customParts.forEach(part=>manifest.push({id:part.id,name:part.name,type:"cad",quantity:normalizedQuantity(part),units:partNestingUnits(part)}));
  state.libraryParts.forEach(part=>{
    const shape=libraryPartShape(part);
    if(shape)manifest.push({id:part.id,name:shape.name,type:"library",quantity:normalizedQuantity(part),units:1,geometry:shape.size});
  });
  return manifest;
}

function appendSourcePreview(container,svgText){
  try{
    const doc=new DOMParser().parseFromString(svgText,"image/svg+xml"),root=doc.documentElement;
    if(!root||root.nodeName.toLowerCase()!=="svg")return;
    const preview=document.createElementNS("http://www.w3.org/2000/svg","svg");
    preview.setAttribute("viewBox",root.getAttribute("viewBox")||"0 0 "+(root.getAttribute("width")||100)+" "+(root.getAttribute("height")||100));
    preview.setAttribute("aria-hidden","true");preview.classList.add("part-preview-svg");
    Array.from(root.children).filter(node=>!["defs","style","title","desc","metadata","script"].includes(node.tagName.toLowerCase())).forEach(node=>preview.appendChild(node.cloneNode(true)));
    container.appendChild(preview);
  }catch(_){}
}

function addCustomPartCard(item){
  const wrap=$("selectedParts");if(!wrap)return;
  const row=document.createElement("div");row.className="selected-part selected-part-cad";row.dataset.partId=item.id;
  row.innerHTML="<div class=\"selected-part-thumb cad-thumb\"></div><div class=\"selected-part-info\"><b>"+escapeHtml(item.name)+"</b><small>CAD · "+item.nestingUnits+" дет. · "+item.contours+" контур(ов) · "+item.holes+" внутр.</small></div><input class=\"selected-part-qty\" type=\"number\" min=\"1\" max=\"9999\" step=\"1\" value=\""+item.quantity+"\" aria-label=\"Количество "+escapeHtml(item.name)+"\"><button class=\"selected-part-remove\" type=\"button\" title=\"Удалить\" aria-label=\"Удалить "+escapeHtml(item.name)+"\">×</button>";
  appendSourcePreview(row.querySelector(".cad-thumb"),item.svgText);
  row.querySelector(".selected-part-qty").addEventListener("change",event=>{
    const value=Math.max(1,Math.min(9999,Math.floor(Number(event.target.value)||1)));event.target.value=String(value);
    const target=state.customParts.find(entry=>entry.id===item.id);if(target)target.quantity=value;updateGeometryInfo();
  });
  row.querySelector(".selected-part-remove").addEventListener("click",()=>{
    state.customParts=state.customParts.filter(entry=>entry.id!==item.id);renderSelectedShapes();updateGeometryInfo();
  });
  wrap.appendChild(row);
}

function updateGeometryInfo(){
  const chip=$("geometryInfo"),fileLine=$("fileName");
  if(!chip)return;
  const bits=[];
  if(state.customParts.length)bits.push(...state.customParts.map(part=>part.name+" × "+part.quantity+" · "+partNestingUnits(part)+" дет./экз."));
  if(state.libraryParts.length)bits.push(...state.libraryParts.map(part=>{const shape=libraryPartShape(part);return (shape?shape.name+" "+shape.size:part.id)+" × "+part.quantity;}));
  if(fileLine)fileLine.textContent=state.customParts.length?state.customParts.length+" CAD-файл(ов): "+state.customParts.map(part=>part.name).join(", "):"Файл не выбран";
  const partsTotal=$("partsTotal");if(partsTotal)partsTotal.textContent=requestedPartCount();
  if(!bits.length){chip.innerHTML="<span class=\"chip-dot\"></span><span>Геометрия не загружена</span>";return;}
  chip.innerHTML="<span class=\"chip-dot\"></span><span>"+escapeHtml(bits.join(" · "))+"</span>";
}
function applyShapeInputs(target,container){
  if(!target||!container)return target;
  container.querySelectorAll("[data-shape-param]").forEach(input=>{
    const key=input.getAttribute("data-shape-param");
    if(key)target[key]=clampShapeNumber(input.value);
  });
  if(target.kind==="square"){
    target.side=clampShapeNumber(target.side);
    target.w=target.side;target.h=target.side;
  }else if(target.kind==="circle"){
    target.diameter=clampShapeNumber(target.diameter);
    target.w=target.diameter;target.h=target.diameter;
  }else{
    target.w=clampShapeNumber(target.w);target.h=clampShapeNumber(target.h);
  }
  if(target.kind==="roundrect")target.radius=clampShapeNumber(target.radius,0,Math.min(target.w,target.h)/2);
  return target;
}
function updateShapePreviewInCard(card,draft){
  const shape=libraryPartShape(draft)||draft;
  const thumb=card.querySelector(".shape-thumb");
  const size=card.querySelector(".shape-card-size");
  if(thumb)thumb.innerHTML=shapePreview(shape);
  if(size)size.textContent=shapeSizeText(shape);
}
function makeLibraryPart(shape,draft,quantity){
  const geometry={shapeId:shape.id,kind:shape.kind,w:shape.w,h:shape.h,side:draft.side,diameter:draft.diameter,radius:draft.radius};
  return {
    id:"libpart-"+shape.id+"-"+Date.now()+"-"+Math.random().toString(36).slice(2,8),
    ...geometry,
    quantity:Math.max(1,Math.min(9999,Math.floor(Number(quantity)||1))),
    nestingUnits:1,contours:1,holes:0
  };
}
function sameLibraryGeometry(a,b){
  return a&&b&&(a.shapeId||a.id)===(b.shapeId||b.id)
    && Math.abs(Number(a.w||0)-Number(b.w||0))<0.001
    && Math.abs(Number(a.h||0)-Number(b.h||0))<0.001
    && Math.abs(Number(a.side||0)-Number(b.side||0))<0.001
    && Math.abs(Number(a.diameter||0)-Number(b.diameter||0))<0.001
    && Math.abs(Number(a.radius||0)-Number(b.radius||0))<0.001;
}
function selectedLibraryPartHtml(part){
  const shape=libraryPartShape(part);
  if(!shape)return"";
  return "<div class='selected-part-thumb'>"+shapePreview(shape)+"</div>"+
    "<div class='selected-part-info'><b>"+escapeHtml(shape.name)+"</b><small>Типовая · "+escapeHtml(shape.size)+"</small></div>"+
    "<div class='selected-part-controls'><div class='selected-part-settings'>"+shapeControlsHtml(shape)+"</div>"+
    "<input class='selected-part-qty' type='number' min='1' max='9999' step='1' value='"+normalizedQuantity(part)+"' aria-label='Количество "+escapeHtml(shape.name)+"'>"+
    "<button class='selected-part-remove' type='button' title='Удалить' aria-label='Удалить "+escapeHtml(shape.name)+"'>×</button></div>";
}
function bindLibraryPartCard(item,part){
  item.querySelector(".selected-part-qty")?.addEventListener("change",event=>{
    part.quantity=Math.max(1,Math.min(9999,Math.floor(Number(event.target.value)||1)));
    event.target.value=String(part.quantity);
    updateGeometryInfo();
  });
  item.querySelectorAll("[data-shape-param]").forEach(input=>{
    input.addEventListener("change",()=>{
      applyShapeInputs(part,item);
      renderSelectedShapes();
      updateGeometryInfo();
    });
  });
  item.querySelector(".selected-part-remove")?.addEventListener("click",()=>{
    state.libraryParts=state.libraryParts.filter(entry=>entry.id!==part.id);
    renderSelectedShapes();updateGeometryInfo();
  });
}
function renderSelectedShapes(){
  const wrap=$("selectedParts"),empty=$("selectedPartsEmpty");if(!wrap||!empty)return;
  wrap.querySelectorAll(".selected-part").forEach(node=>node.remove());
  const hasParts=state.customParts.length||state.libraryParts.length;empty.style.display=hasParts?"none":"block";
  state.customParts.forEach(addCustomPartCard);
  state.libraryParts.forEach(part=>{
    const shape=libraryPartShape(part);if(!shape)return;
    const item=document.createElement("div");
    item.className="selected-part selected-part-library";
    item.dataset.partId=part.id;
    item.innerHTML=selectedLibraryPartHtml(part);
    bindLibraryPartCard(item,part);
    wrap.appendChild(item);
  });
}
function setupShapeLibrary(){
  const library=$("shapeLibrary");
  if(!library||library.dataset.ready==="1")return;
  library.dataset.ready="1";library.innerHTML="";
  SHAPE_LIBRARY.forEach(shape=>{
    const draft={...shape};
    const card=document.createElement("article");
    card.className="shape-card";
    card.innerHTML="<div class='shape-thumb'>"+shapePreview(draft)+"</div>"+
      "<div class='shape-card-copy'><b>"+escapeHtml(shape.name)+"</b><small class='shape-card-size'>"+escapeHtml(shape.size)+"</small></div>"+
      "<div class='shape-card-params'>"+shapeControlsHtml(draft)+"</div>"+
      "<div class='shape-card-actions'><input class='shape-card-qty' type='number' min='1' max='9999' step='1' value='1' aria-label='Количество "+escapeHtml(shape.name)+"'>"+
      "<button class='shape-add' type='button' title='Добавить в раскрой' aria-label='Добавить "+escapeHtml(shape.name)+"'>+</button></div>";
    card.querySelectorAll("[data-shape-param]").forEach(input=>{
      input.addEventListener("input",()=>{
        applyShapeInputs(draft,card);
        updateShapePreviewInCard(card,draft);
      });
    });
    card.querySelector(".shape-add").addEventListener("click",()=>{
      applyShapeInputs(draft,card);
      const quantity=Math.max(1,Math.min(9999,Math.floor(Number(card.querySelector(".shape-card-qty").value)||1)));
      const newPart=makeLibraryPart(shape,draft,quantity);
      const existing=state.libraryParts.find(entry=>sameLibraryGeometry(entry,newPart));
      if(existing)existing.quantity=Math.min(9999,existing.quantity+quantity);
      else state.libraryParts.push(newPart);
      card.querySelector(".shape-card-qty").value="1";
      renderSelectedShapes();updateGeometryInfo();status("Фигура добавлена");
    });
    library.appendChild(card);
  });
  $("clearShapes")?.addEventListener("click",()=>{
    state.libraryParts=[];renderSelectedShapes();updateGeometryInfo();
  });
  renderSelectedShapes();
}

function appendCustomParts(root,stage){
  for(const part of state.customParts){
    const elements=sourceElements(part.svgText),repeat=normalizedQuantity(part),bounds=estimateSvgBounds(part.svgText);
    for(let copy=0;copy<repeat;copy++){
      const instanceId=part.id+"#"+(copy+1);
      appendStagedInstance(root,elements,bounds,instanceId,part.id,stage.nextX,stage.nextY);
      stage.nextX+=bounds.width+stage.gap;
      stage.rowHeight=Math.max(stage.rowHeight,bounds.height);
      if(stage.nextX>stage.maxWidth){
        stage.nextX=0;
        stage.nextY+=stage.rowHeight+stage.gap;
        stage.rowHeight=0;
      }
    }
  }
}

function appendLibraryParts(root,stage){
  for(const part of state.libraryParts){
    const shape=libraryPartShape(part);
    if(!shape)continue;
    const d=shapePath(shape);
    const bounds={minX:0,minY:0,width:Math.max(1,shape.w),height:Math.max(1,shape.h)};
    for(let copy=0;copy<normalizedQuantity(part);copy++){
      const instanceId="library-"+part.id+"#"+(copy+1);
      const ns="http://www.w3.org/2000/svg",group=document.createElementNS(ns,"g");
      group.setAttribute("data-sheetnest-stage-instance",instanceId);
      group.setAttribute("data-sheetnest-shape",shape.id);
      group.setAttribute("transform","translate("+stage.nextX+" "+stage.nextY+")");
      const path=document.createElementNS(ns,"path");
      path.setAttribute("d",d);path.setAttribute("fill","#aeb8c2");path.setAttribute("fill-opacity","0.72");path.setAttribute("stroke","#313a44");path.setAttribute("stroke-width",".9");
      stampNestingSource(path,instanceId,shape.id);
      group.appendChild(path);root.appendChild(group);
      stage.nextX+=bounds.width+stage.gap;
      stage.rowHeight=Math.max(stage.rowHeight,bounds.height);
      if(stage.nextX>stage.maxWidth){
        stage.nextX=0;
        stage.nextY+=stage.rowHeight+stage.gap;
        stage.rowHeight=0;
      }
    }
  }
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
function dxfPolylineVertices(entity){
  const vertices=[];
  let current=null;
  for(const pair of entity.pairs){
    if(pair.type===10){
      if(current&&current.x!==null&&current.y!==null)vertices.push(current);
      current={x:dxfNum(pair.value),y:null,bulge:0};
    }else if(pair.type===20&&current){
      current.y=dxfNum(pair.value);
    }else if(pair.type===42&&current){
      current.bulge=dxfNum(pair.value);
    }
  }
  if(current&&current.x!==null&&current.y!==null)vertices.push(current);
  return vertices;
}
function dxfBulgePoints(start,end,bulge){
  const b=dxfNum(bulge);
  if(Math.abs(b)<1e-9)return [start,end];
  const dx=end.x-start.x,dy=end.y-start.y,chord=Math.hypot(dx,dy);
  if(chord<1e-9)return [start];
  const theta=4*Math.atan(b);
  const radius=chord*(1+b*b)/(4*Math.abs(b));
  const mx=(start.x+end.x)/2,my=(start.y+end.y)/2;
  const leftX=-dy/chord,leftY=dx/chord;
  const centerOffset=chord*(1-b*b)/(4*b);
  const cx=mx+leftX*centerOffset,cy=my+leftY*centerOffset;
  const startAngle=Math.atan2(start.y-cy,start.x-cx);
  const steps=Math.max(2,Math.ceil(Math.abs(theta)*180/Math.PI/5));
  const points=[];
  for(let i=0;i<=steps;i++){
    const angle=startAngle+theta*i/steps;
    points.push({x:cx+radius*Math.cos(angle),y:cy+radius*Math.sin(angle)});
  }
  points[0]=start;points[points.length-1]=end;
  return points;
}
function dxfExpandPolyline(vertices,closed){
  if(vertices.length<2)return[];
  const points=[];
  const edgeCount=closed?vertices.length:vertices.length-1;
  for(let i=0;i<edgeCount;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length];
    const arc=dxfBulgePoints({x:a.x,y:a.y},{x:b.x,y:b.y},a.bulge);
    if(!points.length)points.push(...arc);
    else points.push(...arc.slice(1));
  }
  if(closed&&points.length>1&&dxfSame(points[0],points[points.length-1]))points.pop();
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
      const flags=dxfNum(dxfPair(e,70,0));
      const pts=dxfExpandPolyline(dxfPolylineVertices(e),(flags&1)!==0);
      if(pts.length>=2){
        (flags&1?closed:open).push(pts);
      }
      continue;
    }
    if(type==="POLYLINE"){
      const pts=[];let j=i+1;
      for(;j<entities.length;j++){
        const child=entities[j],ct=String(child.type||"").toUpperCase();
        if(ct==="VERTEX"){
          pts.push({
            x:dxfNum(dxfPair(child,10)),
            y:dxfNum(dxfPair(child,20)),
            bulge:dxfNum(dxfPair(child,42,0))
          });
          continue;
        }
        if(ct==="SEQEND")break;
        break;
      }
      i=j;
      if(pts.length>=2){
        const flags=dxfNum(dxfPair(e,70,0));
        const expanded=dxfExpandPolyline(pts,(flags&1)!==0);
        (flags&1?closed:open).push(expanded);
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
      for(let k=0;k<pts.length-1;k++)segments.push({a:pts[k],b:pts[k+1]});
      continue;
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
  // Все замкнутые DXF-контуры сохраняем как subpath одного <path>.
  // Это важно для корректной визуальной заливки: fill-rule="evenodd"
  // делает вложенные контуры отверстиями независимо от направления обхода.
  const compoundPath=closed.map(c=>{
    const shifted=c.map(p=>({x:p.x-minX,y:p.y-maxY}));
    return dxfPathFromPoints(shifted);
  }).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-contours="${closed.length}" data-open="${open.length}"><path d="${compoundPath.replace(/"/g,"&quot;")}" fill="#111820" fill-opacity="1" fill-rule="evenodd" stroke="#05070a" stroke-width="0.2" stroke-linejoin="round" stroke-linecap="round" /></svg>`;
}

function sourceElements(svgText){
  const doc=new DOMParser().parseFromString(svgText,"image/svg+xml"),root=doc.documentElement;
  if(!root||root.nodeName.toLowerCase()!=="svg")throw new Error("Файл не является корректным SVG.");
  const result=Array.from(root.children).filter(node=>!["defs","style","title","desc","metadata"].includes(node.tagName.toLowerCase()));
  if(!result.length)throw new Error("В файле не найдена векторная геометрия.");
  return result.map(node=>node.cloneNode(true));
}

function buildNestingInstances(){
  const out=[];
  state.customParts.forEach(part=>{
    const quantity=normalizedQuantity(part);
    for(let copy=1;copy<=quantity;copy++){
      out.push({instanceId:part.id+"#"+copy,kind:"custom",part,copy});
    }
  });
  state.libraryParts.forEach(part=>{
    const shape=libraryPartShape(part);if(!shape)return;
    const quantity=normalizedQuantity(part);
    for(let copy=1;copy<=quantity;copy++){
      out.push({instanceId:"library-"+part.id+"#"+copy,kind:"library",part,shape,copy});
    }
  });
  return out;
}

function appendNestingInstances(root,stage,instances){
  const ns="http://www.w3.org/2000/svg";
  for(const item of instances||[]){
    if(item.kind==="custom"){
      const elements=sourceElements(item.part.svgText),bounds=estimateSvgBounds(item.part.svgText);
      appendStagedInstance(root,elements,bounds,item.instanceId,item.part.id,stage.nextX,stage.nextY);
      stage.nextX+=bounds.width+stage.gap;
      stage.rowHeight=Math.max(stage.rowHeight,bounds.height);
    }else if(item.kind==="library"&&item.shape){
      const shape=item.shape,bounds={minX:0,minY:0,width:Math.max(1,shape.w),height:Math.max(1,shape.h)};
      const group=document.createElementNS(ns,"g");
      group.setAttribute("data-sheetnest-stage-instance",item.instanceId);
      group.setAttribute("data-sheetnest-shape",shape.id);
      group.setAttribute("transform","translate("+stage.nextX+" "+stage.nextY+")");
      const path=document.createElementNS(ns,"path");
      path.setAttribute("d",shapePath(shape));
      path.setAttribute("fill","#aeb8c2");
      path.setAttribute("fill-opacity","0.72");
      path.setAttribute("stroke","#313a44");
      path.setAttribute("stroke-width",".9");
      stampNestingSource(path,item.instanceId,shape.id);
      group.appendChild(path);root.appendChild(group);
      stage.nextX+=bounds.width+stage.gap;
      stage.rowHeight=Math.max(stage.rowHeight,bounds.height);
    }
    if(stage.nextX>stage.maxWidth){
      stage.nextX=0;
      stage.nextY+=stage.rowHeight+stage.gap;
      stage.rowHeight=0;
    }
  }
}

function buildNestingSvgForInstances(w,h,instances){
  const margin=Math.max(0,readNumber("margin",10)),innerW=w-2*margin,innerH=h-2*margin;
  if(innerW<=0||innerH<=0)throw new Error("Поле от края больше размера металлического листа.");
  const ns="http://www.w3.org/2000/svg",root=document.createElementNS(ns,"svg");
  root.setAttribute("xmlns",ns);root.setAttribute("viewBox","0 0 "+innerW+" "+innerH);root.setAttribute("width",String(innerW));root.setAttribute("height",String(innerH));
  const bin=document.createElementNS(ns,"rect");bin.setAttribute("id","sheet-bin");bin.setAttribute("x","0");bin.setAttribute("y","0");bin.setAttribute("width",String(innerW));bin.setAttribute("height",String(innerH));root.appendChild(bin);
  const stage={nextX:0,nextY:0,rowHeight:0,gap:Math.max(50,readNumber("gap",2)*20),maxWidth:Math.max(10000,innerW*20,100000)};
  appendNestingInstances(root,stage,instances);
  return new XMLSerializer().serializeToString(root);
}

function buildNestingSvg(w,h){
  return buildNestingSvgForInstances(w,h,buildNestingInstances());
}
function resetEngine(runtimeConfig=null){
  try{SvgNest.stop()}catch(_){}
  const q=runtimeConfig||adaptiveNestingConfig(0);
  SvgNest.config({
    spacing:readNumber("gap",2),
    rotations:q.rotations||Math.max(1,Math.floor(readNumber("rotations",2))),
    populationSize:q.populationSize,
    mutationRate:q.mutationRate,
    curveTolerance:.2,
    useHoles:true,
    exploreConcave:true,
    persistNfpCache:q.persistNfpCache!==false,
    fastPlacementScoring:q.fastPlacementScoring!==false,
    densePlacementScoring:q.densePlacementScoring!==false,
    sheetPenalty:Number.isFinite(Number(q.sheetPenalty))?Number(q.sheetPenalty):2,
    fillWeight:Number.isFinite(Number(q.fillWeight))?Number(q.fillWeight):1.2,
  });
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
function setupSheetDragging(wrap){
  if(!wrap||wrap.dataset.sheetDragReady==="1")return;
  wrap.dataset.sheetDragReady="1";

  let drag=null;

  const applyPosition=(card,x,y)=>{
    const safeX=Number.isFinite(x)?x:0;
    const safeY=Number.isFinite(y)?y:0;
    card.dataset.dragX=String(safeX);
    card.dataset.dragY=String(safeY);
    card.style.transform="translate3d("+safeX+"px,"+safeY+"px,0)";
  };

  const finish=()=>{
    if(!drag)return;
    drag.card.classList.remove("sheet-dragging");
    drag.card.style.zIndex="";
    try{drag.card.releasePointerCapture?.(drag.pointerId)}catch(_){}
    drag=null;
  };

  wrap.addEventListener("pointerdown",event=>{
    if(event.button!==0)return;
    const card=event.target.closest(".result-card");
    if(!card||!wrap.contains(card)||!card.classList.contains("sheet-card-draggable"))return;
    if(event.target.closest("button,input,select,textarea,a"))return;

    const startX=Number(card.dataset.dragX||0);
    const startY=Number(card.dataset.dragY||0);
    drag={
      card,
      pointerId:event.pointerId,
      startPointerX:event.clientX,
      startPointerY:event.clientY,
      startX:Number.isFinite(startX)?startX:0,
      startY:Number.isFinite(startY)?startY:0
    };
    card.classList.add("sheet-dragging");
    card.style.zIndex="20";
    try{card.setPointerCapture?.(event.pointerId)}catch(_){}
    event.preventDefault();
  });

  wrap.addEventListener("pointermove",event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    const dx=event.clientX-drag.startPointerX;
    const dy=event.clientY-drag.startPointerY;
    applyPosition(drag.card,drag.startX+dx,drag.startY+dy);
    event.preventDefault();
  });

  wrap.addEventListener("pointerup",event=>{
    if(drag&&event.pointerId===drag.pointerId)finish();
  });
  wrap.addEventListener("pointercancel",event=>{
    if(drag&&event.pointerId===drag.pointerId)finish();
  });

  wrap.addEventListener("dblclick",event=>{
    const card=event.target.closest(".result-card");
    if(!card||!wrap.contains(card)||!card.classList.contains("sheet-card-draggable"))return;
    applyPosition(card,0,0);
  });
}

function setupCanvasZoom(){
  const wrap=$( "canvasWrap" );
  if(!wrap)return;
  setupSheetDragging(wrap);
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

function collectPlacedUnitIds(svgList){
  const ids=[];
  let missingMetadata=0;
  for(const svg of svgList||[]){
    const groups=Array.from(svg.querySelectorAll("g[data-sheetnest-unit-id]"));
    const allPlacedGroups=Array.from(svg.querySelectorAll("g[transform*=\"translate(\"]"));
    if(groups.length!==allPlacedGroups.length)missingMetadata+=Math.max(0,allPlacedGroups.length-groups.length);
    groups.forEach(group=>ids.push(group.getAttribute("data-sheetnest-unit-id")));
  }
  const seen=new Set(),duplicates=[];
  ids.forEach(id=>{if(seen.has(id))duplicates.push(id);else seen.add(id)});
  return {occurrences:ids.length,unique:seen.size,duplicates,missingMetadata,unitIds:ids};
}
function validateNestingResult(svgList,enginePlaced,expectedTotal){
  const info=collectPlacedUnitIds(svgList);
  const engineCount=Number(enginePlaced||0);
  const expected=Number(expectedTotal||0);
  const structurallyValid=info.missingMetadata===0&&info.occurrences===engineCount&&info.unique===info.occurrences&&engineCount<=expected;
  return {...info,enginePlaced:engineCount,expectedTotal:expected,valid:structurallyValid};
}

function diagnosticAddUnique(list,value){
  if(value&&list.indexOf(value)<0)list.push(value);
}
function diagnosticEntries(){return Object.values(state.instanceDiagnostics||{})}
function diagnosticStatusLabel(entry){
  if(entry.status==="placed")return"Размещено";
  if(entry.status==="lost")return"Потеряно";
  if(entry.status==="candidate")return"Кандидат";
  if(entry.status==="parsed")return"Распознано";
  if(entry.status==="staged")return"Staging";
  if(entry.status==="parser_error")return"Ошибка парсера";
  return"Импортировано";
}
function diagnosticStageLabel(entry){return entry.stage||"Импорт"}
function diagnosticStatusClass(entry){
  return entry.status==="placed"?"ok":entry.status==="lost"||entry.status==="parser_error"?"bad":entry.status==="candidate"?"warn":"idle";
}
function diagnosticsSnapshot(){
  const entries=diagnosticEntries();
  const placed=entries.filter(e=>e.status==="placed").length;
  const lost=entries.filter(e=>e.status==="lost"||e.status==="parser_error").length;
  const candidate=entries.filter(e=>e.status==="candidate").length;
  const totalUnits=entries.reduce((sum,e)=>sum+Number(e.expectedUnits||0),0);
  const finalUnits=entries.reduce((sum,e)=>sum+e.finalUnitIds.length,0);
  return {
    schema:"sheetnest.instance-diagnostics.v1",
    exportedAt:new Date().toISOString(),
    runId:state.runId,
    status:$("status")?.textContent||"",
    summary:{instances:entries.length,placed,lost,candidate,totalUnits,finalUnits},
    entries:entries.map(entry=>({
      instanceId:entry.instanceId,
      sourceId:entry.sourceId,
      type:entry.type,
      name:entry.name,
      status:entry.status,
      stage:entry.stage||"",
      failureStage:(entry.status==="lost"||entry.status==="parser_error")?(entry.stage||""):"",
      issue:entry.issue||"",
      expectedUnits:Number(entry.expectedUnits||0),
      unitIds:[...entry.unitIds],
      candidateUnitIds:[...entry.candidateUnitIds],
      bestCandidateUnitIds:[...entry.bestCandidateUnitIds],
      finalUnitIds:[...entry.finalUnitIds],
      candidateFrame:Number(entry.candidateFrame||0)
    }))
  };
}
function diagnosticsCsv(snapshot){
  const columns=["instanceId","sourceId","type","name","status","stage","failureStage","issue","expectedUnits","unitIds","candidateUnitIds","bestCandidateUnitIds","finalUnitIds","candidateFrame"];
  const cell=value=>"\"" + String(value??"").replace(/"/g,"\"\"") + "\"";
  const rows=snapshot.entries.map(entry=>[
    entry.instanceId,entry.sourceId,entry.type,entry.name,entry.status,entry.stage,entry.failureStage,entry.issue,
    entry.expectedUnits,entry.unitIds.join(" | "),entry.candidateUnitIds.join(" | "),
    entry.bestCandidateUnitIds.join(" | "),entry.finalUnitIds.join(" | "),entry.candidateFrame
  ].map(cell).join(";"));
  return "\uFEFF"+columns.map(cell).join(";")+"\r\n"+rows.join("\r\n")+"\r\n";
}
function diagnosticsFileStamp(){
  return new Date().toISOString().replace(/[:.]/g,"-").replace("T","_").replace("Z","");
}
function downloadDiagnosticsFile(content,type,extension){
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="sheetnest-instance-diagnostics-"+diagnosticsFileStamp()+"."+extension;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportDiagnosticsJSON(){
  const snapshot=diagnosticsSnapshot();
  downloadDiagnosticsFile(JSON.stringify(snapshot,null,2),"application/json;charset=utf-8","json");
}
function exportDiagnosticsCSV(){
  const snapshot=diagnosticsSnapshot();
  downloadDiagnosticsFile(diagnosticsCsv(snapshot),"text/csv;charset=utf-8","csv");
}
function initializeInstanceDiagnostics(){
  state.instanceDiagnostics={};
  state.unitToInstance={};
  state.customParts.forEach(part=>{
    const quantity=normalizedQuantity(part);
    for(let copy=0;copy<quantity;copy++){
      const instanceId=part.id+"#"+(copy+1);
      state.instanceDiagnostics[instanceId]={
        instanceId,sourceId:part.id,name:part.name,type:"CAD",
        expectedUnits:partNestingUnits(part),unitIds:[],candidateUnitIds:[],bestCandidateUnitIds:[],finalUnitIds:[],
        staged:false,parsed:false,status:"imported",stage:"Импорт",issue:"Экземпляр создан.",candidateFrame:0
      };
    }
  });
  state.libraryParts.forEach(part=>{
    const shape=libraryPartShape(part);if(!shape)return;
    for(let copy=0;copy<normalizedQuantity(part);copy++){
      const instanceId="library-"+part.id+"#"+(copy+1);
      state.instanceDiagnostics[instanceId]={
        instanceId,sourceId:shape.id,name:shape.name,type:"Типовая",
        expectedUnits:1,unitIds:[],candidateUnitIds:[],bestCandidateUnitIds:[],finalUnitIds:[],
        staged:false,parsed:false,status:"imported",stage:"Импорт",issue:"Экземпляр создан.",candidateFrame:0
      };
    }
  });
  renderDiagnosticsPanel();
}
function markDiagnosticsStaged(svgText,scopeIds=null){
  const doc=new DOMParser().parseFromString(svgText,"image/svg+xml");
  const staged=new Set(Array.from(doc.querySelectorAll("[data-sheetnest-stage-instance]")).map(node=>node.getAttribute("data-sheetnest-stage-instance")).filter(Boolean));
  const scope=scopeIds?new Set(scopeIds):null;
  diagnosticEntries().forEach(entry=>{
    if(scope&&!scope.has(entry.instanceId))return;
    if(staged.has(entry.instanceId)){
      entry.staged=true;entry.status="staged";entry.stage="Staging";entry.issue="Экземпляр передан в SvgNest.";
    }else{
      entry.staged=false;entry.status="lost";entry.stage="Staging";entry.issue="Экземпляр не попал в подготовленный SVG.";
    }
  });
  renderDiagnosticsPanel();
}
function resetDiagnosticsForAttempt(scopeIds){
  const scope=scopeIds?new Set(scopeIds):null;
  diagnosticEntries().forEach(entry=>{
    if(scope&&!scope.has(entry.instanceId))return;
    // Не удаляем уже известные unitId: один и тот же instance может
    // проходить несколько NFP-попыток. История units должна сохраняться
    // до финального коммита, иначе уже найденная деталь снова становится
    // «неизвестной» для финальной диагностики и fallback.
    entry.parsed=entry.unitIds.length>=entry.expectedUnits;
    if(entry.parsed){
      entry.status="parsed";
      entry.stage="SvgNest.parse/getParts";
      entry.issue="Все ожидаемые nesting units распознаны.";
    }
  });
}

function registerParsedUnits(parsed,scopeIds=null){
  const elements=Array.from(parsed.querySelectorAll("[data-sheetnest-unit-id]"));
  const parsedByInstance={};
  const scope=scopeIds?new Set(scopeIds):null;

  diagnosticEntries().forEach(entry=>{
    if(scope&&!scope.has(entry.instanceId))return;
    // Сохраняем ранее распознанные units между повторными попытками.
    // Иначе retry очищает связь unitId -> instanceId и ломает финальный
    // учёт уже размещённых деталей.
    entry.parsed=entry.unitIds.length>=entry.expectedUnits;
  });

  elements.forEach(node=>{
    const unitId=node.getAttribute("data-sheetnest-unit-id");
    const instanceId=node.getAttribute("data-sheetnest-source-instance-id");
    if(!unitId||!instanceId)return;
    state.unitToInstance[unitId]=instanceId;
    const entry=state.instanceDiagnostics[instanceId];
    if(!entry)return;
    diagnosticAddUnique(entry.unitIds,unitId);
    if(!parsedByInstance[instanceId])parsedByInstance[instanceId]=new Set();
    parsedByInstance[instanceId].add(unitId);
  });

  diagnosticEntries().forEach(entry=>{
    if(scope&&!scope.has(entry.instanceId))return;
    const currentParsedCount=parsedByInstance[entry.instanceId]?.size||0;
    const parsedCount=Math.max(currentParsedCount,entry.unitIds.length);
    entry.parsed=parsedCount>=entry.expectedUnits;
    if(parsedCount===entry.expectedUnits){
      entry.status="parsed";entry.stage="SvgNest.parse/getParts";entry.issue="Все ожидаемые nesting units распознаны.";
    }else if(parsedCount>0){
      entry.status="lost";entry.stage="SvgNest.parse/getParts";entry.issue="Распознано "+parsedCount+" из "+entry.expectedUnits+" nesting units.";
    }else if(entry.status!=="lost"){
      entry.status="parser_error";entry.stage="SvgNest.parse/getParts";entry.issue="SvgNest не создал ни одного nesting unit.";
    }
  });
  renderDiagnosticsPanel();
}
function updateDiagnosticsFromCandidate(svgList,isBest,frame,validation,renderNow=true){
  const info=collectPlacedUnitIds(svgList);
  info.unitIds.forEach(unitId=>{
    const instanceId=state.unitToInstance[unitId],entry=state.instanceDiagnostics[instanceId];
    if(!entry)return;
    diagnosticAddUnique(entry.candidateUnitIds,unitId);
    if(isBest&&validation.valid)diagnosticAddUnique(entry.bestCandidateUnitIds,unitId);
    entry.candidateFrame=frame;
    if(entry.finalUnitIds.length<entry.expectedUnits){
      entry.status="candidate";
      entry.stage=isBest&&validation.valid?"Лучший найденный кандидат":"PlacementWorker / кандидат";
      entry.issue="Вариант содержит "+entry.candidateUnitIds.length+" из "+entry.expectedUnits+" units.";
    }
  });
  if(renderNow)renderDiagnosticsPanel();
}
function finalizeDiagnostics(svgList,reason="complete",usedUnitIds=null){
  // Финальная диагностика должна использовать тот же набор units, который
  // реально был принят коммитом раскладки. SVG здесь является только
  // визуальным представлением результата и не должен повторно определять
  // источник истины для финального состояния.
  const finalSet=usedUnitIds instanceof Set
    ? new Set(usedUnitIds)
    : new Set(usedUnitIds||[]);
  diagnosticEntries().forEach(entry=>{
    entry.finalUnitIds=entry.unitIds.filter(unitId=>finalSet.has(unitId));
    const finalCount=entry.finalUnitIds.length;
    if(finalCount>=entry.expectedUnits){
      entry.status="placed";entry.stage="Финальный результат";entry.issue="Размещены все "+entry.expectedUnits+" nesting unit.";
    }else if(!entry.staged){
      entry.status="lost";entry.stage="Staging";entry.issue="Экземпляр не дошёл до Nesting.";
    }else if(!entry.parsed||entry.unitIds.length<entry.expectedUnits){
      entry.status="lost";entry.stage="SvgNest.parse/getParts";entry.issue="Потерян при построении nesting units: "+entry.unitIds.length+"/"+entry.expectedUnits+".";
    }else if(entry.candidateUnitIds.length===0){
      entry.status="lost";
      entry.stage="NFP / PlacementWorker";
      entry.issue=reason==="no-valid-result"?"Экземпляр распознан, но валидный кандидат с ним не найден.":"Экземпляр распознан, но ни один кандидат не разместил его.";
    }else{
      entry.status="lost";
      entry.stage="Выбор финального результата";
      entry.issue=reason==="no-valid-result"?"Экземпляр встречался в кандидатах, но валидная финальная раскладка не была принята.":"Экземпляр встречался в кандидатах, но не вошёл в финальную раскладку.";
    }
  });
  renderDiagnosticsPanel(true);
}
function renderDiagnosticsPanel(finalState=false){
  const panel=$("diagnosticsPanel"),list=$("diagnosticsList"),summary=$("diagnosticsSummary");
  if(!panel||!list||!summary)return;
  const entries=diagnosticEntries();
  if(!entries.length){panel.hidden=true;return}
  panel.hidden=false;
  const placed=entries.filter(e=>e.status==="placed").length;
  const lost=entries.filter(e=>e.status==="lost"||e.status==="parser_error").length;
  const candidate=entries.filter(e=>e.status==="candidate").length;
  const totalUnits=entries.reduce((sum,e)=>sum+e.expectedUnits,0);
  const finalUnits=entries.reduce((sum,e)=>sum+e.finalUnitIds.length,0);
  summary.innerHTML="<span class='diagnostic-chip'><b>"+entries.length+"</b> instance</span><span class='diagnostic-chip ok'><b>"+placed+"</b> размещено</span><span class='diagnostic-chip bad'><b>"+lost+"</b> потеряно</span><span class='diagnostic-chip warn'><b>"+candidate+"</b> в кандидатах</span><span class='diagnostic-units'>Units: <b>"+finalUnits+"/"+totalUnits+"</b></span>";
  list.innerHTML="";
  entries.forEach(entry=>{
    const row=document.createElement("article");row.className="diagnostic-row "+diagnosticStatusClass(entry);
    const unitText=entry.unitIds.length?entry.unitIds.map(id=>"<code>"+escapeHtml(id)+"</code>").join(""):"<span class='diagnostic-muted'>unitId ещё не создан</span>";
    const candidateText=entry.candidateUnitIds.length+"/"+entry.expectedUnits,finalText=entry.finalUnitIds.length+"/"+entry.expectedUnits;
    row.innerHTML="<div class='diagnostic-state'><span></span><b>"+diagnosticStatusLabel(entry)+"</b></div><div class='diagnostic-main'><div class='diagnostic-title'><strong>"+escapeHtml(entry.instanceId)+"</strong><span>"+escapeHtml(entry.type)+" · "+escapeHtml(entry.name)+"</span></div><div class='diagnostic-stage'>Этап: <b>"+escapeHtml(diagnosticStageLabel(entry))+"</b></div><div class='diagnostic-meta'>parsed "+entry.unitIds.length+"/"+entry.expectedUnits+" · candidates "+candidateText+" · final "+finalText+"</div><div class='diagnostic-issue'>"+escapeHtml(entry.issue||"—")+"</div><div class='diagnostic-units'>"+unitText+"</div></div>";
    list.appendChild(row);
  });
  const toggle=$("diagnosticsToggle");if(toggle)toggle.textContent=panel.classList.contains("collapsed")?"Развернуть":"Свернуть";
  const statusLabel=$("diagnosticsStatus");if(statusLabel)statusLabel.textContent=finalState?"Итоговая проверка":"Живая трассировка";
  const jsonButton=$("diagnosticsExportJson"),csvButton=$("diagnosticsExportCsv");
  if(jsonButton)jsonButton.disabled=false;
  if(csvButton)csvButton.disabled=false;
}
function forceVisibleSheetBin(svg,isSearch){
  try{
    const bins=svg?.querySelectorAll("#sheet-bin,.bin")||[];
    bins.forEach(bin=>{
      bin.setAttribute("fill","#b8c1ca");
      bin.setAttribute("fill-opacity",isSearch?"0.92":"1");
      bin.setAttribute("stroke","#687481");
      bin.setAttribute("stroke-width","0.9");
      const style=bin.style;
      if(style){
        style.setProperty("fill","#b8c1ca","important");
        style.setProperty("fill-opacity",isSearch?"0.92":"1","important");
        style.setProperty("stroke","#687481","important");
        style.setProperty("stroke-width","0.9","important");
      }
    });
    svg?.setAttribute("preserveAspectRatio","xMidYMid meet");
  }catch(err){console.warn("SheetNest: forced sheet-bin styling skipped",err)}
}
function renderResults(svgList,efficiency,placed,total,sheet,view={mode:"final",frame:0,isBest:false}){
  const wrap=$("canvasWrap");wrap.innerHTML="";
  const meta={material:$("material").value,thickness:readNumber("thickness",3),sheetW:sheet.w,sheetH:sheet.h,margin:readNumber("margin",10),gap:readNumber("gap",2),efficiency:Number(efficiency||0),placed:Number(placed||0),total:Number(total||0),mode:view.mode,frame:view.frame,isBest:Boolean(view.isBest)};
  state.resultMeta=meta;
  wrap.classList.toggle("searching",view.mode==="search");
  svgList.forEach((svg,index)=>{
    const card=document.createElement("div");
    card.className="result-card"+(view.mode==="search"?" search-frame":" sheet-card-draggable");
    const title=document.createElement("div");title.className="result-title";
    const phase=view.mode==="search"?(view.isBest?"Новый лучший вариант":"Текущий кандидат"):"Итоговая раскладка";
    const resultSheetW=Number(svg.getAttribute("data-sheet-w"))||sheet.w;
    const resultSheetH=Number(svg.getAttribute("data-sheet-h"))||sheet.h;
    const resultMeta={...meta,sheetW:resultSheetW,sheetH:resultSheetH};
    title.innerHTML=`<strong>Лист ${index+1} · ${phase}</strong><span>${resultSheetW} × ${resultSheetH} мм · ${escapeHtml(meta.material)} · ${meta.thickness} мм</span>`;
    const clone=svg.cloneNode(true);clone.classList.add("sheet-svg");clone.removeAttribute("width");clone.removeAttribute("height");
    if(view.mode==="search")forceVisibleSheetBin(clone,true);
    decorateResultSvg(clone,resultMeta,index);
    if(view.mode==="search")forceVisibleSheetBin(clone,true);
    card.appendChild(title);card.appendChild(clone);
    const summary=document.createElement("div");summary.className="sheet-summary";summary.innerHTML=`<span>Поле: <strong>${meta.margin} мм</strong> · зазор: <strong>${meta.gap} мм</strong></span><span>Деталей: <strong>${placed||0}/${total||0}</strong></span>`;card.appendChild(summary);wrap.appendChild(card);
  });
  $("statSheets").textContent=svgList.length;$("statParts").textContent=placed||0;$("statEfficiency").textContent=`${Math.round((efficiency||0)*100)}%`;$("downloadButton").disabled=svgList.length===0||state.running;applyCanvasZoom();window.SheetNestDxf?.update?.();
}
function runLimitForOrder(orderSize,mode){
  const base=mode==="max"?300000:mode==="fast"?30000:120000;
  const extra=Number(orderSize||0)>120?(mode==="max"?60000:30000):Number(orderSize||0)>80?(mode==="max"?30000:15000):0;
  return base+extra;
}
function touchRunProgress(eventName="heartbeat",meta={}){
  state.runLastProgressAt=Date.now();
  state.runWatchdogLastEvent=String(eventName||"heartbeat");
  if(meta.instanceId)state.runWatchdogLastInstanceId=String(meta.instanceId);
  if(meta.unitId)state.runWatchdogLastUnitId=String(meta.unitId);
  if(Number.isFinite(Number(meta.sheet)))state.runWatchdogLastSheet=Number(meta.sheet);
  if(Number.isFinite(Number(meta.candidateChecks)))state.runWatchdogCandidateChecks=Number(meta.candidateChecks);
  if(Number.isFinite(Number(meta.nfpChecks)))state.runWatchdogNfpChecks=Number(meta.nfpChecks);
  if(Number.isFinite(Number(meta.nfpTimeouts)))state.runWatchdogNfpTimeouts=Number(meta.nfpTimeouts);
  if(Number.isFinite(Number(meta.feasibleCandidates)))state.runWatchdogFeasibleCandidates=Number(meta.feasibleCandidates);
  if(Number.isFinite(Number(meta.boundsRejects)))state.runWatchdogBoundsRejects=Number(meta.boundsRejects);
  if(Number.isFinite(Number(meta.collisionRejects)))state.runWatchdogCollisionRejects=Number(meta.collisionRejects);
  renderWatchdogPanel();
}
function setRunStage(stage,detail=""){state.runStage=stage;touchRunProgress("stage:"+stage);if(state.running){const remaining=Math.max(0,Math.ceil((state.runDeadline-Date.now())/1000));$("runInfo").textContent=detail?stage+" · "+detail+" · "+remaining+" с":stage+" · "+remaining+" с"}}
function stopRunWatchdog(){
  if(state.runWatchdogTimer){clearInterval(state.runWatchdogTimer);state.runWatchdogTimer=null}
  state.runWatchdogState="idle";
  renderWatchdogPanel();
}
function resetRunWatchdogTelemetry(){
  state.runWatchdogReason="";
  state.runWatchdogLastEvent="start";
  state.runWatchdogLastInstanceId="";
  state.runWatchdogLastUnitId="";
  state.runWatchdogLastSheet=0;
  state.runWatchdogCandidateChecks=0;
  state.runWatchdogNfpChecks=0;
  state.runWatchdogNfpTimeouts=0;
  state.runWatchdogFeasibleCandidates=0;
  state.runWatchdogBoundsRejects=0;
  state.runWatchdogCollisionRejects=0;
  state.runWatchdogStartedAt=Date.now();
  state.runWatchdogState="running";
}
function watchdogStateLabel(){
  if(state.runWatchdogReason==="global-timeout")return"TIMEOUT";
  if(state.runWatchdogReason==="stalled")return"STALLED";
  if(!state.running&&state.runWatchdogState==="completed")return"COMPLETED";
  if(!state.running)return"STOPPED";
  return "RUNNING";
}
function renderWatchdogPanel(){
  const panel=$("watchdogPanel");
  if(!panel)return;
  const now=Date.now();
  const left=Math.max(0,state.runDeadline-now);
  const stall=Math.max(0,now-state.runLastProgressAt);
  const stateEl=$("watchdogState"),stageEl=$("watchdogStage"),eventEl=$("watchdogEvent");
  const detailEl=$("watchdogDetail"),bar=$("watchdogBar");
  if(stateEl){
    stateEl.textContent=watchdogStateLabel();
    stateEl.dataset.state=watchdogStateLabel().toLowerCase();
  }
  if(stageEl)stageEl.textContent=state.runStage||"Готово";
  if(eventEl)eventEl.textContent=state.runWatchdogLastEvent||"—";
  if(detailEl)detailEl.innerHTML=
    "<span>Instance <b>"+escapeHtml(state.runWatchdogLastInstanceId||"—")+"</b></span>"+
    "<span>Unit <b>"+escapeHtml(state.runWatchdogLastUnitId||"—")+"</b></span>"+
    "<span>Лист <b>"+(state.runWatchdogLastSheet||"—")+"</b></span>"+
    "<span>Кадр <b>"+(state.searchFrames||0)+"</b></span>"+
    "<span>Сandidate <b>"+(state.runWatchdogCandidateChecks||0)+"</b></span>"+
    "<span>NFP <b>"+(state.runWatchdogNfpChecks||0)+"</b></span>"+
    "<span>Feasible <b>"+(state.runWatchdogFeasibleCandidates||0)+"</b></span>"+
    "<span>Timeout <b>"+(state.runWatchdogNfpTimeouts||0)+"</b></span>";
  if(bar){
    const total=Math.max(1,state.runDeadline-state.startedAt);
    bar.style.width=Math.round(Math.max(0,Math.min(100,(total-left)/total*100)))+"%";
  }
  const timer=$("watchdogTimer");
  if(timer)timer.textContent=state.running?Math.ceil(left/1000)+" с":"—";
  const stallEl=$("watchdogStall");
  if(stallEl)stallEl.textContent=Math.round(stall/1000)+" с";
}
function startRunWatchdog(runId,limitMs){
  stopRunWatchdog();
  state.runDeadline=Date.now()+Math.max(10000,Number(limitMs)||120000);
  state.runLastProgressAt=Date.now();
  resetRunWatchdogTelemetry();
  state.runWatchdogTimer=setInterval(()=>{
    if(!state.running||state.runId!==runId){
      if(!state.running&&state.runWatchdogState==="running")state.runWatchdogState="completed";
      stopRunWatchdog();return;
    }
    const now=Date.now(),left=state.runDeadline-now,stall=now-state.runLastProgressAt;
    if(left<=0){
      state.runWatchdogReason="global-timeout";
      state.runWatchdogState="timeout";
      state.running=false;
      state.runId+=1;
      try{SvgNest.stop()}catch(_){}
      $("progressBar").style.width="100%";
      $("runInfo").textContent="Остановлено watchdog: превышен общий лимит расчёта";
      status("Расчёт остановлен по таймауту");
      renderWatchdogPanel();
      stopRunWatchdog();
      return;
    }
    if(stall>state.runWatchdogStallMs&&state.runStage!=="Финализация"){
      state.runWatchdogState="stalled";
      state.runWatchdogReason="stalled";
      $("runInfo").textContent=state.runStage+" · heartbeat отсутствует "+Math.round(stall/1000)+" с · осталось "+Math.ceil(left/1000)+" с";
    }else if(state.runWatchdogState==="stalled"){
      state.runWatchdogState="running";state.runWatchdogReason="";
    }
    renderWatchdogPanel();
  },250);
}
function updateProgress(){
  if(!state.running)return;
  const elapsed=Date.now()-state.startedAt;
  const total=Math.max(1,state.durationMs);
  const p=Math.min(.98,elapsed/total);
  $("progressBar").style.width=(Math.round(p*100))+"%";
  const remaining=Math.max(0,Math.ceil((state.runDeadline-Date.now())/1000));
  $("runInfo").textContent=state.runStage+" · кадр "+state.searchFrames+" · осталось "+remaining+" с";
}


function startOneRun(sheet,runDurationMs,runId,workInstances=null,runtimeConfig=null){
  const activeInstances=Array.isArray(workInstances)&&workInstances.length?workInstances:buildNestingInstances();
  const perf=runtimeConfig||adaptiveNestingConfig(activeInstances.length);
  setRunStage("NFP","подготовка попытки "+(state.engineAttemptId+1));
  const attemptId=++state.engineAttemptId;
  resetEngine(perf);
  const expectedTotal=nestingUnitCount(activeInstances);
  const scopeIds=activeInstances.map(item=>item.instanceId);
  resetDiagnosticsForAttempt(scopeIds);
  const nestingSvg=buildNestingSvgForInstances(sheet.w,sheet.h,activeInstances);
  markDiagnosticsStaged(nestingSvg,scopeIds);

  if(activeInstances.length===1&&expectedTotal===1){
    const direct=buildDirectSingleSheetCandidate(activeInstances[0],sheet,runId);
    if(direct){
      renderResults(direct.results,direct.efficiency,direct.placed,direct.total,sheet,{mode:"search",frame:direct.frame,isBest:true});
      state.lastValidation=direct.validation;
      return Promise.resolve(direct);
    }
  }

  const parsed=SvgNest.parsesvg(nestingSvg);
  registerParsedUnits(parsed,scopeIds);
  const parsedUnits=parsed.querySelectorAll("[data-sheetnest-unit-id]").length;
  if(expectedTotal>0&&parsedUnits===0){
    const error=new Error("SvgNest не распознал ни одной детали в подготовленном SVG.");
    return Promise.resolve({results:[],placed:0,total:expectedTotal,error});
  }
  const bin=parsed.querySelector("#sheet-bin");
  if(!bin)throw new Error("Не удалось создать металлический лист.");
  SvgNest.setbin(bin);
  let runBest=null,attemptError=null;
  return new Promise(resolve=>{
    let settled=false,timer=null,interval=null;
    const settle=(reason)=>{
      if(settled)return;
      settled=true;
      if(timer)clearTimeout(timer);
      if(interval)clearInterval(interval);
      try{SvgNest.stop()}catch(_){}
      resolve(runBest?{...runBest,error:attemptError,reason}:{results:[],placed:0,total:expectedTotal,error:attemptError,reason});
    };
    const updateTimer=()=>{
      if(!state.running||runId!==state.runId||attemptId!==state.engineAttemptId){settle("stale");return;}
      updateProgress();
    };
    timer=setTimeout(()=>{
      activeInstances.forEach(instance=>{
        const entry=state.instanceDiagnostics?.[instance.instanceId];
        if(entry&&!entry.finalUnitIds.length){
          entry.status="candidate";
          entry.stage="NFP / timeout";
          entry.issue="Попытка остановлена по времени до получения нового валидного кандидата.";
        }
      });
      if(!perf.benchmark)renderDiagnosticsPanel();
      settle("timeout");
    },Math.max(1800,Number(runDurationMs)||1800));
    interval=setInterval(updateTimer,120);
    try{
      const started=SvgNest.start(
        progress=>{
          if(state.running&&runId===state.runId&&attemptId===state.engineAttemptId){
            $("progressBar").style.width=Math.max(2,Math.round((progress||0)*100))+"%";
          }
        },
        (svglist,efficiency,placed,total,isBest=false,frame=0,searchTelemetry={})=>{
          if(!state.running||runId!==state.runId||attemptId!==state.engineAttemptId)return;
          if(!svglist||!svglist.length)return;
          state.searchFrames++;
          const validation=validateNestingResult(svglist,placed,expectedTotal);
          state.lastValidation=validation;
          const shownPlaced=validation.unique;
          const now=Date.now();
          touchRunProgress();
          const renderSearch=!perf.benchmark&&(now-state.lastSearchRenderAt>=450||isBest);
          const renderDiagnostics=!perf.benchmark&&(!activeInstances.length||now-state.lastDiagnosticsRenderAt>=650||isBest);
          if(renderDiagnostics){
            updateDiagnosticsFromCandidate(svglist,isBest,frame,validation,true);
            state.lastDiagnosticsRenderAt=now;
          }else{
            updateDiagnosticsFromCandidate(svglist,isBest,frame,validation,false);
          }
          const taggedResults=(svglist||[]).map(svg=>{
            try{svg.setAttribute("data-sheet-w",String(sheet.w));svg.setAttribute("data-sheet-h",String(sheet.h))}catch(_){}
            return svg;
          });
          const candidate={
            results:taggedResults,
            efficiency:Number(efficiency||0),
            placed:shownPlaced,
            total:expectedTotal,
            sheet:{w:sheet.w,h:sheet.h},
            frame,
            validation
          };
          if(validation.valid&&(!runBest||betterNestingCandidate(candidate,runBest)))runBest=candidate;
          state.resultSvgs=svglist;
          if(renderSearch){
            state.lastSearchRenderAt=now;
            renderResults(svglist,efficiency,shownPlaced,expectedTotal,sheet,{mode:"search",frame,isBest});
          }
          const tag=!validation.valid?"Непроверенный кандидат":(isBest?"Новый лучший":"Кандидат");
          $("runInfo").textContent=tag+" · кадр "+state.searchFrames+" · "+shownPlaced+"/"+expectedTotal+" деталей · "+Math.round((efficiency||0)*100)+"% заполнение";
          $("status").textContent=validation.valid?"Ищем раскладку…":"Проверяем геометрию результата…";
        },
        err=>{
          attemptError=err instanceof Error?err:new Error(String(err||"Ошибка NFP worker"));
          activeInstances.forEach(instance=>{
            const entry=state.instanceDiagnostics?.[instance.instanceId];
            if(!entry)return;
            entry.status=entry.status==="placed"?"placed":"candidate";
            entry.stage="NFP / worker";
            entry.issue="Ошибка расчёта: "+attemptError.message;
          });
          if(!perf.benchmark)renderDiagnosticsPanel();
          settle("engine-error");
        }
      );
      if(started===false)settle("engine-refused");
    }catch(err){
      attemptError=err;
      settle("engine-throw");
    }
  });
}

function resultUnitIds(svg){
  const ids=new Set();
  if(!svg)return ids;
  svg.querySelectorAll("g[data-sheetnest-unit-id]").forEach(group=>{
    const id=group.getAttribute("data-sheetnest-unit-id");
    if(id)ids.add(id);
  });
  return ids;
}

function resultInstanceIds(svg){
  const ids=new Set();
  if(!svg)return ids;
  svg.querySelectorAll("g[data-sheetnest-unit-id]").forEach(group=>{
    const unitId=group.getAttribute("data-sheetnest-unit-id");
    const instanceId=group.getAttribute("data-sheetnest-source-instance-id")||state.unitToInstance[unitId];
    if(instanceId)ids.add(instanceId);
  });
  return ids;
}

function instanceIsFullyPlaced(instance,usedUnitIds){
  const entry=state.instanceDiagnostics?.[instance.instanceId];
  if(!entry)return false;
  const expected=Math.max(1,Number(entry.expectedUnits||0));
  const known=Array.isArray(entry.unitIds)?entry.unitIds:[];
  if(known.length<expected)return false;
  let placed=0;
  known.forEach(id=>{if(usedUnitIds.has(id))placed++});
  return placed>=expected;
}

function sanitizeResultSheets(svgList,usedUnitIds){
  const accepted=[];
  const reserved=usedUnitIds||new Set();
  for(const svg of svgList||[]){
    const clone=svg.cloneNode(true);
    let kept=0;
    clone.querySelectorAll("g[data-sheetnest-unit-id]").forEach(group=>{
      const unitId=group.getAttribute("data-sheetnest-unit-id");
      if(!unitId||reserved.has(unitId)){
        group.remove();
        return;
      }
      reserved.add(unitId);
      kept++;
    });
    if(kept>0)accepted.push(clone);
  }
  return accepted;
}

function instancePackingScore(instance){
  try{
    if(instance.kind==="custom"){
      const b=estimateSvgBounds(instance.part.svgText);
      return Math.max(1,b.width*b.height);
    }
    const s=instance.shape;
    return s?Math.max(1,s.w*s.h):1;
  }catch(_){return 1}
}

function selectNestingBatch(instances,size,mode="large",skipIds=null){
  const skip=skipIds||new Set();
  const list=(instances||[]).filter(item=>item&&!skip.has(item.instanceId)).slice();
  const limit=Math.max(1,size);

  if(mode==="mixed"){
    // В каждом пакете должны присутствовать и крупные, и мелкие детали.
    // Иначе большой заказ разбивается на «лист крупных» и затем отдельные
    // листы мелких деталей, хотя мелкие детали могли бы заполнить остаток.
    const byLarge=list.slice().sort((a,b)=>{
      const d=instancePackingScore(b)-instancePackingScore(a);
      return d||(String(a.instanceId).localeCompare(String(b.instanceId)));
    });
    const bySmall=list.slice().sort((a,b)=>{
      const d=instancePackingScore(a)-instancePackingScore(b);
      return d||(String(a.instanceId).localeCompare(String(b.instanceId)));
    });
    const largeCount=Math.max(1,Math.ceil(limit*0.6));
    const smallCount=Math.max(1,limit-largeCount);
    const chosen=[];
    const seen=new Set();
    const take=arr=>arr.slice(0,limit).forEach(item=>{
      if(chosen.length>=limit||seen.has(item.instanceId))return;
      chosen.push(item);seen.add(item.instanceId);
    });
    take(byLarge.slice(0,largeCount));
    take(bySmall.slice(0,smallCount));
    if(chosen.length<limit)take(byLarge);
    return chosen;
  }

  list.sort((a,b)=>{
    const sa=instancePackingScore(a),sb=instancePackingScore(b);
    if(mode==="small")return sa-sb;
    return (sb-sa)||(String(a.instanceId).localeCompare(String(b.instanceId)));
  });
  return list.slice(0,limit);
}

function uniqueInstances(list){
  const map=new Map();
  (list||[]).forEach(item=>{if(item&&item.instanceId&&!map.has(item.instanceId))map.set(item.instanceId,item)});
  return [...map.values()];
}

async function runPoolAcrossOrientations(instances,orientations,runId,runDurationMs,runtimeConfig=null){
  let best=null;
  const pool=uniqueInstances(instances);
  const perf=runtimeConfig||adaptiveNestingConfig(pool.length);
  for(let oi=0;oi<orientations.length;oi++){
    if(!state.running||runId!==state.runId)break;
    if(oi>0&&best){
      const bestRatio=Number(best.placed||0)/Math.max(1,Number(best.total||0));
      // Для больших заказов вторую ориентацию запускаем только если первая
      // действительно не дала достаточно полного результата.
      if(pool.length>28&&bestRatio>=perf.secondOrientationThreshold)break;
    }
    const candidate=orientations[oi];
    const runBest=await startOneRun(candidate,runDurationMs,runId,pool,perf);
    if(runBest){
      const current={
        results:runBest.results,
        efficiency:Number(runBest.efficiency||0),
        placed:Number(runBest.placed||0),
        total:nestingUnitCount(pool),
        sheet:{w:candidate.w,h:candidate.h},
        frame:runBest.frame,
        validation:runBest.validation
      };
      if(betterNestingCandidate(current,best))best=current;
    }
  }
  return best;
}

function appendFreshResultSheets(target,svgList,usedUnitIds,sheet){
  const localUsed=usedUnitIds||new Set();
  const accepted=sanitizeResultSheets(svgList,localUsed);
  accepted.forEach(svg=>{
    if(sheet){
      svg.setAttribute("data-sheet-w",String(sheet.w));
      svg.setAttribute("data-sheet-h",String(sheet.h));
    }
    target.push(svg);
  });
  return accepted;
}

async function refillCommittedSheets(committedSheets,remaining,usedUnitIds,allInstances,orientations,runId,runDurationMs,runtimeConfig=null,refillOptions=null){
  let changedAny=false;
  const perf=runtimeConfig||adaptiveNestingConfig(allInstances.length);
  const options=refillOptions||{};
  const maxPasses=Math.max(1,Number(options.maxPasses||perf.refillPasses));
  const candidateLimit=Math.max(1,Number(options.candidateLimit||perf.refillCandidates));
  const focusIndexes=Array.isArray(options.focusIndexes)?new Set(options.focusIndexes):null;
  const sheetOrder=committedSheets.map((svg,index)=>({svg,index,count:resultUnitIds(svg).size}))
    .filter(item=>!focusIndexes||focusIndexes.has(item.index))
    .sort((a,b)=>a.count-b.count)
    .slice(0,Math.max(1,Number(options.maxSheets||perf.refillSheets)));

  for(let pass=0;pass<maxPasses&&state.running;pass++){
    let changedThisPass=false;
    for(const sheetRef of sheetOrder){
      if(!state.running)break;
      const sheetIndex=sheetRef.index;
      const currentSheet=committedSheets[sheetIndex];
      const incumbentUnitIds=resultUnitIds(currentSheet);
      if(incumbentUnitIds.size===0||incumbentUnitIds.size>96)continue;

      const incumbentInstanceIds=resultInstanceIds(currentSheet);
      const incumbentInstances=(allInstances||[]).filter(item=>incumbentInstanceIds.has(item.instanceId));
      if(!incumbentInstances.length)continue;

      const orderedRemaining=selectNestingBatch(remaining,candidateLimit,"mixed");
      if(!orderedRemaining.length)break;

      const pool=uniqueInstances(incumbentInstances.concat(orderedRemaining));
      const candidate=await runPoolAcrossOrientations(
        pool,
        orientations,
        runId,
        Math.max(2800,Math.min(runDurationMs,perf.mode==="max"?5000:3500)),
        perf
      );
      if(!candidate||!candidate.results?.length)continue;

      let replacement=null;
      let bestAdded=-1;

      for(const candidateSheet of candidate.results){
        const candidateUnits=resultUnitIds(candidateSheet);
        let keepsAll=true;
        incumbentUnitIds.forEach(id=>{if(!candidateUnits.has(id))keepsAll=false});
        if(!keepsAll)continue;

        const newUnits=[...candidateUnits].filter(id=>!usedUnitIds.has(id));
        if(newUnits.length<=0)continue;

        const baseUsed=new Set(usedUnitIds);
        incumbentUnitIds.forEach(id=>baseUsed.delete(id));
        const cleaned=sanitizeResultSheets([candidateSheet],baseUsed);
        if(!cleaned.length)continue;

        const cleanedUnits=resultUnitIds(cleaned[0]);
        let preserves=true;
        incumbentUnitIds.forEach(id=>{if(!cleanedUnits.has(id))preserves=false});
        if(!preserves)continue;

        if(newUnits.length>bestAdded){
          bestAdded=newUnits.length;
          replacement=cleaned[0];
        }
      }

      if(replacement){
        replacement.setAttribute("data-sheet-w",String(candidate.sheet.w));
        replacement.setAttribute("data-sheet-h",String(candidate.sheet.h));
        committedSheets[sheetIndex]=replacement;
        resultUnitIds(replacement).forEach(id=>usedUnitIds.add(id));
        changedThisPass=true;
        changedAny=true;
        remaining=remaining.filter(item=>!instanceIsFullyPlaced(item,usedUnitIds));
        $("runInfo").textContent="Дозаполнение листа "+(sheetIndex+1)+" · добавлено "+bestAdded+" деталей";
        await new Promise(resolve=>setTimeout(resolve,0));
      }
    }

    if(!changedThisPass)break;
  }

  return {remaining,changed:changedAny};
}

function globalNestingObjective(committedSheets,usedUnitIds,sheet){
  const sheets=Array.isArray(committedSheets)?committedSheets.length:Infinity;
  const margin=Math.max(0,readNumber("margin",10));
  const sheetArea=Math.max(1,(sheet.w-2*margin)*(sheet.h-2*margin));
  let usedArea=0;
  (committedSheets||[]).forEach(svg=>{
    const units=resultUnitIds(svg);
    units.forEach(unitId=>{
      const instanceId=state.unitToInstance[unitId];
      const instance=(state.nestingManifest||[]).find(item=>item.id===instanceId);
      if(instance)usedArea+=Number(instance.area||0);
    });
  });
  const utilization=Math.max(0,Math.min(1,usedArea/(Math.max(1,sheets)*sheetArea)));
  return {sheets,utilization,wasteRatio:1-utilization};
}


function estimateInstanceAreaForPool(instance){
  const units=instance?.kind==="custom"?partNestingUnits(instance.part):1;
  return instancePackingScore(instance)/Math.max(1,units);
}
function estimateProgressivePoolSize(remaining,sheet,perf){
  const count=Array.isArray(remaining)?remaining.length:0;
  const cap=Math.max(6,Math.min(Number(perf.poolMax||18),count||6));
  // NFP complexity grows approximately quadratically with the number of parts.
  // Never build a huge first pool just because the sheet has lots of free area.
  if(count<=cap)return count;
  const base=perf.local?12:16;
  return Math.max(6,Math.min(cap,base));
}
function interleaveNestingBatch(instances,size,reverse=false){
  const list=(instances||[]).slice();
  list.sort((a,b)=>{
    const d=instancePackingScore(b)-instancePackingScore(a);
    return d||(String(a.instanceId).localeCompare(String(b.instanceId)));
  });
  const out=[],seen=new Set();
  let lo=list.length-1,hi=0;
  while(out.length<Math.min(size,list.length)&&hi<=lo){
    const source=reverse?(out.length%2===0?list.slice().sort((a,b)=>instancePackingScore(a)-instancePackingScore(b)):list):list;
    if(reverse&&out.length%2===0){
      for(let i=0;i<source.length&&out.length<size;i++){
        const item=source[i];
        if(!seen.has(item.instanceId)){seen.add(item.instanceId);out.push(item);break;}
      }
    }else{
      const item=list[hi++];
      if(item&&!seen.has(item.instanceId)){seen.add(item.instanceId);out.push(item);}
    }
    if(out.length<size&&hi<=lo){
      const item=list[lo--];
      if(item&&!seen.has(item.instanceId)){seen.add(item.instanceId);out.push(item);}
    }
  }
  return out.slice(0,size);
}
function buildProgressiveCandidatePools(remaining,size,variants){
  const list=uniqueInstances(remaining);
  const pools=[],keys=new Set();
  const push=(pool)=>{
    const clean=uniqueInstances(pool).slice(0,size);
    const key=clean.map(x=>x.instanceId).sort().join("|");
    if(clean.length&&!keys.has(key)){keys.add(key);pools.push(clean);}
  };
  push(selectNestingBatch(list,size,"large"));
  if(variants>=2)push(selectNestingBatch(list,size,"small"));
  if(variants>=2)push(selectNestingBatch(list,size,"mixed"));
  if(variants>=3)push(interleaveNestingBatch(list,size,false));
  if(variants>=4){
    const random=list.slice();
    for(let i=random.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      const t=random[i];random[i]=random[j];random[j]=t;
    }
    push(random);
  }
  return pools;
}
function evaluateNestingSheet(svg,usedUnitIds,allInstances,sheet){
  if(!svg)return null;
  const unitIds=[...resultUnitIds(svg)];
  const newUnitIds=unitIds.filter(id=>!usedUnitIds.has(id));
  if(!newUnitIds.length)return null;
  const byId=new Map((allInstances||[]).map(item=>[item.instanceId,item]));
  let estimatedArea=0;
  const touchedInstances=new Set();
  newUnitIds.forEach(unitId=>{
    const instanceId=state.unitToInstance[unitId];
    const instance=byId.get(instanceId);
    if(!instance)return;
    const expected=instance?.kind==="custom"?partNestingUnits(instance.part):1;
    estimatedArea+=estimateInstanceAreaForPool(instance);
    touchedInstances.add(instanceId+"#"+expected);
  });
  const margin=Math.max(0,readNumber("margin",10));
  const sheetArea=Math.max(1,(sheet.w-2*margin)*(sheet.h-2*margin));
  const fill=Math.min(1,estimatedArea/sheetArea);
  const newCount=newUnitIds.length;
  const instanceBonus=Math.log1p(Math.max(0,touchedInstances.size))*0.5;
  // Фактическое число новых units должно доминировать над оценкой площади.
  // Иначе большой элемент мог «выиграть» у множества мелких деталей.
  const score=newCount*10000+fill*100+instanceBonus;
  return {svg,newUnitIds,newCount,fill,estimatedArea,score};
}
function chooseBestNestingSheet(results,usedUnitIds,allInstances,sheet){
  let best=null;
  (results||[]).forEach(svg=>{
    const candidate=evaluateNestingSheet(svg,usedUnitIds,allInstances,sheet);
    if(!candidate)return;
    if(!best||candidate.score>best.score||
      (Math.abs(candidate.score-best.score)<0.0001&&candidate.newCount>best.newCount)||
      (Math.abs(candidate.score-best.score)<0.0001&&candidate.newCount===best.newCount&&candidate.fill>best.fill)){
      best=candidate;
    }
  });
  return best;
}
function rotatedBoundsForAngle(width,height,degrees){
  const a=Math.abs(Number(degrees||0))*Math.PI/180;
  const c=Math.abs(Math.cos(a)),sn=Math.abs(Math.sin(a));
  return {width:width*c+height*sn,height:width*sn+height*c};
}
function instanceSheetFit(instance,orientation){
  try{
    const margin=Math.max(0,readNumber("margin",10));
    const usableW=Math.max(0,orientation.w-2*margin);
    const usableH=Math.max(0,orientation.h-2*margin);
    let bounds;
    if(instance.kind==="custom")bounds=estimateSvgBounds(instance.part.svgText);
    else bounds={width:instance.shape?.w||0,height:instance.shape?.h||0};
    const rotationCount=Math.max(1,Math.floor(readNumber("rotations",2)));
    const angles=[];
    if(rotationCount<=1)angles.push(0);
    else{
      for(let i=0;i<rotationCount;i++)angles.push(i*(360/rotationCount));
    }
    const fits=angles.some(angle=>{
      const b=rotatedBoundsForAngle(bounds.width,bounds.height,angle);
      return b.width+readNumber("gap",2)<=usableW+1e-6 && b.height+readNumber("gap",2)<=usableH+1e-6;
    });
    return {fits,usableW,usableH,width:bounds.width,height:bounds.height};
  }catch(_){return {fits:true,usableW:0,usableH:0,width:0,height:0}}
}
function preflightNestingInstances(instances,orientations){
  const fit=[],blocked=[];
  (instances||[]).forEach(instance=>{
    const checked=(orientations||[]).map(orientation=>({orientation,...instanceSheetFit(instance,orientation)}));
    if(checked.some(item=>item.fits)){
      fit.push(instance);
      return;
    }
    blocked.push({instance,checked});
    const entry=state.instanceDiagnostics?.[instance.instanceId];
    if(entry){
      const sizes=checked.map(item=>Math.round(item.width)+"×"+Math.round(item.height)).join(" / ");
      const sheets=checked.map(item=>Math.round(item.usableW)+"×"+Math.round(item.usableH)).join(" / ");
      entry.status="lost";
      entry.stage="Предварительная проверка";
      entry.issue="Габариты детали "+sizes+" мм превышают доступное поле листа "+sheets+" мм с учётом поля/зазора.";
    }
  });
  return {fit,blocked};
}
function buildDirectSingleSheetCandidate(instance,sheet,runId){
  if(!instance||!state.running||runId!==state.runId||nestingUnitCount([instance])!==1)return null;
  try{
    const margin=Math.max(0,readNumber("margin",10));
    const usableW=Math.max(1,sheet.w-2*margin);
    const usableH=Math.max(1,sheet.h-2*margin);
    const source=instance.kind==="custom"?instance.part.svgText:null;
    const bounds=instance.kind==="custom"?estimateSvgBounds(source):{minX:0,minY:0,width:Number(instance.shape?.w)||1,height:Number(instance.shape?.h)||1};
    const rotations=Math.max(1,Math.floor(readNumber("rotations",2)));
    const angles=rotations===1?[0]:Array.from({length:rotations},(_,i)=>i*(360/rotations));
    let fit=null;
    for(const angle of angles){
      const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
      const pts=[[bounds.minX,bounds.minY],[bounds.minX+bounds.width,bounds.minY],[bounds.minX,bounds.minY+bounds.height],[bounds.minX+bounds.width,bounds.minY+bounds.height]]
        .map(([x,y])=>({x:x*c-y*s,y:x*s+y*c}));
      const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
      const minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
      if(maxX-minX+readNumber("gap",2)<=usableW+1e-6&&maxY-minY+readNumber("gap",2)<=usableH+1e-6){
        fit={angle,minX,minY};break;
      }
    }
    if(!fit)return null;
    const ns="http://www.w3.org/2000/svg";
    const svg=document.createElementNS(ns,"svg");
    svg.setAttribute("xmlns",ns);svg.setAttribute("viewBox","0 0 "+sheet.w+" "+sheet.h);
    svg.setAttribute("width",String(sheet.w));svg.setAttribute("height",String(sheet.h));svg.setAttribute("preserveAspectRatio","xMidYMid meet");
    const bin=document.createElementNS(ns,"rect");
    bin.setAttribute("id","sheet-bin");bin.setAttribute("x","0");bin.setAttribute("y","0");
    bin.setAttribute("width",String(sheet.w));bin.setAttribute("height",String(sheet.h));
    bin.setAttribute("fill","#b8c1ca");bin.setAttribute("fill-opacity","0.92");bin.setAttribute("stroke","#687481");bin.setAttribute("stroke-width","0.9");
    svg.appendChild(bin);
    const group=document.createElementNS(ns,"g");
    const unitId=instance.instanceId+":unit-1";
    group.setAttribute("data-sheetnest-unit-id",unitId);
    group.setAttribute("data-sheetnest-source-instance-id",instance.instanceId);
    group.setAttribute("transform","translate("+(margin-fit.minX)+" "+(margin-fit.minY)+") rotate("+fit.angle+")");
    if(instance.kind==="custom"){
      const doc=new DOMParser().parseFromString(source,"image/svg+xml");
      const root=doc.documentElement;
      Array.from(root?.children||[]).filter(node=>!["defs","style","title","desc","metadata","script"].includes(String(node.tagName||"").toLowerCase()))
        .forEach(node=>{const clone=node.cloneNode(true);stampNestingSource(clone,instance.instanceId,instance.part.id);group.appendChild(clone)});
    }else{
      const path=document.createElementNS(ns,"path");
      path.setAttribute("d",shapePath(instance.shape));path.setAttribute("fill","#aeb8c2");path.setAttribute("fill-opacity","0.72");
      path.setAttribute("stroke","#313a44");path.setAttribute("stroke-width",".9");stampNestingSource(path,instance.instanceId,instance.shape.id);group.appendChild(path);
    }
    svg.appendChild(group);
    svg.setAttribute("data-sheet-w",String(sheet.w));svg.setAttribute("data-sheet-h",String(sheet.h));
    const entry=state.instanceDiagnostics?.[instance.instanceId];
    if(entry){
      (entry.unitIds||[]).forEach(id=>{if(state.unitToInstance[id]===instance.instanceId)delete state.unitToInstance[id]});
      diagnosticAddUnique(entry.unitIds,unitId);
      entry.parsed=true;entry.staged=true;entry.status="parsed";entry.stage="Прямое размещение";entry.issue="Размещено аварийным геометрическим fallback без NFP.";
      state.unitToInstance[unitId]=instance.instanceId;
    }
    const validation=validateNestingResult([svg],1,1);
    if(!validation.valid)return null;
    state.searchFrames++;
    updateDiagnosticsFromCandidate([svg],true,state.searchFrames,validation,true);
    return {results:[svg],efficiency:Math.min(1,estimateInstanceAreaForPool(instance)/Math.max(1,usableW*usableH)),placed:1,total:1,sheet,frame:state.searchFrames,validation};
  }catch(err){
    console.warn("SheetNest single-part direct fallback:",err);
    return null;
  }
}


function buildBoundingBoxFallbackCandidate(instances,sheet,runId){
  if(!Array.isArray(instances)||instances.length<2||!state.running||runId!==state.runId)return null;
  try{
    const margin=Math.max(0,readNumber("margin",10));
    const gap=Math.max(0,readNumber("gap",2));
    const usableW=Math.max(1,sheet.w-2*margin);
    const usableH=Math.max(1,sheet.h-2*margin);
    const rotationCount=Math.max(1,Math.floor(readNumber("rotations",2)));
    const angles=rotationCount>=4?[0,90,180,270]:rotationCount>=2?[0,180]:[0];

    const items=uniqueInstances(instances).map(instance=>{
      if(nestingUnitCount([instance])!==1)return null;
      const source=instance.kind==="custom"?instance.part.svgText:null;
      const bounds=instance.kind==="custom"
        ?estimateSvgBounds(source)
        :{minX:0,minY:0,width:Number(instance.shape?.w)||1,height:Number(instance.shape?.h)||1};
      const fits=[];
      for(const angle of angles){
        const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
        const pts=[
          [bounds.minX,bounds.minY],
          [bounds.minX+bounds.width,bounds.minY],
          [bounds.minX,bounds.minY+bounds.height],
          [bounds.minX+bounds.width,bounds.minY+bounds.height]
        ].map(([x,y])=>({x:x*c-y*s,y:x*s+y*c}));
        const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x));
        const minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y));
        fits.push({angle,minX,minY,width:maxX-minX,height:maxY-minY});
      }
      const valid=fits.filter(f=>f.width+gap<=usableW+1e-6&&f.height+gap<=usableH+1e-6);
      if(!valid.length)return null;
      return {instance,bounds,source,variants:valid};
    }).filter(Boolean);

    if(items.length<2)return null;

    // Безопасная fallback-компоновка: размещаем детали по полкам,
    // используя габаритные прямоугольники. Она не заменяет NFP, а
    // включается только как rescue, когда NFP фактически кладёт по одной детали.
    items.sort((a,b)=>{
      const aa=a.bounds.width*a.bounds.height,bb=b.bounds.width*b.bounds.height;
      return (bb-aa)||String(a.instance.instanceId).localeCompare(String(b.instance.instanceId));
    });

    const placed=[];
    let x=margin,y=margin,rowH=0;
    for(const item of items){
      const choices=item.variants
        .filter(v=>x+v.width<=sheet.w-margin+1e-6&&y+v.height<=sheet.h-margin+1e-6)
        .sort((a,b)=>(a.height-b.height)||(a.width-b.width));
      let fit=choices[0]||null;

      if(!fit){
        const nextY=y+rowH+gap;
        if(rowH<=0||nextY+item.variants[0].height>sheet.h-margin+1e-6)continue;
        y=nextY;x=margin;rowH=0;
        fit=item.variants
          .filter(v=>x+v.width<=sheet.w-margin+1e-6&&y+v.height<=sheet.h-margin+1e-6)
          .sort((a,b)=>(a.height-b.height)||(a.width-b.width))[0]||null;
      }
      if(!fit)continue;

      placed.push({...item,x,y,fit});
      x+=fit.width+gap;
      rowH=Math.max(rowH,fit.height);
    }

    if(placed.length<2)return null;

    const ns="http://www.w3.org/2000/svg";
    const svg=document.createElementNS(ns,"svg");
    svg.setAttribute("xmlns",ns);
    svg.setAttribute("viewBox","0 0 "+sheet.w+" "+sheet.h);
    svg.setAttribute("width",String(sheet.w));
    svg.setAttribute("height",String(sheet.h));
    svg.setAttribute("preserveAspectRatio","xMidYMid meet");

    const bin=document.createElementNS(ns,"rect");
    bin.setAttribute("id","sheet-bin");
    bin.setAttribute("x","0");bin.setAttribute("y","0");
    bin.setAttribute("width",String(sheet.w));bin.setAttribute("height",String(sheet.h));
    bin.setAttribute("fill","#b8c1ca");bin.setAttribute("fill-opacity","0.92");
    bin.setAttribute("stroke","#687481");bin.setAttribute("stroke-width","0.9");
    svg.appendChild(bin);

    for(const item of placed){
      const group=document.createElementNS(ns,"g");
      const unitId=item.instance.instanceId+":unit-1";
      group.setAttribute("data-sheetnest-unit-id",unitId);
      group.setAttribute("data-sheetnest-source-instance-id",item.instance.instanceId);
      group.setAttribute(
        "transform",
        "translate("+(item.x-item.fit.minX)+" "+(item.y-item.fit.minY)+") rotate("+item.fit.angle+")"
      );

      if(item.instance.kind==="custom"){
        const doc=new DOMParser().parseFromString(item.source,"image/svg+xml");
        const root=doc.documentElement;
        Array.from(root?.children||[])
          .filter(node=>!["defs","style","title","desc","metadata","script"].includes(String(node.tagName||"").toLowerCase()))
          .forEach(node=>{
            const clone=node.cloneNode(true);
            stampNestingSource(clone,item.instance.instanceId,item.instance.part.id);
            group.appendChild(clone);
          });
      }else{
        const path=document.createElementNS(ns,"path");
        path.setAttribute("d",shapePath(item.instance.shape));
        path.setAttribute("fill","#aeb8c2");
        path.setAttribute("fill-opacity","0.72");
        path.setAttribute("stroke","#313a44");
        path.setAttribute("stroke-width",".9");
        stampNestingSource(path,item.instance.instanceId,item.instance.shape.id);
        group.appendChild(path);
      }

      svg.appendChild(group);

      const entry=state.instanceDiagnostics?.[item.instance.instanceId];
      if(entry){
        diagnosticAddUnique(entry.unitIds,unitId);
        entry.parsed=true;
        entry.staged=true;
        state.unitToInstance[unitId]=item.instance.instanceId;
      }
    }

    svg.setAttribute("data-sheet-w",String(sheet.w));
    svg.setAttribute("data-sheet-h",String(sheet.h));

    const validation=validateNestingResult([svg],placed.length,placed.length);
    if(!validation.valid)return null;
    state.searchFrames++;
    updateDiagnosticsFromCandidate([svg],true,state.searchFrames,validation,true);

    return {
      results:[svg],
      efficiency:Math.min(1,(placed.reduce((sum,item)=>sum+item.bounds.width*item.bounds.height,0))/Math.max(1,usableW*usableH)),
      placed:placed.length,
      total:items.length,
      sheet,
      frame:state.searchFrames,
      validation,
      fallback:true
    };
  }catch(err){
    console.warn("SheetNest bounding-box fallback:",err);
    return null;
  }
}

async function searchBestNextSheet(remaining,allInstances,orientations,runId,perf,usedUnitIds){
  if(Array.isArray(remaining)&&remaining.length===1){
    for(const orientation of orientations||[]){
      const direct=buildDirectSingleSheetCandidate(remaining[0],orientation,runId);
      if(direct){
        const candidate=chooseBestNestingSheet(direct.results,usedUnitIds,allInstances,orientation);
        if(candidate){
          candidate.orientation=orientation;candidate.poolSize=1;candidate.frame=direct.frame;candidate.attemptError=null;
          return {best:candidate,attempted:0,initialPoolSize:1};
        }
      }
    }
  }
  const initialSize=Math.min(estimateProgressivePoolSize(remaining,orientations[0],perf),remaining.length);
  const fastLocal=Boolean(perf.local&&remaining.length>28);
  const sizes=(fastLocal
    ?[initialSize,Math.min(12,remaining.length),Math.min(8,remaining.length),Math.min(4,remaining.length),Math.min(1,remaining.length)]
    :[initialSize,Math.min(16,remaining.length),Math.min(12,remaining.length),Math.min(8,remaining.length),Math.min(4,remaining.length),Math.min(1,remaining.length)])
    .filter((n,i,a)=>n>0&&a.indexOf(n)===i);
  let best=null;
  let attempted=0;
  // На локальном запуске не тратим весь бюджет на большие NFP-пакеты:
  // оставляем время для гарантированного single-part fallback.
  const maxAttempts=fastLocal?(remaining.length>140?6:7):12;

  for(const size of sizes){
    const remainingAttempts=maxAttempts-attempted;
    if(remainingAttempts<=0)break;
    const variants=Math.max(1,Math.min(Number(perf.candidateVariants||2),remainingAttempts));
    const pools=buildProgressiveCandidatePools(remaining,size,variants);
    for(const pool of pools){
      for(const orientation of orientations){
        if(!state.running||runId!==state.runId||attempted>=maxAttempts)break;
        attempted++;
        const budget=fastLocal
          ?Math.max(2200,Math.min(Number(perf.sheetCandidateMs)||3200,3200))
          :Math.max(2200,Number(perf.sheetCandidateMs)||4000);
        const runBest=await startOneRun(orientation,budget,runId,pool,perf);
        let candidate=runBest?.results?.length
          ?chooseBestNestingSheet(runBest.results,usedUnitIds,allInstances,orientation)
          :null;

        // Если NFP смог разместить только одну деталь из многодетального
        // пула, не считаем это хорошим раскроем: пробуем безопасную
        // габаритную компоновку и используем её только если она кладёт
        // больше деталей на лист.
        if(pool.length>1&&(!candidate||candidate.newCount<Math.min(2,pool.length))){
          const fallback=buildBoundingBoxFallbackCandidate(pool,orientation,runId);
          if(fallback){
            const fallbackCandidate=chooseBestNestingSheet(
              fallback.results,usedUnitIds,allInstances,orientation
            );
            if(fallbackCandidate&&(!candidate||fallbackCandidate.newCount>candidate.newCount)){
              candidate=fallbackCandidate;
              candidate.fallback=true;
              candidate.fallbackPlaced=fallback.placed;
            }
          }
        }

        if(!candidate)continue;
        candidate.orientation=orientation;
        candidate.poolSize=pool.length;
        candidate.frame=runBest.frame;
        candidate.attemptError=runBest.error||null;
        if(!best||
          candidate.score>best.score||
          (Math.abs(candidate.score-best.score)<0.0001&&candidate.newCount>best.newCount)||
          (Math.abs(candidate.score-best.score)<0.0001&&candidate.newCount===best.newCount&&candidate.fill>best.fill)){
          best=candidate;
        }
        // Stop only when the candidate actually placed the entire pool.
        if(best.newCount>=pool.length)break;
      }
      if(!state.running||runId!==state.runId||attempted>=maxAttempts)break;
      if(best&&best.newCount>=pool.length)break;
    }
    if(!state.running||runId!==state.runId||attempted>=maxAttempts)break;
    if(best&&best.newCount>=Math.max(1,Math.ceil(size*0.9)))break;
  }

  // Если NFP снова вернул только одиночный элемент, не принимаем его
  // как лист. Сначала пробуем fallback на всём оставшемся пуле, чтобы
  // компоновка не деградировала в режим «одна деталь = один лист».
  if(best&&best.newCount<2&&remaining.length>1){
    for(const orientation of orientations||[]){
      if(!state.running||runId!==state.runId)break;
      const fallback=buildBoundingBoxFallbackCandidate(remaining,orientation,runId);
      if(!fallback)continue;
      const fallbackCandidate=chooseBestNestingSheet(
        fallback.results,usedUnitIds,allInstances,orientation
      );
      if(fallbackCandidate&&fallbackCandidate.newCount>best.newCount){
        fallbackCandidate.orientation=orientation;
        fallbackCandidate.poolSize=remaining.length;
        fallbackCandidate.frame=fallback.frame;
        fallbackCandidate.attemptError=null;
        fallbackCandidate.fallback=true;
        fallbackCandidate.fallbackPlaced=fallback.placed;
        best=fallbackCandidate;
      }
    }
  }

  return {best,attempted,initialPoolSize:initialSize};
}
async function commitNextSheetCandidate(candidate,committedSheets,usedUnitIds,remaining,allInstances,orientations,runId,perf,options=null){
  if(!candidate)return {remaining,committed:false};
  const skipRefill=Boolean(options?.skipRefill);
  const sheetIndex=committedSheets.length;
  const accepted=appendFreshResultSheets(committedSheets,[candidate.svg],usedUnitIds,candidate.orientation);
  if(!accepted.length)return {remaining,committed:false};
  remaining=remaining.filter(item=>!instanceIsFullyPlaced(item,usedUnitIds));

  // После фиксации листа повторно оптимизируем только его, сохраняя все уже
  // размещённые на нём детали. Это даёт шанс заполнять карманы мелкими деталями.
  if(!skipRefill){
    const refill=await refillCommittedSheets(
      committedSheets,remaining,usedUnitIds,allInstances,orientations,runId,
      Math.max(1600,Number(perf.sheetCandidateMs)||3000),perf,
      {focusIndexes:[sheetIndex],candidateLimit:Math.min(Math.max(6,Number(perf.refillCandidates||8)),16),maxPasses:Math.max(2,Number(perf.refillPasses)||2),maxSheets:1}
    );
    remaining=refill.remaining;
  }
  return {remaining,committed:true,sheetIndex};
}


async function compactCommittedSheets(committedSheets,remaining,usedUnitIds,allInstances,orientations,runId,perf){
  if(!Array.isArray(committedSheets)||committedSheets.length<2)return {remaining,changed:false,removed:0};
  let changed=false,removed=0;
  const maxPasses=Math.min(4,Math.max(1,committedSheets.length-1));

  for(let pass=0;pass<maxPasses&&committedSheets.length>1&&state.running;pass++){
    const targetIndex=committedSheets.length-1;
    const targetSheet=committedSheets[targetIndex];
    const targetInstanceIds=resultInstanceIds(targetSheet);
    if(!targetInstanceIds.size)break;

    const targetInstances=(allInstances||[]).filter(item=>targetInstanceIds.has(item.instanceId));
    if(!targetInstances.length)break;

    // Сохраняем состояние: если весь последний лист не удаётся убрать,
    // откатываем попытку целиком.
    const snapshotSheets=committedSheets.map(svg=>svg.cloneNode(true));
    const snapshotUsed=new Set(usedUnitIds);
    const snapshotRemaining=(remaining||[]).slice();

    // Убираем из глобального набора только полностью принадлежащие
    // последнему листу экземпляры.
    const targetUnitIds=resultUnitIds(targetSheet);
    targetUnitIds.forEach(id=>usedUnitIds.delete(id));

    const refillPool=uniqueInstances(targetInstances.concat(remaining||[]));
    committedSheets.splice(targetIndex,1);

    let refillResult={remaining:refillPool,changed:false};
    try{
      refillResult=await refillCommittedSheets(
        committedSheets,
        refillPool,
        usedUnitIds,
        allInstances,
        orientations,
        runId,
        Math.max(2200,Number(perf.sheetCandidateMs)||3200),
        perf,
        {
          candidateLimit:Math.min(18,Math.max(8,Number(perf.refillCandidates||8))),
          maxPasses:Math.max(3,Number(perf.refillPasses||2)),
          maxSheets:Math.max(1,committedSheets.length)
        }
      );
    }catch(err){
      console.warn("SheetNest global compact refill:",err);
      refillResult={remaining:refillPool,changed:false};
    }

    const allTargetPlaced=targetInstances.every(item=>instanceIsFullyPlaced(item,usedUnitIds));
    const noUnplacedPool=refillResult.remaining.every(item=>!targetInstanceIds.has(item.instanceId));
    if(allTargetPlaced&&noUnplacedPool){
      remaining=(remaining||[]).filter(item=>!instanceIsFullyPlaced(item,usedUnitIds));
      changed=true;
      removed++;
      $( "runInfo" ).textContent="Оптимизация · удалён лист "+(targetIndex+1)+" · осталось листов: "+committedSheets.length;
      await new Promise(resolve=>setTimeout(resolve,0));
      continue;
    }

    // Не удалось убрать лист — полностью возвращаем его.
    committedSheets.splice(0,committedSheets.length,...snapshotSheets);
    usedUnitIds.clear();
    snapshotUsed.forEach(id=>usedUnitIds.add(id));
    remaining=snapshotRemaining;
    break;
  }

  return {remaining,changed,removed};
}

async function runSearch(options={}){
  const benchmark=Boolean(options.benchmark);
  const benchmarkMode=options.benchmarkMode||"optimized";
  const benchmarkBudgetMs=Math.max(1000,Number(options.benchmarkBudgetMs)||5000);
  if(!state.customParts.length&&!state.libraryParts.length)throw new Error("Загрузите один или несколько DXF/SVG или добавьте типовую деталь.");
  if(requestedPartCount()<1)throw new Error("Количество деталей должно быть больше нуля.");

  const sheet=getSheet();
  const q=qualityConfig();
  const orientations=sheet.auto?[{w:sheet.w,h:sheet.h},{w:sheet.h,h:sheet.w}]:[{w:sheet.w,h:sheet.h}];
  const allInstances=buildNestingInstances();
  const totalUnits=nestingUnitCount(allInstances);

  state.runId+=1;
  const runId=state.runId;
  state.nestingManifest=createNestingManifest();
  state.expectedPartCount=totalUnits;
  state.lastValidation=null;
  initializeInstanceDiagnostics();
  const preflight=preflightNestingInstances(allInstances,orientations);
  const blockedInstances=preflight.blocked;
  renderDiagnosticsPanel();
  if(!preflight.fit.length){
    const blockedNames=blockedInstances.slice(0,6).map(item=>item.instance.instanceId).join(", ");
    throw new Error("Ни одна деталь не помещается на лист. Проверьте размеры листа/поле/зазор. Проблемные instanceId: "+blockedNames);
  }

  $("nestButton").disabled=true;
  $("stopButton").disabled=false;
  $("downloadButton").disabled=true;
  status("Расчёт...");
  state.running=true;
  state.benchmarkActive=benchmark;
  state.resultSvgs=[];
  state.resultMeta=null;
  state.bestResultSvgs=[];
  state.bestResultMeta=null;
  state.searchFrames=0;
  state.bestFrames=0;

  const perf=benchmark?benchmarkRuntimeConfig(allInstances.length,benchmarkMode,benchmarkBudgetMs):adaptiveNestingConfig(allInstances.length);
  const runLimitMs=benchmark?Math.max(benchmarkBudgetMs*4,90000):runLimitForOrder(allInstances.length,perf.mode);
  const poolSizeEstimate=estimateProgressivePoolSize(allInstances,orientations[0],perf);
  const estimatedSheets=Math.max(1,Math.ceil(totalUnits/Math.max(4,Math.floor(poolSizeEstimate*.55))));
  state.durationMs=Math.max(1,estimatedSheets*Math.max(1,Number(perf.candidateVariants||2))*orientations.length*Math.max(1200,Number(perf.sheetCandidateMs)||3000));
  state.startedAt=Date.now();
  state.durationMs=runLimitMs;
  setRunStage("Подготовка",totalUnits+" units · лимит "+Math.ceil(runLimitMs/1000)+" с");
  startRunWatchdog(runId,runLimitMs);
  $("progressBar").style.width="0%";

  const committedSheets=[];
  const usedUnitIds=new Set();
  const benchmarkStartedAt=performance.now();
  let remaining=preflight.fit.slice();
  let stallCount=0;
  let sheetNo=0;

  try{
    while(remaining.length&&state.running&&sheetNo<Math.max(4,totalUnits)){
      setRunStage("Поиск листа","лист "+(sheetNo+1)+" · осталось "+remaining.length+" экземпляров · варианты "+(perf.candidateVariants||1));

      const search=await searchBestNextSheet(
        remaining,allInstances,orientations,runId,perf,usedUnitIds
      );

      if(search.best){
        const committed=await commitNextSheetCandidate(
          search.best,committedSheets,usedUnitIds,remaining,allInstances,orientations,runId,perf
        );
        remaining=committed.remaining;
        if(committed.committed){
          sheetNo++;
          stallCount=0;
          state.bestResultSvgs=committedSheets;
          state.bestResultMeta={
            material:$("material").value,
            thickness:readNumber("thickness",3),
            sheetW:committedSheets[committed.sheetIndex]?.getAttribute("data-sheet-w")||sheet.w,
            sheetH:committedSheets[committed.sheetIndex]?.getAttribute("data-sheet-h")||sheet.h,
            placed:usedUnitIds.size,total:totalUnits,
            efficiency:totalUnits?usedUnitIds.size/totalUnits:0
          };
          const progress=Math.min(.92,usedUnitIds.size/Math.max(1,totalUnits)*.92);
          $("progressBar").style.width=Math.round(progress*100)+"%";
          touchRunProgress();
          $("runInfo").textContent="Лист "+sheetNo+" готов · "+search.best.newCount+" новых деталей · заполнение кандидата "+Math.round(search.best.fill*100)+"% · осталось "+remaining.length;
          await new Promise(resolve=>setTimeout(resolve,0));
          continue;
        }
      }

      setRunStage("Rescue","прямое размещение после остановки поиска");
      // Последняя попытка — одиночные элементы, чтобы не считать деталь
      // потерянной только из-за неудачного большого NFP-пакета.
      stallCount++;
      const directRescueLimit=Math.min(8,remaining.length);
      let directRescued=false;
      for(let ri=0;ri<directRescueLimit;ri++){
        const item=remaining[ri];
        for(const orientation of orientations){
          const direct=buildDirectSingleSheetCandidate(item,orientation,runId);
          if(!direct)continue;
          const candidate=chooseBestNestingSheet(direct.results,usedUnitIds,allInstances,orientation);
          if(!candidate)continue;
          candidate.orientation=orientation;candidate.poolSize=1;
          const committed=await commitNextSheetCandidate(candidate,committedSheets,usedUnitIds,remaining,allInstances,orientations,runId,perf,{skipRefill:true});
          remaining=committed.remaining;
          if(committed.committed){sheetNo++;directRescued=true;break;}
        }
        if(directRescued)break;
      }
      if(directRescued)continue;

      const rescue=selectNestingBatch(remaining,Math.min(6,remaining.length),stallCount%2?"small":"large");
      let rescued=false;
      for(const item of rescue){
        if(!state.running)break;
        for(const orientation of orientations){
          const runBest=await startOneRun(orientation,Math.max(1400,Math.min(Number(perf.sheetCandidateMs)||3000,2200)),runId,[item],perf);
          const candidate=chooseBestNestingSheet(runBest?.results,usedUnitIds,allInstances,orientation);
          if(candidate){
            const committed=await commitNextSheetCandidate(candidate,committedSheets,usedUnitIds,remaining,allInstances,orientations,runId,perf);
            remaining=committed.remaining;
            if(committed.committed){sheetNo++;rescued=true;break;}
          }
        }
        if(rescued)break;
      }
      if(!rescued||stallCount>=5)break;
    }

    // Глобальная двухкритериальная оптимизация:
    // 1) минимум листов;
    // 2) при том же числе листов — максимум полезного заполнения.
    // Сначала пытаемся полностью убрать последний лист, перепаковывая его
    // детали на уже существующие листы.
    setRunStage("Глобальная оптимизация","проверка возможности убрать лишний лист");
    if(committedSheets.length>1&&state.running&&(!benchmark||benchmarkMode==="optimized")){
      const compacted=await compactCommittedSheets(
        committedSheets,remaining,usedUnitIds,allInstances,orientations,runId,perf
      );
      remaining=compacted.remaining;
      if(compacted.changed){
        state.bestResultSvgs=committedSheets;
        state.bestResultMeta={
          material:$( "material" ).value,
          thickness:readNumber("thickness",3),
          sheetW:sheet.w,
          sheetH:sheet.h,
          placed:usedUnitIds.size,total:totalUnits,
          efficiency:totalUnits?usedUnitIds.size/totalUnits:0
        };
      }
    }

    const finalPlacedUnits=usedUnitIds.size;
    setRunStage("Финализация",finalPlacedUnits+"/"+totalUnits+" units");
    state.resultSvgs=committedSheets;
    state.bestResultSvgs=committedSheets;

    const meta={
      material:$("material").value,
      thickness:readNumber("thickness",3),
      sheetW:sheet.w,
      sheetH:sheet.h,
      margin:readNumber("margin",10),
      gap:readNumber("gap",2),
      efficiency:totalUnits?finalPlacedUnits/totalUnits:0,
      placed:finalPlacedUnits,
      total:totalUnits,
      complete:finalPlacedUnits>=totalUnits
    };
    state.resultMeta=meta;
    state.bestResultMeta=meta;

    const placedUnitSet=new Set(usedUnitIds);
    const placedInstanceIds=allInstances.filter(item=>instanceIsFullyPlaced(item,placedUnitSet)).map(item=>item.instanceId);
    const missingInstanceIds=allInstances.filter(item=>!instanceIsFullyPlaced(item,placedUnitSet)).map(item=>item.instanceId);
    const missingUnitIds=[];
    allInstances.forEach(item=>{
      const entry=state.instanceDiagnostics?.[item.instanceId];
      (entry?.unitIds||[]).forEach(unitId=>{if(!placedUnitSet.has(unitId))missingUnitIds.push(unitId)});
    });
    const summary={
      mode:benchmark?benchmarkMode:"optimized",
      durationMs:Math.round(performance.now()-benchmarkStartedAt),
      sheets:committedSheets.length,
      totalUnits,
      placedUnits:finalPlacedUnits,
      efficiency:totalUnits?finalPlacedUnits/totalUnits:0,
      placedInstanceIds,
      missingInstanceIds,
      missingUnitIds,
      complete:finalPlacedUnits>=totalUnits
    };

    if(!benchmark){
      if(committedSheets.length){
        renderResults(committedSheets,meta.efficiency,finalPlacedUnits,totalUnits,sheet,{mode:"final",frame:state.searchFrames,isBest:meta.complete});
        finalizeDiagnostics(committedSheets,meta.complete?"complete":"partial-result",usedUnitIds);
      }else{
        finalizeDiagnostics([],"no-valid-result");
      }
    }

    if(benchmark)return summary;

    $("progressBar").style.width="100%";
    if(state.runWatchdogReason==="global-timeout"){
      $("runInfo").textContent="Остановлено по общему таймауту · "+finalPlacedUnits+"/"+totalUnits+" деталей сохранено в лучшем найденном результате";
      status("Расчёт остановлен по таймауту");
    }else if(finalPlacedUnits>=totalUnits){
      $("runInfo").textContent="Готово · "+committedSheets.length+" лист(ов) · "+finalPlacedUnits+"/"+totalUnits+" деталей · просмотрено "+state.searchFrames+" вариантов";
      status("Раскрой рассчитан");
    }else if(finalPlacedUnits>0){
      const missing=Math.max(0,totalUnits-finalPlacedUnits);
      const blockedText=blockedInstances.length?(" · заблокировано по габаритам: "+blockedInstances.length):"";
      $("runInfo").textContent="Частичный результат · "+committedSheets.length+" лист(ов) · "+finalPlacedUnits+"/"+totalUnits+" деталей · не размещено: "+missing+blockedText;
      status("Частичный раскрой");
    }else{
      const blockedText=blockedInstances.length?(" "+blockedInstances.length+" деталей не проходят по габаритам листа. "):"";
      $("runInfo").textContent=blockedText+"Поиск не получил ни одного валидного кандидата. Проверьте диагностику.";
      status("Нет валидной раскладки");
    }
  }finally{
    stopRunWatchdog();
    try{SvgNest.stop()}catch(_){}
    state.running=false;
    window.SheetNestDxf?.update?.();
    window.SheetNestLaser?.update?.();
    state.benchmarkActive=false;
    $("nestButton").disabled=false;
    $("stopButton").disabled=true;
  }
}

function nestingUnitCount(instances){
  return (instances||[]).reduce((sum,item)=>sum+(item?.kind==="custom"?partNestingUnits(item.part):1),0);
}

function placedUnitIdsFromResults(svgList){
  const ids=new Set();
  (svgList||[]).forEach(svg=>{
    svg.querySelectorAll("g[data-sheetnest-unit-id]").forEach(group=>{
      const unitId=group.getAttribute("data-sheetnest-unit-id");
      if(unitId)ids.add(unitId);
    });
  });
  return ids;
}

function placedInstanceIdsFromResults(svgList){
  const unitsByInstance=new Map();
  (svgList||[]).forEach(svg=>{
    svg.querySelectorAll("g[data-sheetnest-unit-id]").forEach(group=>{
      const unitId=group.getAttribute("data-sheetnest-unit-id");
      const instanceId=group.getAttribute("data-sheetnest-source-instance-id")||state.unitToInstance[unitId];
      if(!instanceId||!unitId)return;
      if(!unitsByInstance.has(instanceId))unitsByInstance.set(instanceId,new Set());
      unitsByInstance.get(instanceId).add(unitId);
    });
  });
  const ids=new Set();
  unitsByInstance.forEach((unitIds,instanceId)=>{
    const expected=Number(state.instanceDiagnostics?.[instanceId]?.expectedUnits||1);
    if(unitIds.size>=expected)ids.add(instanceId);
  });
  return ids;
}

function betterNestingCandidate(next,best){
  if(!best)return true;
  const nextComplete=Number(next.placed||0)>=Number(next.total||0);
  const bestComplete=Number(best.placed||0)>=Number(best.total||0);
  if(nextComplete!==bestComplete)return nextComplete;
  if(!nextComplete){
    if(Number(next.placed||0)!==Number(best.placed||0))return Number(next.placed||0)>Number(best.placed||0);
  }
  const nextSheets=Array.isArray(next.results)?next.results.length:Infinity;
  const bestSheets=Array.isArray(best.results)?best.results.length:Infinity;
  const nextValid=next.validation?next.validation.valid!==false:true;
  const bestValid=best.validation?best.validation.valid!==false:true;
  if(nextValid!==bestValid)return nextValid;
  if(nextSheets!==bestSheets)return nextSheets<bestSheets;
  return Number(next.efficiency||0)>Number(best.efficiency||0);
}


function benchmarkBudgetMs(){
  const seconds=Number($("benchmarkBudget")?.value||5);
  return Math.max(1000,Math.round(seconds*1000));
}

function benchmarkFormatMs(ms){
  return (Number(ms||0)/1000).toFixed(2)+" с";
}

function benchmarkEscapedIds(ids){
  return (ids||[]).length?ids.map(escapeHtml).join(", "):"—";
}

function renderBenchmarkResults(results){
  const panel=$("benchmarkPanel"),body=$("benchmarkBody"),statusEl=$("benchmarkStatus");
  if(!panel||!body)return;
  panel.hidden=false;
  if(statusEl)statusEl.textContent="Готово";
  const baseline=results.baseline,optimized=results.optimized;
  const timeDelta=baseline.durationMs-optimized.durationMs;
  const timePct=baseline.durationMs?((timeDelta/baseline.durationMs)*100):0;
  const sheetDelta=baseline.sheets-optimized.sheets;
  const placedDelta=optimized.placedUnits-baseline.placedUnits;
  body.innerHTML=
    "<div class='benchmark-cards'>"+
      "<article class='benchmark-card'><span>BASELINE</span><strong>"+benchmarkFormatMs(baseline.durationMs)+"</strong><small>"+baseline.sheets+" лист. · "+baseline.placedUnits+"/"+baseline.totalUnits+" units</small></article>"+
      "<article class='benchmark-card optimized'><span>OPTIMIZED</span><strong>"+benchmarkFormatMs(optimized.durationMs)+"</strong><small>"+optimized.sheets+" лист. · "+optimized.placedUnits+"/"+optimized.totalUnits+" units</small></article>"+
      "<article class='benchmark-card delta'><span>РАЗНИЦА</span><strong>"+(timeDelta>=0?"−":"+")+benchmarkFormatMs(Math.abs(timeDelta))+"</strong><small>время: "+(timePct>=0?"":"+")+timePct.toFixed(1)+"% · листы: "+(sheetDelta>=0?"−":"+")+Math.abs(sheetDelta)+" · units: "+(placedDelta>=0?"+":"")+placedDelta+"</small></article>"+
    "</div>"+
    "<div class='benchmark-table'>"+
      "<div><span>Параметр</span><b>Baseline</b><b>Optimized</b></div>"+
      "<div><span>Время</span><b>"+benchmarkFormatMs(baseline.durationMs)+"</b><b>"+benchmarkFormatMs(optimized.durationMs)+"</b></div>"+
      "<div><span>Листы</span><b>"+baseline.sheets+"</b><b>"+optimized.sheets+"</b></div>"+
      "<div><span>Размещено units</span><b>"+baseline.placedUnits+"/"+baseline.totalUnits+"</b><b>"+optimized.placedUnits+"/"+optimized.totalUnits+"</b></div>"+
      "<div><span>Instance</span><b>"+baseline.placedInstanceIds.length+" размещено</b><b>"+optimized.placedInstanceIds.length+" размещено</b></div>"+
      "<div><span>Пропущено</span><b>"+baseline.missingInstanceIds.length+"</b><b>"+optimized.missingInstanceIds.length+"</b></div>"+
    "</div>"+
    "<div class='benchmark-missing'><div><strong>Пропущенные BASELINE</strong><p>"+benchmarkEscapedIds(baseline.missingInstanceIds)+"</p></div><div><strong>Пропущенные OPTIMIZED</strong><p>"+benchmarkEscapedIds(optimized.missingInstanceIds)+"</p></div></div>";
}

async function runBenchmark(){
  if(state.running)return;
  if(!state.customParts.length&&!state.libraryParts.length){
    alert("Сначала загрузите DXF/SVG или добавьте типовую деталь.");
    return;
  }
  const saved={
    resultSvgs:state.resultSvgs,
    resultMeta:state.resultMeta,
    bestResultSvgs:state.bestResultSvgs,
    bestResultMeta:state.bestResultMeta,
    lastValidation:state.lastValidation,
    runId:state.runId,
    instanceDiagnostics:state.instanceDiagnostics,
    unitToInstance:state.unitToInstance,
    searchFrames:state.searchFrames,
    bestFrames:state.bestFrames
  };
  const button=$("benchmarkButton");
  if(button)button.disabled=true;
  status("Benchmark...");
  if($("benchmarkStatus"))$("benchmarkStatus").textContent="Выполняется";
  if($("benchmarkPanel"))$("benchmarkPanel").hidden=false;

  try{
    const budget=benchmarkBudgetMs();
    const baseline=await runSearch({benchmark:true,benchmarkMode:"baseline",benchmarkBudgetMs:budget});
    const optimized=await runSearch({benchmark:true,benchmarkMode:"optimized",benchmarkBudgetMs:budget});
    const results={schema:"sheetnest.benchmark.v1",createdAt:new Date().toISOString(),budgetMs:budget,baseline,optimized};
    window.lastSheetNestBenchmark=results;
    renderBenchmarkResults(results);
    status("Benchmark завершён");
  }catch(err){
    status("Ошибка benchmark");
    alert("Benchmark завершился с ошибкой: "+err.message);
  }finally{
    Object.assign(state,saved);
    stopRunWatchdog();
    state.running=false;
    state.benchmarkActive=false;
    state.benchmarkActive=false;
    window.SheetNestLaser?.update?.();
    if(button)button.disabled=false;
    $("progressBar").style.width="0%";
    renderDiagnosticsPanel();
  }
}

function exportBenchmarkJSON(){
  const data=window.lastSheetNestBenchmark;
  if(!data)return;
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="sheetnest-benchmark-"+new Date().toISOString().replace(/[:.]/g,"-")+".json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

try{document.documentElement.dataset.sheetnestBuild=SHEETNEST_ENGINE_BUILD;console.info("SheetNest build",SHEETNEST_ENGINE_BUILD)}catch(_){}
$("fileInput").addEventListener("change",async event=>{
  const files=Array.from(event.target.files||[]);if(!files.length)return;
  status("Загрузка CAD…");const imported=[],failed=[];
  for(const file of files){
    try{
      const ext=file.name.split(".").pop().toLowerCase();let svgText;
      if(ext==="svg")svgText=await file.text();else if(ext==="dxf")svgText=dxfTextToSvg(await file.text());else throw new Error("Поддерживаются только DXF и SVG.");
      const elements=sourceElements(svgText);
      const inspection=SvgNest.inspectSvg(svgText);
      if(!inspection||inspection.parts<1)throw new Error("В файле не найдено ни одной замкнутой детали.");
      imported.push({
        id:"cad-"+Date.now()+"-"+Math.random().toString(36).slice(2),
        name:file.name,
        svgText,
        quantity:1,
        elementsCount:elements.length,
        nestingUnits:inspection.parts,
        contours:inspection.contours,
        holes:inspection.holes,
        droppedContours:inspection.droppedContours
      });
    }catch(err){failed.push(file.name+": "+err.message);}
  }
  if(imported.length){
    state.customParts.push(...imported);renderSelectedShapes();updateGeometryInfo();status("CAD загружен");
    if(failed.length)alert("Не удалось загрузить:\n"+failed.join("\n"));
  }else{status("Ошибка");alert(failed.length?failed.join("\n"):"Не удалось загрузить файлы.");}
  event.target.value="";
});
$("benchmarkButton")?.addEventListener("click",()=>{Promise.resolve().then(()=>runBenchmark())});
$("benchmarkExport")?.addEventListener("click",exportBenchmarkJSON);
$("nestButton").addEventListener("click",()=>{Promise.resolve().then(()=>runSearch()).catch(err=>{state.running=false;try{SvgNest.stop()}catch(_){}$("nestButton").disabled=false;$("stopButton").disabled=true;status("Ошибка");alert(err.message)})});
$("stopButton").addEventListener("click",()=>{state.runId+=1;state.running=false;try{SvgNest.stop()}catch(_){}$("nestButton").disabled=false;$("stopButton").disabled=true;$("runInfo").textContent="Поиск остановлен. Показан лучший найденный вариант.";status("Остановлено");$("progressBar").style.width="100%"});
$("downloadButton").addEventListener("click",()=>{if(!state.resultSvgs.length||!state.resultMeta)return;const prepared=state.resultSvgs.map((item,index)=>{const clone=item.cloneNode(true);const sheetW=Number(item.getAttribute("data-sheet-w"))||state.resultMeta.sheetW;const sheetH=Number(item.getAttribute("data-sheet-h"))||state.resultMeta.sheetH;decorateResultSvg(clone,{...state.resultMeta,sheetW,sheetH},index);return new XMLSerializer().serializeToString(clone)}).join("\n");const out=`<svg xmlns="http://www.w3.org/2000/svg">${prepared}</svg>`;const blob=new Blob([out],{type:"image/svg+xml;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="sheetnest-metal-layout.svg";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});

function setupDiagnosticsPanel(){
  const panel=$("diagnosticsPanel"),toggle=$("diagnosticsToggle");
  if(!panel||!toggle)return;
  $("diagnosticsExportJson")?.addEventListener("click",exportDiagnosticsJSON);
  $("diagnosticsExportCsv")?.addEventListener("click",exportDiagnosticsCSV);
  toggle.addEventListener("click",()=>{
    panel.classList.toggle("collapsed");
    toggle.textContent=panel.classList.contains("collapsed")?"Развернуть":"Свернуть";
  });
  if(!diagnosticEntries().length){
    $("diagnosticsExportJson")?.setAttribute("disabled","");
    $("diagnosticsExportCsv")?.setAttribute("disabled","");
  }
}
setupDiagnosticsPanel();
["sheetW","sheetH","material","thickness"].forEach(id=>$(id).addEventListener("input",updateSheetPreview));
setupShapeLibrary();setupCanvasZoom();updateSheetPreview();updateGeometryInfo();
window.state=state


