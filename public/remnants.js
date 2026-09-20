/* SheetNest business remnants: real polygon storage, mixed nesting and 90° minimum-size validation. */
(function(){
  "use strict";

  const STORE="sheetnest.business-remnants.v2";
  const SCALE=1000;
  const EPS=0.01;

  function num(id,fallback){const el=document.getElementById(id);const n=el?Number(el.value):NaN;return Number.isFinite(n)?n:fallback}
  function enabled(id, fallback){const el=document.getElementById(id);return el?el.checked:fallback}
  function load(){try{const v=JSON.parse(localStorage.getItem(STORE)||"[]");return Array.isArray(v)?v:[]}catch(_){return[]}}
  function save(items){localStorage.setItem(STORE,JSON.stringify(items));updateCount(items.length)}
  function updateCount(n){const el=document.getElementById("remnantCount");if(el)el.textContent=n+" сохранено"}

  function clonePoints(p){return p.map(x=>({x:Number(x.X??x.x),y:Number(x.Y??x.y)})).filter(x=>Number.isFinite(x.x)&&Number.isFinite(x.y))}
  function bounds(poly){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    poly.forEach(p=>{minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y)});
    return {minX,minY,maxX,maxY,width:Math.max(0,maxX-minX),height:Math.max(0,maxY-minY)}
  }
  function area(poly){
    let s=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];s+=a.x*b.y-b.x*a.y}return Math.abs(s)/2
  }
  function toClip(poly){return poly.map(p=>({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}))}
  function fromClip(poly){return poly.map(p=>({x:p.X/SCALE,y:p.Y/SCALE}))}
  function clipDifference(subject,clip){
    if(!subject.length)return[];
    const c=new ClipperLib.Clipper(),solution=[];
    c.AddPaths(subject.map(toClip),ClipperLib.PolyType.ptSubject,true);
    if(clip&&clip.length)c.AddPaths(clip.map(toClip),ClipperLib.PolyType.ptClip,true);
    c.Execute(ClipperLib.ClipType.ctDifference,solution,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);
    return solution.map(fromClip).filter(p=>p.length>=3&&area(p)>EPS);
  }
  function normalize(poly){
    const b=bounds(poly);return {polygon:poly.map(p=>({x:p.x-b.minX,y:p.y-b.minY})),bounds:b}
  }

  function minkowskiFit(poly,w,h){
    if(!window.ClipperLib||!ClipperLib.Clipper||!ClipperLib.Clipper.MinkowskiDiff)return null;
    const rect=[
      {x:-w/2,y:-h/2},{x:w/2,y:-h/2},{x:w/2,y:h/2},{x:-w/2,y:h/2}
    ];
    const result=ClipperLib.Clipper.MinkowskiDiff(toClip(poly),toClip(rect));
    if(!result||!result.length)return null;
    for(const p of result){
      const q=fromClip(p);
      if(q.length>=3&&area(q)>EPS)return q;
    }
    return null;
  }

  function pointInPolygon(point,poly){
    let inside=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i],b=poly[j];
      const hit=((a.y>point.y)!=(b.y>point.y)) &&
        point.x < (b.x-a.x)*(point.y-a.y)/(b.y-a.y+Number.EPSILON)+a.x;
      if(hit)inside=!inside;
    }
    return inside;
  }
  function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)}
  function segIntersect(a,b,c,d){
    const c1=cross(a,b,c),c2=cross(a,b,d),c3=cross(c,d,a),c4=cross(c,d,b);
    const s=(x)=>Math.abs(x)<1e-7;
    if(s(c1)&&s(c2)&&s(c3)&&s(c4)){
      return !(Math.max(a.x,b.x)<Math.min(c.x,d.x)-EPS||Math.min(a.x,b.x)>Math.max(c.x,d.x)+EPS||Math.max(a.y,b.y)<Math.min(c.y,d.y)-EPS||Math.min(a.y,b.y)>Math.max(c.y,d.y)+EPS)
    }
    return ((c1>0)!=(c2>0))&&((c3>0)!=(c4>0))
  }
  function rectangleFits(poly,w,h,x,y){
    const r=[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
    if(!r.every(p=>pointInPolygon(p,poly)))return false;
    for(let i=0;i<r.length;i++){
      const a=r[i],b=r[(i+1)%r.length];
      for(let j=0;j<poly.length;j++){
        if(segIntersect(a,b,poly[j],poly[(j+1)%poly.length]))return false;
      }
    }
    return true;
  }
  function scanFit(poly,w,h){
    const b=bounds(poly);
    if(b.width+EPS<w||b.height+EPS<h)return null;
    const xs=[b.minX,b.maxX-w,...poly.map(p=>p.x),...poly.map(p=>p.x-w)].filter(Number.isFinite);
    const ys=[b.minY,b.maxY-h,...poly.map(p=>p.y),...poly.map(p=>p.y-h)].filter(Number.isFinite);
    const candidates=[];
    for(const x of xs)for(const y of ys)candidates.push([x,y]);
    const step=Math.max(10,Math.min(w,h)/8);
    for(let x=b.minX;x<=b.maxX-w+EPS;x+=step)for(let y=b.minY;y<=b.maxY-h+EPS;y+=step)candidates.push([x,y]);
    for(const [x,y] of candidates)if(rectangleFits(poly,w,h,x,y))return{x,y,width:w,height:h};
    return null;
  }

  function fitOrientation(poly,w,h,gap){
    const rw=w+Math.max(0,gap),rh=h+Math.max(0,gap);
    const eroded=minkowskiFit(poly,rw,rh);
    if(eroded)return{fit:true,orientation:w>=h?0:90,width:w,height:h,probe:eroded[0]};
    const fallback=scanFit(poly,rw,rh);
    return fallback?{fit:true,orientation:w>=h?0:90,width:w,height:h,probe:fallback}:{fit:false,orientation:w>=h?0:90,width:w,height:h};
  }
  function classify(poly,minL,minW,gap){
    const a=fitOrientation(poly,minL,minW,gap);
    if(a.fit)return{business:true,orientation:0,fit:a};
    const b=fitOrientation(poly,minW,minL,gap);
    if(b.fit)return{business:true,orientation:90,fit:b};
    return{business:false,orientation:null,fit:null};
  }

  function polygonifyElement(el){
    try{
      const p=SvgParser.polygonify(el);
      if(Array.isArray(p)&&p.length>=3)return clonePoints(p);
    }catch(_){}
    return null;
  }

  function freePolygonsFromSvg(svg){
    const doc=svg.cloneNode(true);
    const root=doc;
    const bin=root.querySelector("#sheet-bin,.bin");
    const sheetPoly=bin?polygonifyElement(bin):null;
    if(!sheetPoly)return[];
    let free=[sheetPoly];
    const occupied=[];
    root.querySelectorAll("[data-sheetnest-unit-id]").forEach(el=>{
      if(el===bin)return;
      const p=polygonifyElement(el);
      if(p)occupied.push(p);
    });
    for(const p of occupied){
      free=free.flatMap(f=>clipDifference([f],[p]));
      if(!free.length)break;
    }
    return free.map(normalize).map(x=>x.polygon).filter(p=>area(p)>1);
  }

  function capture(results,meta){
    if(!enabled("saveRemnants",true))return[];
    const minStore=Math.max(10,Math.min(num("remnantMinLength",500),num("remnantMinWidth",300))*0.25);
    const items=load();
    const created=[];
    (results||[]).forEach((svg,si)=>{
      for(const poly0 of freePolygonsFromSvg(svg)){
        const b=bounds(poly0);
        if(b.width<minStore||b.height<minStore)continue;
        const item={
          id:"REM-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7),
          material:meta.material,thickness:Number(meta.thickness||0),
          sourceSheetId:"SHEET-"+(si+1),sourceJobId:String(state.runId||Date.now()),
          polygon:poly0,area:area(poly0),bbox:{width:b.width,height:b.height},
          createdAt:new Date().toISOString(),status:"available"
        };
        items.push(item);created.push(item);
      }
    });
    const dedup=items.filter((item,i,a)=>a.findIndex(x=>x.id===item.id)===i).slice(-200);
    save(dedup);
    return created;
  }

  function compatible(rem){
    const material=(document.getElementById("material")?.value||"").trim();
    const thickness=num("thickness",3);
    return rem.status!=="consumed"&&rem.material===material&&Math.abs(Number(rem.thickness)-thickness)<1e-6;
  }

  function allInstances(){
    const out=[];
    state.customParts.forEach(part=>{
      const q=normalizedQuantity(part);
      for(let i=1;i<=q;i++)out.push({instanceId:part.id+"#"+i,kind:"custom",part,copy:i});
    });
    state.libraryParts.forEach(part=>{
      const shape=SHAPE_LIBRARY.find(s=>s.id===part.id);if(!shape)return;
      for(let i=1;i<=normalizedQuantity(part);i++)out.push({instanceId:"library-"+shape.id+"#"+i,kind:"library",part,shape,copy:i});
    });
    return out;
  }

  function stageInstances(root,instances,w,h){
    const stage={nextX:0,nextY:0,rowHeight:0,gap:Math.max(20,readNumber("gap",2)*20),maxWidth:Math.max(10000,w*20,100000)};
    const ns="http://www.w3.org/2000/svg";
    for(const item of instances){
      if(item.kind==="custom"){
        const elements=sourceElements(item.part.svgText),bounds=estimateSvgBounds(item.part.svgText);
        appendStagedInstance(root,elements,bounds,item.instanceId,item.part.id,stage.nextX,stage.nextY);
        stage.nextX+=bounds.width+stage.gap;stage.rowHeight=Math.max(stage.rowHeight,bounds.height);
      }else{
        const shape=item.shape,bounds={minX:0,minY:0,width:Math.max(1,shape.w),height:Math.max(1,shape.h)};
        const g=document.createElementNS(ns,"g");g.setAttribute("data-sheetnest-stage-instance",item.instanceId);g.setAttribute("data-sheetnest-shape",shape.id);g.setAttribute("transform","translate("+stage.nextX+" "+stage.nextY+")");
        const path=document.createElementNS(ns,"path");path.setAttribute("d",shapePath(shape));path.setAttribute("fill","none");path.setAttribute("stroke","black");path.setAttribute("stroke-width",".2");stampNestingSource(path,item.instanceId,shape.id);g.appendChild(path);root.appendChild(g);
        stage.nextX+=bounds.width+stage.gap;stage.rowHeight=Math.max(stage.rowHeight,bounds.height);
      }
      if(stage.nextX>stage.maxWidth){stage.nextX=0;stage.nextY+=stage.rowHeight+stage.gap;stage.rowHeight=0}
    }
  }

  function buildBinSvg(poly,instances){
    const b=bounds(poly),norm=poly.map(p=>({x:p.x-b.minX,y:p.y-b.minY}));
    const root=document.createElementNS("http://www.w3.org/2000/svg","svg");
    root.setAttribute("xmlns","http://www.w3.org/2000/svg");root.setAttribute("viewBox","0 0 "+Math.max(1,b.width)+" "+Math.max(1,b.height));
    const path=document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("id","sheet-bin");path.setAttribute("d","M "+norm.map(p=>p.x+" "+p.y).join(" L ")+" Z");root.appendChild(path);
    stageInstances(root,instances,b.width,b.height);
    return new XMLSerializer().serializeToString(root);
  }
  function buildRectSvg(w,h,instances){
    const root=document.createElementNS("http://www.w3.org/2000/svg","svg");root.setAttribute("xmlns","http://www.w3.org/2000/svg");root.setAttribute("viewBox","0 0 "+w+" "+h);
    const bin=document.createElementNS("http://www.w3.org/2000/svg","rect");bin.setAttribute("id","sheet-bin");bin.setAttribute("x","0");bin.setAttribute("y","0");bin.setAttribute("width",w);bin.setAttribute("height",h);root.appendChild(bin);
    stageInstances(root,instances,w,h);return new XMLSerializer().serializeToString(root);
  }

  function mapParsedUnits(parsed){
    const map={};
    parsed.querySelectorAll("[data-sheetnest-unit-id]").forEach(el=>{
      const uid=el.getAttribute("data-sheetnest-unit-id"),iid=el.getAttribute("data-sheetnest-source-instance-id");
      if(uid&&iid)map[uid]=iid;
    });
    return map;
  }
  function placedInstances(results,map,expected){
    const counts={};
    (results||[]).forEach(svg=>svg.querySelectorAll("[data-sheetnest-unit-id]").forEach(el=>{
      const iid=map[el.getAttribute("data-sheetnest-unit-id")];if(iid)counts[iid]=(counts[iid]||0)+1;
    }));
    const out=[];
    for(const [iid,n] of Object.entries(counts))if(n>=Number(expected[iid]||1))out.push(iid);
    return out;
  }
  function scoreCandidate(a,b){
    if(!b)return true;
    if(a.placed!==b.placed)return a.placed>b.placed;
    if(a.complete!==b.complete)return a.complete;
    if(a.sheets!==b.sheets)return a.sheets<b.sheets;
    return a.efficiency>b.efficiency;
  }

  async function runBin(poly,instances,label){
    if(!instances.length)return null;
    const q=qualityConfig();
    const seconds=Math.max(3,Math.min(12,q.seconds/3));
    const svgText=buildBinSvg(poly,instances);
    SvgNest.stop();
    SvgNest.config({spacing:readNumber("gap",2),rotations:Math.max(1,Math.floor(readNumber("rotations",2))),populationSize:q.populationSize,mutationRate:q.mutationRate,curveTolerance:.2,useHoles:true,exploreConcave:true});
    const parsed=SvgNest.parsesvg(svgText),bin=parsed.querySelector("#sheet-bin");
    if(!bin)return null;
    const unitMap=mapParsedUnits(parsed),expected={};
    instances.forEach(x=>expected[x.instanceId]=Number(x.part.nestingUnits||1));
    Object.entries(unitMap).forEach(([u,i])=>{
      if(!expected[i])expected[i]=1;
      state.unitToInstance[u]=i;
      const entry=state.instanceDiagnostics&&state.instanceDiagnostics[i];
      if(entry&&entry.unitIds.indexOf(u)<0)entry.unitIds.push(u);
    });
    instances.forEach(x=>{
      const entry=state.instanceDiagnostics&&state.instanceDiagnostics[x.instanceId];
      if(entry){entry.staged=true;entry.stage=label==="remnant"?"Деловой остаток":"Новый лист";entry.status="candidate";entry.issue="Передана в "+(label==="remnant"?"остаток":"новый лист")+"."}
    });
    SvgNest.setbin(bin);
    let best=null;
    return await new Promise(resolve=>{
      let timer=null;
      const finish=()=>{if(timer)clearInterval(timer);try{SvgNest.stop()}catch(_){}resolve(best)};
      SvgNest.start(()=>{},(svglist,efficiency,placed)=>{
        if(!svglist||!svglist.length)return;
        const ids=placedInstances(svglist,unitMap,expected);
        const cand={results:svglist,efficiency:Number(efficiency||0),placed:ids.length,total:instances.length,sheets:svglist.length,complete:ids.length===instances.length,unitMap,placedIds:ids};
        if(scoreCandidate(cand,best))best=cand;
      });
      timer=setTimeout(finish,seconds*1000);
    });
  }

  function setDiagForStage(ids,stage){
    const set=new Set(ids);
    diagnosticEntries().forEach(e=>{
      if(set.has(e.instanceId)){e.stage=stage;e.status=e.status==="placed"?"placed":"tested";e.issue=""}
    });
  }

  function ensureRemnantStyles(){
    if(document.getElementById("sheetnest-remnant-overlay-style"))return;
    const style=document.createElement("style");style.id="sheetnest-remnant-overlay-style";
    style.textContent=`
      .remnant-layer-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;padding:10px 12px;border:1px solid #263a2d;border-radius:9px;background:rgba(44,126,73,.08);color:#b8c9bd;font-size:11px}
      .remnant-layer-left{display:flex;align-items:center;gap:10px}.remnant-layer-left strong{color:#d7e7db}.remnant-layer-left span{color:#7f9485}
      .remnant-layer-toggle{border:1px solid #3e7650;background:#183021;color:#bfe8c9;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:11px}
      .remnant-layer-toggle.off{background:transparent;color:#7f8b83;border-color:#39423d}
      .remnant-legend{display:flex;align-items:center;gap:6px;color:#829188}.remnant-legend i{display:block;width:12px;height:12px;border-radius:3px;background:rgba(48,190,91,.22);border:2px solid #42d477}
      .remnant-result .sheet-svg{background:rgba(20,28,23,.18)}
      .remnant-overlay{pointer-events:none}.remnant-overlay-shape{fill:rgba(48,190,91,.20);stroke:#42d477;stroke-width:2;vector-effect:non-scaling-stroke;stroke-dasharray:7 4}
      .remnant-overlay-label{font-family:Arial,sans-serif;font-size:18px;font-weight:700;fill:#9af0b5;paint-order:stroke;stroke:#102116;stroke-width:5px;stroke-linejoin:round}
      .remnant-overlay-meta{font-family:Arial,sans-serif;font-size:12px;fill:#d1f5da;paint-order:stroke;stroke:#102116;stroke-width:4px;stroke-linejoin:round}
      .remnant-list{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}.remnant-chip{padding:6px 8px;border:1px solid #304237;border-radius:6px;background:rgba(255,255,255,.025);color:#aebbb2;font-size:10px}.remnant-chip b{color:#d7eadc}
    `;
    document.head.appendChild(style);
  }

  function remnantOverlayGroup(svg,remnant,index){
    if(!svg||!remnant||!Array.isArray(remnant.polygon)||remnant.polygon.length<3)return null;
    const b=bounds(remnant.polygon);if(!Number.isFinite(b.width)||!Number.isFinite(b.height))return null;
    const vb=(svg.getAttribute("viewBox")||"0 0 "+b.width+" "+b.height).split(/[ ,]+/).map(Number);
    const ox=Number.isFinite(vb[0])?vb[0]:0,oy=Number.isFinite(vb[1])?vb[1]:0;
    const ns="http://www.w3.org/2000/svg",g=document.createElementNS(ns,"g");g.classList.add("remnant-overlay");g.setAttribute("data-remnant-overlay",remnant.id||String(index));
    const points=remnant.polygon.map(p=>(p.x-b.minX+ox)+","+(p.y-b.minY+oy)).join(" ");
    const shape=document.createElementNS(ns,"polygon");shape.setAttribute("points",points);shape.classList.add("remnant-overlay-shape");g.appendChild(shape);
    const fit=classify(remnant.polygon,num("remnantMinLength",500),num("remnantMinWidth",300),Number(document.getElementById("gap")?.value||2));
    const cx=b.minX+(b.width/2)+ox,cy=b.minY+(b.height/2)+oy;
    const label=document.createElementNS(ns,"text");label.setAttribute("x",cx);label.setAttribute("y",cy-8);label.setAttribute("text-anchor","middle");label.classList.add("remnant-overlay-label");label.textContent=remnant.displayId||("REM-"+String(index+1).padStart(3,"0"));g.appendChild(label);
    const meta=document.createElementNS(ns,"text");meta.setAttribute("x",cx);meta.setAttribute("y",cy+13);meta.setAttribute("text-anchor","middle");meta.classList.add("remnant-overlay-meta");meta.textContent=Math.round(b.width)+" × "+Math.round(b.height)+" мм · "+(fit.orientation===90?"90°":"0°");g.appendChild(meta);
    return g;
  }

  function addRemnantLayerControls(wrap,remnants){
    ensureRemnantStyles();
    const tools=document.createElement("div");tools.className="remnant-layer-tools";
    const left=document.createElement("div");left.className="remnant-layer-left";
    left.innerHTML="<strong>Слой деловых остатков</strong><span>Реальная геометрия · размеры · ориентация</span>";
    const legend=document.createElement("div");legend.className="remnant-legend";legend.innerHTML="<i></i><span>Деловой остаток</span>";
    const toggle=document.createElement("button");toggle.type="button";toggle.className="remnant-layer-toggle";toggle.textContent="Скрыть слой";
    toggle.addEventListener("click",()=>{const hidden=wrap.classList.toggle("remnant-layer-hidden");wrap.querySelectorAll(".remnant-overlay").forEach(g=>g.style.display=hidden?"none":"");toggle.classList.toggle("off",hidden);toggle.textContent=hidden?"Показать слой":"Скрыть слой"});
    const right=document.createElement("div");right.style.display="flex";right.style.alignItems="center";right.style.gap="12px";right.appendChild(legend);right.appendChild(toggle);
    tools.appendChild(left);tools.appendChild(right);wrap.appendChild(tools);
    const list=document.createElement("div");list.className="remnant-list";
    remnants.forEach((rem,i)=>{const b=bounds(rem.polygon||[]),chip=document.createElement("div");chip.className="remnant-chip";chip.innerHTML="<b>"+(rem.displayId||("REM-"+String(i+1).padStart(3,"0")))+"</b> · "+Math.round(b.width)+" × "+Math.round(b.height)+" мм";list.appendChild(chip)});
    if(remnants.length)wrap.appendChild(list);
  }

  function renderMixed(remnantResults,newResults,meta,placed,total){
    state.remnantResultSvgs=remnantResults.flatMap(x=>x.results||[]);
    const wrap=$("canvasWrap");wrap.innerHTML="";
    const visibleRemnants=remnantResults.map((x,i)=>{const r={...(x.remnant||{})};r.displayId="REM-"+String(i+1).padStart(3,"0");return r});
    if(visibleRemnants.length)addRemnantLayerControls(wrap,visibleRemnants);
    const addCard=(svg,title,remnant,remnantIndex)=>{
      const card=document.createElement("div");card.className="result-card"+(remnant?" remnant-result":"");
      const head=document.createElement("div");head.className="result-title";
      const rb=remnant&&remnant.polygon?bounds(remnant.polygon):null;
      const rcheck=remnant&&rb?classify(remnant.polygon,num("remnantMinLength",500),num("remnantMinWidth",300),meta.gap):null;
      const dim=rb?Math.round(rb.width)+" × "+Math.round(rb.height)+" мм":"";
      const ori=rcheck&&rcheck.business?(rcheck.orientation===90?" · 90°":" · 0°"):"";
      head.innerHTML="<strong>"+title+"</strong><span>"+(remnant?"Деловой остаток · "+dim+ori:"Новый металлический лист")+"</span>";
      const clone=svg.cloneNode(true);clone.classList.add("sheet-svg");clone.removeAttribute("width");clone.removeAttribute("height");
      if(remnant){const overlay=remnantOverlayGroup(clone,remnant,remnantIndex);if(overlay)clone.appendChild(overlay)}else decorateResultSvg(clone,meta,wrap.children.length);
      card.appendChild(head);card.appendChild(clone);
      const summary=document.createElement("div");summary.className="sheet-summary";
      summary.innerHTML="<span>"+(remnant?"Реальная геометрия остатка":"Новый лист")+" · зазор: <strong>"+meta.gap+" мм</strong></span>"+(remnant&&rcheck?'<span class="remnant-fit-badge">Минимум '+num("remnantMinLength",500)+" × "+num("remnantMinWidth",300)+" · "+(rcheck.business?"проходит":"не проходит")+"</span>":"");
      card.appendChild(summary);wrap.appendChild(card);
    };
    let remIndex=0;
    remnantResults.forEach((x,i)=>x.results.forEach((svg,j)=>{addCard(svg,""+(visibleRemnants[i]?.displayId||("REM-"+String(i+1).padStart(3,"0")))+" · раскрой "+(j+1),visibleRemnants[i],remIndex++); }));
    newResults.forEach((svg,i)=>addCard(svg,"Новый лист "+(i+1),null,-1));
    $("statSheets").textContent=remnantResults.reduce((n,x)=>n+x.results.length,0)+newResults.length;
    $("statParts").textContent=placed;$("statEfficiency").textContent=total?Math.round(placed/total*100)+"%":"0%";
    applyCanvasZoom();
  }

  async function mixedRun(){
    if(!state.customParts.length&&!state.libraryParts.length)throw new Error("Загрузите один или несколько DXF/SVG или добавьте типовую деталь.");
    const originalInstances=allInstances();if(!originalInstances.length)throw new Error("Количество деталей должно быть больше нуля.");
    const originalRun=state.runId;state.runId=originalRun+1;state.expectedPartCount=originalInstances.length;state.nestingManifest=createNestingManifest();state.lastValidation=null;
    initializeInstanceDiagnostics();
    const remaining=new Map(originalInstances.map(x=>[x.instanceId,x]));
    const usedResults=[],testedRemnantIds=new Set();
    const minL=num("remnantMinLength",500),minW=num("remnantMinWidth",300),gap=num("gap",2);
    let remnants=load().filter(compatible);
    remnants=remnants.filter(r=>classify(r.polygon,minL,minW,gap).business);
    remnants.sort((a,b)=>b.area-a.area);
    if(enabled("useRemnants",true)){
      for(const rem of remnants){
        if(!remaining.size)break;
        const instances=[...remaining.values()];
        const run=await runBin(rem.polygon,instances,"remnant");
        testedRemnantIds.add(rem.id);
        if(!run||!run.placedIds.length)continue;
        run.placedIds.forEach(id=>remaining.delete(id));
        usedResults.push({remnant:rem,results:run.results});
        rem.status=remaining.size?"available":"available";
        setDiagForStage(run.placedIds,"Деловой остаток");
      }
    }

    let newResults=[];
    if(remaining.size){
      const sheet=getSheet();
      const orientations=sheet.auto?[{w:sheet.w,h:sheet.h},{w:sheet.h,h:sheet.w}]:[{w:sheet.w,h:sheet.h}];
      let best=null;
      for(const s of orientations){
        const run=await runBin((()=>[{x:0,y:0},{x:s.w,y:0},{x:s.w,y:s.h},{x:0,y:s.h}])(),[...remaining.values()],"new-sheet");
        if(run&&(!best||scoreCandidate(run,best)))best=run;
      }
      if(best){
        best.placedIds.forEach(id=>remaining.delete(id));newResults=best.results;
        setDiagForStage(best.placedIds,"Новый лист");
      }
    }

    const placed=originalInstances.length-remaining.size,total=originalInstances.length;
    const meta={material:document.getElementById("material").value,thickness:num("thickness",3),sheetW:getSheet().w,sheetH:getSheet().h,margin:num("margin",10),gap,efficiency:total?placed/total:0,placed,total};
    state.resultSvgs=newResults;state.bestResultSvgs=newResults;state.resultMeta=meta;state.bestResultMeta=meta;
    const allRaw=usedResults.flatMap(x=>x.results).concat(newResults);
    if(enabled("saveRemnants",true)){
      const generated=[];
      if(newResults.length)generated.push(...capture(newResults,meta));
      for(const used of usedResults){
        const child=capture(used.results,meta);
        const storedAfterCapture=load();
        child.forEach(x=>{
          x.parentRemnantId=used.remnant.id;
          const savedChild=storedAfterCapture.find(y=>y.id===x.id);
          if(savedChild)savedChild.parentRemnantId=used.remnant.id;
        });
        if(child.length)save(storedAfterCapture);
        generated.push(...child);
        used.remnant.status="consumed";
      }
      if(usedResults.length){
        const stored=load();
        usedResults.forEach(used=>{const item=stored.find(x=>x.id===used.remnant.id);if(item)item.status="consumed"});
        save(stored);
      }
    }
    const finalPlacedIds=new Set();
    allRaw.forEach(svg=>svg.querySelectorAll("[data-sheetnest-unit-id]").forEach(el=>{
      const uid=el.getAttribute("data-sheetnest-unit-id"),iid=state.unitToInstance[uid];if(iid)finalPlacedIds.add(uid);
    }));
    diagnosticEntries().forEach(e=>{
      e.finalUnitIds=e.unitIds.filter(u=>finalPlacedIds.has(u));
      if(e.finalUnitIds.length>=e.expectedUnits){e.status="placed";e.stage=e.stage||"Финальный результат";e.issue=""}
      else if(e.stage==="Деловой остаток"||e.stage==="Новый лист"){e.status="lost";e.issue="Деталь проверена в смешанном раскрое, но не вошла в финальный результат."}
      else{e.status="lost";e.stage="Смешанный раскрой";e.issue="Не размещена."}
    });
    renderMixed(usedResults,newResults,meta,placed,total);
    window.SheetNestDxf?.update?.();
    renderDiagnosticsPanel(true);
    $("progressBar").style.width="100%";
    $("runInfo").textContent=remaining.size?"Частичный смешанный раскрой · не размещено: "+remaining.size:"Готово · деловые остатки: "+usedResults.length+" · новых листов: "+newResults.length+" · размещено: "+placed+"/"+total;
    status(remaining.size?"Частичный раскрой":"Раскрой рассчитан");
    updateCount(load().length);
    $("downloadButton").disabled=newResults.length===0;
    return {remaining};
  }

  function init(){
    updateCount(load().length);
    ["remnantMinLength","remnantMinWidth","gap"].forEach(id=>document.getElementById(id)?.addEventListener("input",()=>{
      const l=num("remnantMinLength",500),w=num("remnantMinWidth",300),h=document.getElementById("remnantHint");
      if(h)h.textContent="Проверяются обе ориентации: "+l+"×"+w+" и "+w+"×"+l+" мм.";
    }));
    const original=window.runSearch;
    if(typeof original!=="function")return;
    try{runSearch=mixedRun}catch(_){window.runSearch=mixedRun;}
    $("nestButton")?.addEventListener("click",()=>{});
  }
  init();
  window.SheetNestRemnants={load,save,classify,capture,freePolygonsFromSvg,run:mixedRun,renderMixed};
})();