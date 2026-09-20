const state={sourceSvg:null,customParts:[],libraryParts:[],resultSvgs:[],resultMeta:null,bestResultSvgs:[],bestResultMeta:null,running:false,startedAt:0,durationMs:0,canvasZoom:1,searchFrames:0,bestFrames:0,nestingManifest:null,expectedPartCount:0,lastValidation:null,runId:0,instanceDiagnostics:{},unitToInstance:{}};

const $=id=>document.getElementById(id);
const status=value=>{$("status").textContent=value};

function readNumber(id,fallback){const n=Number($(id).value);return Number.isFinite(n)?n:fallback}
function qualityConfig(){const q=$("quality").value;if(q==="fast")return{seconds:10,populationSize:12,mutationRate:12};if(q==="max")return{seconds:90,populationSize:40,mutationRate:18};return{seconds:30,populationSize:24,mutationRate:15}}
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
  {id:"rect",name:"Прямоугольник",size:"200 × 100 мм",w:200,h:100,kind:"rect"},
  {id:"square",name:"Квадрат",size:"120 × 120 мм",w:120,h:120,kind:"square"},
  {id:"circle",name:"Круг",size:"Ø 100 мм",w:100,h:100,kind:"circle"},
  {id:"triangle",name:"Треугольник",size:"140 × 120 мм",w:140,h:120,kind:"triangle"},
  {id:"hex",name:"Шестиугольник",size:"120 × 104 мм",w:120,h:104,kind:"hex"},
  {id:"roundrect",name:"Скруглённый прямоугольник",size:"220 × 100 мм",w:220,h:100,kind:"roundrect"}
];

function roundedRectPath(w,h,r){
  const points=[];
  const corners=[[w-r,r,Math.PI*1.5,Math.PI*2],[w-r,h-r,0,Math.PI/2],[r,h-r,Math.PI/2,Math.PI],[r,r,Math.PI,Math.PI*1.5]];
  corners.forEach(corner=>{
    const cx=corner[0],cy=corner[1],a0=corner[2],a1=corner[3],steps=4;
    for(let i=0;i<=steps;i++){const a=a0+(a1-a0)*i/steps;points.push({x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)})}
  });
  return "M "+points.map(p=>p.x.toFixed(2)+" "+p.y.toFixed(2)).join(" L ")+" Z";
}

function shapePath(shape){
  if(shape.kind==="rect")return "M0 0 L200 0 L200 100 L0 100 Z";
  if(shape.kind==="square")return "M0 0 L120 0 L120 120 L0 120 Z";
  if(shape.kind==="triangle")return "M0 120 L70 0 L140 120 Z";
  if(shape.kind==="hex")return "M25 0 L95 0 L120 52 L95 104 L25 104 L0 52 Z";
  if(shape.kind==="roundrect")return roundedRectPath(220,100,20);
  const points=[];
  for(let i=0;i<48;i++){const angle=-Math.PI/2+i*(Math.PI*2/48);points.push({x:50+50*Math.cos(angle),y:50+50*Math.sin(angle)})}
  return "M "+points.map(p=>p.x.toFixed(2)+" "+p.y.toFixed(2)).join(" L ")+" Z";
}

function shapePreview(shape){
  return "<svg viewBox=\"0 0 "+shape.w+" "+shape.h+"\" aria-hidden=\"true\"><path d=\""+shapePath(shape)+"\"/></svg>";
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
    const shape=SHAPE_LIBRARY.find(item=>item.id===part.id);
    if(shape)manifest.push({id:part.id,name:shape.name,type:"library",quantity:normalizedQuantity(part),units:1});
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
  if(state.libraryParts.length)bits.push(...state.libraryParts.map(part=>{const shape=SHAPE_LIBRARY.find(item=>item.id===part.id);return (shape?shape.name:part.id)+" × "+part.quantity;}));
  if(fileLine)fileLine.textContent=state.customParts.length?state.customParts.length+" CAD-файл(ов): "+state.customParts.map(part=>part.name).join(", "):"Файл не выбран";
  const partsTotal=$("partsTotal");if(partsTotal)partsTotal.textContent=requestedPartCount();
  if(!bits.length){chip.innerHTML="<span class=\"chip-dot\"></span><span>Геометрия не загружена</span>";return;}
  chip.innerHTML="<span class=\"chip-dot\"></span><span>"+escapeHtml(bits.join(" · "))+"</span>";
}
function renderSelectedShapes(){
  const wrap=$("selectedParts"),empty=$("selectedPartsEmpty");if(!wrap||!empty)return;
  wrap.querySelectorAll(".selected-part").forEach(node=>node.remove());
  const hasParts=state.customParts.length||state.libraryParts.length;empty.style.display=hasParts?"none":"block";
  state.customParts.forEach(addCustomPartCard);
  state.libraryParts.forEach(part=>{
    const shape=SHAPE_LIBRARY.find(item=>item.id===part.id);if(!shape)return;
    const item=document.createElement("div");item.className="selected-part";item.dataset.shapeId=part.id;
    item.innerHTML="<div class=\"selected-part-thumb\">"+shapePreview(shape)+"</div><div class=\"selected-part-info\"><b>"+escapeHtml(shape.name)+"</b><small>Типовая · "+escapeHtml(shape.size)+"</small></div><input class=\"selected-part-qty\" type=\"number\" min=\"1\" max=\"9999\" step=\"1\" value=\""+part.quantity+"\" aria-label=\"Количество "+escapeHtml(shape.name)+"\"><button class=\"selected-part-remove\" type=\"button\" title=\"Удалить\" aria-label=\"Удалить "+escapeHtml(shape.name)+"\">×</button>";
    item.querySelector(".selected-part-qty").addEventListener("change",event=>{
      const value=Math.max(1,Math.min(9999,Math.floor(Number(event.target.value)||1)));event.target.value=String(value);
      const target=state.libraryParts.find(entry=>entry.id===part.id);if(target)target.quantity=value;updateGeometryInfo();
    });
    item.querySelector(".selected-part-remove").addEventListener("click",()=>{state.libraryParts=state.libraryParts.filter(entry=>entry.id!==part.id);renderSelectedShapes();updateGeometryInfo()});
    wrap.appendChild(item);
  });
}
function setupShapeLibrary(){
  const library=$("shapeLibrary");
  if(!library||library.dataset.ready==="1")return;
  library.dataset.ready="1";library.innerHTML="";
  SHAPE_LIBRARY.forEach(shape=>{
    const card=document.createElement("article");
    card.className="shape-card";
    card.innerHTML="<div class=\"shape-thumb\">"+shapePreview(shape)+"</div><div class=\"shape-card-copy\"><b>"+escapeHtml(shape.name)+"</b><small>"+escapeHtml(shape.size)+"</small></div><div class=\"shape-card-actions\"><input class=\"shape-card-qty\" type=\"number\" min=\"1\" max=\"9999\" step=\"1\" value=\"1\" aria-label=\"Количество "+escapeHtml(shape.name)+"\"><button class=\"shape-add\" type=\"button\" title=\"Добавить в раскрой\" aria-label=\"Добавить "+escapeHtml(shape.name)+"\">+</button></div>";
    card.querySelector(".shape-add").addEventListener("click",()=>{
      const input=card.querySelector(".shape-card-qty");
      const quantity=Math.max(1,Math.min(9999,Math.floor(Number(input.value)||1)));
      input.value="1";
      const existing=state.libraryParts.find(entry=>entry.id===shape.id);
      if(existing)existing.quantity=Math.min(9999,existing.quantity+quantity);else state.libraryParts.push({id:shape.id,quantity,nestingUnits:1,contours:1,holes:0});
      renderSelectedShapes();updateGeometryInfo();status("Фигура добавлена");
    });
    library.appendChild(card);
  });
  $("clearShapes")?.addEventListener("click",()=>{state.libraryParts=[];renderSelectedShapes();updateGeometryInfo()});
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
    const shape=SHAPE_LIBRARY.find(item=>item.id===part.id);
    if(!shape)continue;
    const d=shapePath(shape);
    const bounds={minX:0,minY:0,width:Math.max(1,shape.w),height:Math.max(1,shape.h)};
    for(let copy=0;copy<normalizedQuantity(part);copy++){
      const instanceId="library-"+shape.id+"#"+(copy+1);
      const ns="http://www.w3.org/2000/svg",group=document.createElementNS(ns,"g");
      group.setAttribute("data-sheetnest-stage-instance",instanceId);
      group.setAttribute("data-sheetnest-shape",shape.id);
      group.setAttribute("transform","translate("+stage.nextX+" "+stage.nextY+")");
      const path=document.createElementNS(ns,"path");
      path.setAttribute("d",d);path.setAttribute("fill","none");path.setAttribute("stroke","black");path.setAttribute("stroke-width",".2");
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

function buildNestingSvg(w,h){
  const margin=Math.max(0,readNumber("margin",10)),innerW=w-2*margin,innerH=h-2*margin;
  if(innerW<=0||innerH<=0)throw new Error("Поле от края больше размера металлического листа.");
  const ns="http://www.w3.org/2000/svg",root=document.createElementNS(ns,"svg");
  root.setAttribute("xmlns",ns);root.setAttribute("viewBox","0 0 "+innerW+" "+innerH);root.setAttribute("width",String(innerW));root.setAttribute("height",String(innerH));
  const bin=document.createElementNS(ns,"rect");bin.setAttribute("id","sheet-bin");bin.setAttribute("x","0");bin.setAttribute("y","0");bin.setAttribute("width",String(innerW));bin.setAttribute("height",String(innerH));root.appendChild(bin);
  const stage={nextX:0,nextY:0,rowHeight:0,gap:Math.max(50,readNumber("gap",2)*20),maxWidth:Math.max(10000,innerW*20,100000)};
  appendCustomParts(root,stage);appendLibraryParts(root,stage);
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
    const shape=SHAPE_LIBRARY.find(item=>item.id===part.id);if(!shape)return;
    for(let copy=0;copy<normalizedQuantity(part);copy++){
      const instanceId="library-"+shape.id+"#"+(copy+1);
      state.instanceDiagnostics[instanceId]={
        instanceId,sourceId:shape.id,name:shape.name,type:"Типовая",
        expectedUnits:1,unitIds:[],candidateUnitIds:[],bestCandidateUnitIds:[],finalUnitIds:[],
        staged:false,parsed:false,status:"imported",stage:"Импорт",issue:"Экземпляр создан.",candidateFrame:0
      };
    }
  });
  renderDiagnosticsPanel();
}
function markDiagnosticsStaged(svgText){
  const doc=new DOMParser().parseFromString(svgText,"image/svg+xml");
  const staged=new Set(Array.from(doc.querySelectorAll("[data-sheetnest-stage-instance]")).map(node=>node.getAttribute("data-sheetnest-stage-instance")).filter(Boolean));
  diagnosticEntries().forEach(entry=>{
    if(staged.has(entry.instanceId)){
      entry.staged=true;entry.status="staged";entry.stage="Staging";entry.issue="Экземпляр передан в SvgNest.";
    }else{
      entry.staged=false;entry.status="lost";entry.stage="Staging";entry.issue="Экземпляр не попал в подготовленный SVG.";
    }
  });
  renderDiagnosticsPanel();
}
function registerParsedUnits(parsed){
  const elements=Array.from(parsed.querySelectorAll("[data-sheetnest-unit-id]"));
  const parsedByInstance={};
  elements.forEach(node=>{
    const unitId=node.getAttribute("data-sheetnest-unit-id");
    const instanceId=node.getAttribute("data-sheetnest-source-instance-id");
    if(!unitId||!instanceId)return;
    state.unitToInstance[unitId]=instanceId;
    const entry=state.instanceDiagnostics[instanceId];if(!entry)return;
    diagnosticAddUnique(entry.unitIds,unitId);
    parsedByInstance[instanceId]=(parsedByInstance[instanceId]||0)+1;
  });
  diagnosticEntries().forEach(entry=>{
    const parsedCount=parsedByInstance[entry.instanceId]||0;
    entry.parsed=parsedCount>0;
    if(parsedCount>=entry.expectedUnits){
      entry.status="parsed";entry.stage="SvgNest.parse/getParts";entry.issue="Все ожидаемые nesting units распознаны.";
    }else if(parsedCount>0){
      entry.status="lost";entry.stage="SvgNest.parse/getParts";entry.issue="Распознано "+parsedCount+" из "+entry.expectedUnits+" nesting units.";
    }else if(entry.status!=="lost"){
      entry.status="parser_error";entry.stage="SvgNest.parse/getParts";entry.issue="SvgNest не создал ни одного nesting unit.";
    }
  });
  renderDiagnosticsPanel();
}
function updateDiagnosticsFromCandidate(svgList,isBest,frame,validation){
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
  renderDiagnosticsPanel();
}
function finalizeDiagnostics(svgList,reason="complete"){
  const finalSet=new Set(collectPlacedUnitIds(svgList).unitIds);
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
function renderResults(svgList,efficiency,placed,total,sheet,view={mode:"final",frame:0,isBest:false}){
  const wrap=$("canvasWrap");wrap.innerHTML="";
  const meta={material:$("material").value,thickness:readNumber("thickness",3),sheetW:sheet.w,sheetH:sheet.h,margin:readNumber("margin",10),gap:readNumber("gap",2),efficiency:Number(efficiency||0),placed:Number(placed||0),total:Number(total||0),mode:view.mode,frame:view.frame,isBest:Boolean(view.isBest)};
  state.resultMeta=meta;
  wrap.classList.toggle("searching",view.mode==="search");
  svgList.forEach((svg,index)=>{
    const card=document.createElement("div");card.className="result-card"+(view.mode==="search"?" search-frame":"");
    const title=document.createElement("div");title.className="result-title";
    const phase=view.mode==="search"?(view.isBest?"Новый лучший вариант":"Текущий кандидат"):"Итоговая раскладка";
    title.innerHTML=`<strong>Лист ${index+1} · ${phase}</strong><span>${sheet.w} × ${sheet.h} мм · ${escapeHtml(meta.material)} · ${meta.thickness} мм</span>`;
    const clone=svg.cloneNode(true);clone.classList.add("sheet-svg");clone.removeAttribute("width");clone.removeAttribute("height");decorateResultSvg(clone,meta,index);
    card.appendChild(title);card.appendChild(clone);
    const summary=document.createElement("div");summary.className="sheet-summary";summary.innerHTML=`<span>Поле: <strong>${meta.margin} мм</strong> · зазор: <strong>${meta.gap} мм</strong></span><span>Деталей: <strong>${placed||0}/${total||0}</strong></span>`;card.appendChild(summary);wrap.appendChild(card);
  });
  $("statSheets").textContent=svgList.length;$("statParts").textContent=placed||0;$("statEfficiency").textContent=`${Math.round((efficiency||0)*100)}%`;$("downloadButton").disabled=svgList.length===0||state.running;applyCanvasZoom();
}
function updateProgress(){
  if(!state.running)return;
  const elapsed=Date.now()-state.startedAt,p=Math.min(1,elapsed/state.durationMs);
  $("progressBar").style.width=`${Math.round(p*100)}%`;
  $("runInfo").textContent=`Перебираем раскладки · кадр ${state.searchFrames} · осталось ${Math.max(0,Math.ceil((state.durationMs-elapsed)/1000))} с`;
}

function startOneRun(sheet,runDurationMs,runId){
  resetEngine();
  const expectedTotal=state.expectedPartCount||requestedPartCount();
  const nestingSvg=buildNestingSvg(sheet.w,sheet.h);
  markDiagnosticsStaged(nestingSvg);
  const parsed=SvgNest.parsesvg(nestingSvg);
  registerParsedUnits(parsed);
  const bin=parsed.querySelector("#sheet-bin");
  if(!bin)throw new Error("Не удалось создать металлический лист.");
  SvgNest.setbin(bin);
  let runBest=null;
  SvgNest.start(
    progress=>{if(state.running)$("progressBar").style.width=`${Math.max(2,Math.round((progress||0)*100))}%`;},
    (svglist,efficiency,placed,total,isBest=false,frame=0)=>{
      if(!state.running||runId!==state.runId)return;
      if(!svglist||!svglist.length)return;
      state.searchFrames++;
      const validation=validateNestingResult(svglist,placed,expectedTotal);
      state.lastValidation=validation;
       updateDiagnosticsFromCandidate(svglist,isBest,frame,validation);
      const shownPlaced=validation.unique;
      if(isBest&&validation.valid){
        state.bestFrames++;
        runBest={results:svglist,efficiency,placed:shownPlaced,total:expectedTotal,sheet:{w:sheet.w,h:sheet.h},frame,validation};
      }
      state.resultSvgs=svglist;
      renderResults(svglist,efficiency,shownPlaced,expectedTotal,sheet,{mode:"search",frame,isBest});
      const tag=!validation.valid?"Непроверенный кандидат":(isBest?"Новый лучший":"Кандидат");
      $("runInfo").textContent=tag+" · кадр "+state.searchFrames+" · "+shownPlaced+"/"+expectedTotal+" деталей · "+Math.round((efficiency||0)*100)+"% заполнение";
      $("status").textContent=validation.valid?"Ищем раскладку…":"Проверяем геометрию результата…";
    }
  );
  return new Promise(resolve=>{
    const timer=setInterval(()=>{
      if(!state.running){clearInterval(timer);resolve(runBest);return;}
      updateProgress();
      if(Date.now()-state.startedAt>=runDurationMs){clearInterval(timer);try{SvgNest.stop()}catch(_){}resolve(runBest);}
    },120);
  });
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

async function runSearch(){
  if(!state.customParts.length&&!state.libraryParts.length)throw new Error("Загрузите один или несколько DXF/SVG или добавьте типовую деталь.");
  if(requestedPartCount()<1)throw new Error("Количество деталей должно быть больше нуля.");
  const sheet=getSheet(),q=qualityConfig(),orientations=sheet.auto?[{w:sheet.w,h:sheet.h},{w:sheet.h,h:sheet.w}]:[{w:sheet.w,h:sheet.h}];
  state.runId+=1;
  const runId=state.runId;
  state.nestingManifest=createNestingManifest();
  state.expectedPartCount=requestedPartCount();
  state.lastValidation=null;
   initializeInstanceDiagnostics();
  $("nestButton").disabled=true;$("stopButton").disabled=false;$("downloadButton").disabled=true;status("Расчёт...");
  state.running=true;state.resultSvgs=[];state.resultMeta=null;state.bestResultSvgs=[];state.bestResultMeta=null;state.searchFrames=0;state.bestFrames=0;state.durationMs=q.seconds*1000/orientations.length;$("progressBar").style.width="0%";
  let bestOverall=null;
  for(const candidate of orientations){
    if(!state.running)break;
    state.startedAt=Date.now();
    const runBest=await startOneRun(candidate,state.durationMs,runId);
    if(runBest){
      const current={
        results:runBest.results,
        efficiency:Number(runBest.efficiency||0),
        placed:Number(runBest.placed||0),
        total:state.expectedPartCount,
        sheet:{w:candidate.w,h:candidate.h},
        frame:runBest.frame,
        validation:runBest.validation
      };
      if(betterNestingCandidate(current,bestOverall))bestOverall=current;
    }
  }
  try{SvgNest.stop()}catch(_){}
  state.running=false;$("nestButton").disabled=false;$("stopButton").disabled=true;
  if(bestOverall){
    const complete=Boolean(bestOverall.validation&&bestOverall.validation.valid&&bestOverall.placed>=state.expectedPartCount);
    const meta={
      material:$("material").value,
      thickness:readNumber("thickness",3),
      sheetW:bestOverall.sheet.w,
      sheetH:bestOverall.sheet.h,
      margin:readNumber("margin",10),
      gap:readNumber("gap",2),
      efficiency:bestOverall.efficiency,
      placed:bestOverall.placed,
      total:state.expectedPartCount,
      complete,
      validation:bestOverall.validation||null
    };
    state.resultSvgs=bestOverall.results;
    state.bestResultSvgs=bestOverall.results;
    state.bestResultMeta=meta;
    state.resultMeta=meta;
    renderResults(bestOverall.results,bestOverall.efficiency,bestOverall.placed,bestOverall.total,bestOverall.sheet,{mode:"final",frame:bestOverall.frame,isBest:complete});
     finalizeDiagnostics(bestOverall.results);
    if(complete){
      $("runInfo").textContent="Готово · "+bestOverall.results.length+" лист(ов) · "+bestOverall.placed+"/"+state.expectedPartCount+" деталей · "+Math.round(bestOverall.efficiency*100)+"% заполнение · просмотрено "+state.searchFrames+" вариантов";
      status("Раскрой рассчитан");
    }else{
      const missing=Math.max(0,state.expectedPartCount-bestOverall.placed);
      $("runInfo").textContent="Частичный результат · "+bestOverall.results.length+" лист(ов) · "+bestOverall.placed+"/"+state.expectedPartCount+" деталей · не размещено: "+missing;
      status("Частичный раскрой");
    }
    $("progressBar").style.width="100%";
  }else{
    finalizeDiagnostics([],"no-valid-result");
    $("runInfo").textContent="Допустимую раскладку не удалось найти.";
    status("Нет результата");
  }
}

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
$("nestButton").addEventListener("click",()=>{const runner=window.SheetNestRemnants?.run||runSearch;Promise.resolve().then(()=>runner()).catch(err=>{state.running=false;try{SvgNest.stop()}catch(_){}$("nestButton").disabled=false;$("stopButton").disabled=true;status("Ошибка");alert(err.message)})});
$("stopButton").addEventListener("click",()=>{state.runId+=1;state.running=false;try{SvgNest.stop()}catch(_){}$("nestButton").disabled=false;$("stopButton").disabled=true;$("runInfo").textContent="Поиск остановлен. Показан лучший найденный вариант.";status("Остановлено");$("progressBar").style.width="100%"});
$("downloadButton").addEventListener("click",()=>{if(!state.resultSvgs.length||!state.resultMeta)return;const prepared=state.resultSvgs.map((item,index)=>{const clone=item.cloneNode(true);decorateResultSvg(clone,state.resultMeta,index);return new XMLSerializer().serializeToString(clone)}).join("\n");const out=`<svg xmlns="http://www.w3.org/2000/svg">${prepared}</svg>`;const blob=new Blob([out],{type:"image/svg+xml;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="sheetnest-metal-layout.svg";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});

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
window.state=state;
