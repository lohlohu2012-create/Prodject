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
    try{
      if(!Array.isArray(subject)||!subject.length||!window.ClipperLib)return[];
      const c=new ClipperLib.Clipper(),solution=[];
      c.AddPaths(subject.map(toClip),ClipperLib.PolyType.ptSubject,true);
      if(Array.isArray(clip)&&clip.length)c.AddPaths(clip.map(toClip),ClipperLib.PolyType.ptClip,true);
      c.Execute(ClipperLib.ClipType.ctDifference,solution,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);
      return solution.map(fromClip).filter(p=>p.length>=3&&area(p)>EPS);
    }catch(err){
      console.warn("SheetNest: remnant geometry difference skipped",err);
      return[];
    }
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

  // Жёсткая проверка сохранённого делового остатка перед передачей в SvgNest.
  // Невалидная геометрия автоматически исключается из текущего расчёта.
  function validateRemnantForNesting(rem,minL,minW,gap,sheet){
    try{
      if(!rem||!Array.isArray(rem.polygon))return{valid:false,reason:"polygon отсутствует"};
      const poly=rem.polygon.map(p=>({x:Number(p?.x??p?.X),y:Number(p?.y??p?.Y)}));
      if(poly.length<3)return{valid:false,reason:"меньше 3 точек"};
      if(poly.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return{valid:false,reason:"нечисловые координаты"};

      const eps=1e-6;
      for(let i=0;i<poly.length;i++){
        const a=poly[i],b=poly[(i+1)%poly.length];
        if(Math.hypot(a.x-b.x,a.y-b.y)<=eps)return{valid:false,reason:"нулевой сегмент"};
      }

      const polyArea=area(poly);
      if(!Number.isFinite(polyArea)||polyArea<=EPS)return{valid:false,reason:"нулевая/повреждённая площадь"};

      const b=bounds(poly);
      if(!Number.isFinite(b.width)||!Number.isFinite(b.height)||b.width<=EPS||b.height<=EPS){
        return{valid:false,reason:"повреждённые габариты"};
      }

      // Самопересечение обычно приводит к некорректному bin/path при построении SVG.
      for(let i=0;i<poly.length;i++){
        const a1=poly[i],a2=poly[(i+1)%poly.length];
        for(let j=i+1;j<poly.length;j++){
          const adjacent=j===i+1 || (i===0 && j===poly.length-1);
          if(adjacent)continue;
          const b1=poly[j],b2=poly[(j+1)%poly.length];
          if(segIntersect(a1,a2,b1,b2))return{valid:false,reason:"самопересекающийся контур"};
        }
      }

      const fit=classify(poly,minL,minW,gap);
      if(!fit.business)return{valid:false,reason:"не проходит критерий делового остатка"};

      // Если доступен текущий лист, остаток не должен быть физически больше него.
      if(sheet){
        const sw=Number(sheet.w),sh=Number(sheet.h);
        if(Number.isFinite(sw)&&Number.isFinite(sh) &&
          ((b.width>sw+EPS&&b.height>sh+EPS)&&(b.width>sh+EPS||b.height>sw+EPS))){
          return{valid:false,reason:"остаток больше текущего листа"};
        }
      }

      // Финальная проверка через тот же SVG-путь, который пойдёт в SvgNest.
      const probeSvg=buildBinSvg(poly,[]);
      const parsed=SvgNest.parsesvg(probeSvg);
      const bin=parsed?.querySelector?.("#sheet-bin,.bin");
      if(!bin)return{valid:false,reason:"SvgNest не создал bin"};
      const parsedPoly=polygonifyElement(bin);
      const parsedArea=parsedPoly?area(parsedPoly):0;
      if(!parsedPoly||parsedPoly.length<3||!Number.isFinite(parsedArea)||parsedArea<=EPS){
        return{valid:false,reason:"SvgNest получил повреждённый bin"};
      }
      const areaDiff=Math.abs(parsedArea-polyArea)/Math.max(polyArea,1);
      if(areaDiff>0.01)return{valid:false,reason:"площадь bin изменилась более чем на 1%"};

      return{valid:true,reason:"ok",polygon:poly,bounds:b,area:polyArea,fit};
    }catch(err){
      console.warn("SheetNest: remnant validation failed",err);
      return{valid:false,reason:"исключение при проверке"};
    }
  }

  function polygonifyElement(el){
    try{
      const p=SvgParser.polygonify(el);
      if(Array.isArray(p)&&p.length>=3)return clonePoints(p);
    }catch(_){}
    return null;
  }

  function freePolygonsFromSvg(svg){
    try{
      if(!svg||typeof svg.cloneNode!=="function")return[];
      const root=svg.cloneNode(true);
      const bin=root.querySelector("#sheet-bin,.bin");
      const sheetPoly=bin?polygonifyElement(bin):null;
      if(!sheetPoly)return[];
      let free=[sheetPoly];
      const occupied=[];
      // Для разности нужны именно геометрические группы деталей.
      // Не считаем сам #sheet-bin занятой областью и не создаём остаток,
      // если движок не передал ни одной детали.
      root.querySelectorAll("g[data-sheetnest-unit-id],path[data-sheetnest-unit-id],[data-sheetnest-unit-id]").forEach(el=>{
        if(el===bin||el.closest("#sheet-bin")===bin)return;
        const p=polygonifyElement(el);
        if(p)occupied.push(p);
      });
      if(!occupied.length)return[];
      for(const p of occupied){
        free=free.flatMap(f=>clipDifference([f],[p]));
        if(!free.length)break;
      }
      return free.map(normalize).map(x=>x.polygon).filter(p=>Array.isArray(p)&&p.length>=3&&area(p)>1);
    }catch(err){
      console.warn("SheetNest: cannot extract business remnant geometry",err);
      return[];
    }
  }

  function actualFreePolygonsFromSvg(svg){
    try{
      if(!svg||typeof svg.cloneNode!=="function")return[];
      const root=svg.cloneNode(true);
      const bin=root.querySelector("#sheet-bin,.bin");
      const sheetPoly=bin?polygonifyElement(bin):null;
      if(!sheetPoly)return[];
      let free=[sheetPoly];
      const occupied=[];
      root.querySelectorAll("g[data-sheetnest-unit-id],path[data-sheetnest-unit-id],[data-sheetnest-unit-id]").forEach(el=>{
        if(el===bin||el.closest("#sheet-bin")===bin)return;
        const p=polygonifyElement(el);
        if(p)occupied.push(p);
      });
      if(!occupied.length)return[];
      for(const p of occupied){
        free=free.flatMap(f=>clipDifference([f],[p]));
        if(!free.length)break;
      }
      return free.filter(p=>Array.isArray(p)&&p.length>=3&&area(p)>1);
    }catch(err){
      console.warn("SheetNest: actual free-area extraction skipped",err);
      return[];
    }
  }

  function polygonAreaSum(polys){
    return (Array.isArray(polys)?polys:[]).reduce((sum,p)=>sum+(Array.isArray(p)?area(p):0),0);
  }

  function actualFreeOverlayGroup(svg,freePolygons,index){
    try{
      if(!svg||!Array.isArray(freePolygons)||!freePolygons.length)return null;
      const ns="http://www.w3.org/2000/svg";
      const g=document.createElementNS(ns,"g");
      g.classList.add("free-area-overlay");
      g.setAttribute("data-free-area-overlay",String(index));
      freePolygons.forEach(poly=>{
        if(!Array.isArray(poly)||poly.length<3)return;
        const points=poly.map(p=>Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y))?Number(p.x)+","+Number(p.y):null).filter(Boolean).join(" ");
        if(!points)return;
        const shape=document.createElementNS(ns,"polygon");
        shape.setAttribute("points",points);
        shape.classList.add("free-area-overlay-shape");
        g.appendChild(shape);
      });
      if(!g.childNodes.length)return null;
      const b=bounds(freePolygons.flat());
      if(Number.isFinite(b.minX)&&Number.isFinite(b.minY)){
        const label=document.createElementNS(ns,"text");
        label.setAttribute("x",b.minX+b.width/2);label.setAttribute("y",b.minY+b.height/2);
        label.setAttribute("text-anchor","middle");
        label.classList.add("free-area-overlay-label");
        label.textContent="СВОБОДНАЯ ОБЛАСТЬ";
        g.appendChild(label);
      }
      return g;
    }catch(err){
      console.warn("SheetNest: free-area overlay skipped",err);
      return null;
    }
  }

  function compareRemnantToFree(svg,remnant,freePolygons){
    try{
      const freeArea=polygonAreaSum(freePolygons);
      const bin=svg?.querySelector("#sheet-bin,.bin");
      const binPoly=bin?polygonifyElement(bin):null;
      const binArea=binPoly?area(binPoly):0;
      const remArea=Array.isArray(remnant?.polygon)?area(remnant.polygon):binArea;
      const greenArea=binArea;
      const consumed=Math.max(0,greenArea-freeArea);
      const remainingPct=greenArea>0?(freeArea/greenArea)*100:0;
      const greenContourDiffPct=greenArea>0?(Math.abs(greenArea-remArea)/greenArea)*100:0;
      const overlapArea=freeArea;
      const overlapPct=greenArea>0?Math.min(100,(overlapArea/greenArea)*100):0;
      return {
        remnantArea:remArea,
        greenArea,
        freeArea,
        consumedArea:consumed,
        remainingPct,
        overlapPct,
        greenContourDiffPct,
        exactGeometry:greenContourDiffPct<0.01
      };
    }catch(err){
      console.warn("SheetNest: remnant/free comparison skipped",err);
      return null;
    }
  }

  function capture(results,meta){
    if(!enabled("saveRemnants",true))return[];
    try{
      const minStore=Math.max(10,Math.min(num("remnantMinLength",500),num("remnantMinWidth",300))*0.25);
      const items=load(),created=[];
      (Array.isArray(results)?results:[]).forEach((svg,si)=>{
        try{
          const sheetPoly=(()=>{
            try{
              const bin=svg?.querySelector("#sheet-bin,.bin");
              return bin?polygonifyElement(bin):null;
            }catch(_){return null}
          })();
          const sheetArea=sheetPoly?area(sheetPoly):0;
          for(const poly0 of freePolygonsFromSvg(svg)){
            const b=bounds(poly0),polyArea=area(poly0);
            // Защита от сохранения всего исходного листа как "делового остатка".
            if(sheetArea>0 && polyArea/sheetArea>=0.995)continue;
            if(!Number.isFinite(b.width)||!Number.isFinite(b.height)||b.width<minStore||b.height<minStore)continue;
            // В хранилище разрешаем только геометрию, которая реально проходит
            // производственный критерий делового остатка с обеими ориентациями.
            const businessFit=classify(poly0,num("remnantMinLength",500),num("remnantMinWidth",300),num("gap",2));
            if(!businessFit.business)continue;
            const item={
              id:"REM-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7),
              material:meta?.material||"",thickness:Number(meta?.thickness||0),
              sourceSheetId:"SHEET-"+(si+1),sourceJobId:String(state.runId||Date.now()),
              polygon:poly0,area:area(poly0),bbox:{width:b.width,height:b.height},
              createdAt:new Date().toISOString(),status:"available"
            };
            items.push(item);created.push(item);
          }
        }catch(err){console.warn("SheetNest: skipped invalid remnant source sheet",si,err)}
      });
      const dedup=items.filter((item,i,a)=>a.findIndex(x=>x.id===item.id)===i).slice(-200);
      try{save(dedup)}catch(err){console.warn("SheetNest: remnant storage update skipped",err)}
      return created;
    }catch(err){
      console.warn("SheetNest: remnant capture skipped",err);
      return[];
    }
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

  async function runBin(poly,instances,label,onUpdate){
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
    let best=null,lastFrame=0,started=Date.now(),stopped=false;
    const emit=(progress,svglist,efficiency,placed,isBest)=>{
      if(typeof onUpdate!=="function")return;
      onUpdate({progress:Math.max(0,Math.min(1,Number(progress)||0)),svglist:svglist||null,efficiency:Number(efficiency||0),placed:Number(placed||0),isBest:Boolean(isBest),frame:lastFrame,label});
    };
    return await new Promise(resolve=>{
      let timer=null,watch=null;
      const finish=()=>{
        if(stopped)return;
        stopped=true;
        if(timer)clearTimeout(timer);
        if(watch)clearInterval(watch);
        try{SvgNest.stop()}catch(_){}
        emit(1,best?.results,best?.efficiency,best?.placed,true);
        resolve(best);
      };
      timer=setTimeout(finish,seconds*1000);
      try{
        SvgNest.start(
        progress=>emit(progress,best?.results,best?.efficiency,best?.placed,false),
        (svglist,efficiency,placed,isBest=false,frame=0)=>{
          if(!svglist||!svglist.length)return;
          lastFrame=Number(frame)||lastFrame+1;
          const ids=placedInstances(svglist,unitMap,expected);
          const cand={results:svglist,efficiency:Number(efficiency||0),placed:ids.length,total:instances.length,sheets:svglist.length,complete:ids.length===instances.length,unitMap,placedIds:ids,frame:lastFrame};
          if(scoreCandidate(cand,best))best=cand;
          emit(Math.min(1,(Date.now()-started)/(seconds*1000)),svglist,efficiency,ids.length,isBest);
        }
        );
      }catch(err){
        console.error("SheetNest SvgNest.start error:",err);
        finish();
      }
      watch=setInterval(()=>{
        if(!state.running)finish();
      },100);
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
      .remnant-overlay{pointer-events:none}
      .remnant-overlay-shape{fill:rgba(48,190,91,.30);fill-opacity:.30;stroke:#42d477;stroke-width:2;vector-effect:non-scaling-stroke;stroke-dasharray:7 4}
      .remnant-overlay-label{font-family:Arial,sans-serif;font-size:18px;font-weight:700;fill:#9af0b5;paint-order:stroke;stroke:#102116;stroke-width:5px;stroke-linejoin:round}
      .remnant-overlay-meta{font-family:Arial,sans-serif;font-size:12px;fill:#d1f5da;paint-order:stroke;stroke:#102116;stroke-width:4px;stroke-linejoin:round}
      .remnant-list{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}.remnant-chip{padding:6px 8px;border:1px solid #304237;border-radius:6px;background:rgba(255,255,255,.025);color:#aebbb2;font-size:10px}.remnant-chip b{color:#d7eadc}
      .free-area-overlay{pointer-events:none}.free-area-overlay-shape{fill:rgba(255,184,62,.18);stroke:#ffb83e;stroke-width:1.8;vector-effect:non-scaling-stroke;stroke-dasharray:3 3}
      .free-area-overlay-label{font-family:Arial,sans-serif;font-size:11px;font-weight:700;fill:#ffd27a;paint-order:stroke;stroke:#241b0a;stroke-width:4px;stroke-linejoin:round}
      .free-area-legend{display:flex;align-items:center;gap:6px;color:#a89a7e}.free-area-legend i{display:block;width:12px;height:12px;border-radius:3px;background:rgba(255,184,62,.18);border:2px dashed #ffb83e}
      .geometry-check{display:flex;flex-wrap:wrap;gap:7px;margin-top:7px}.geometry-check span{padding:4px 7px;border-radius:5px;border:1px solid #38423a;background:rgba(255,255,255,.025);font-size:10px;color:#9eaaa2}.geometry-check .warn{border-color:#76572a;color:#ffd27a}.geometry-check .ok{border-color:#315d40;color:#9fe1ae}
      .remnant-validation{display:flex;align-items:center;gap:8px;margin-top:8px;padding:7px 9px;border-radius:6px;border:1px solid #39443d;background:rgba(255,255,255,.025);font-size:10px}
      .remnant-validation.ok{border-color:#315d40;color:#9fe1ae}.remnant-validation.warn{border-color:#76572a;color:#ffd27a}.remnant-validation.fail{border-color:#713d3d;color:#ff9f9f}
      .remnant-validation-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex:0 0 auto}
      .remnant-validation-list{display:grid;gap:6px;margin:0 0 12px}.remnant-validation-item{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid #2f3933;border-radius:6px;background:rgba(255,255,255,.02);font-size:10px}
      .remnant-validation-item.ok{color:#9fe1ae;border-color:#315d40}.remnant-validation-item.warn{color:#ffd27a;border-color:#76572a}.remnant-validation-item.fail{color:#ff9f9f;border-color:#713d3d}
      .remnant-validation-item b{color:#d9e8dd}.remnant-validation-note{color:#849188}
    `;
    document.head.appendChild(style);
  }

  function remnantOverlayGroup(svg,remnant,index){
    try{
      if(!svg||!remnant||!Array.isArray(remnant.polygon)||remnant.polygon.length<3)return null;

      // A stored business remnant is normalized by capture() to its own
      // bounding box. runBin()/buildBinSvg() uses exactly the same polygon
      // as the bin and normalizes it the same way. Therefore the overlay
      // must be mapped to the actual #sheet-bin geometry, NOT to the whole
      // SVG viewBox. Mapping to the viewBox was the source of visible
      // stretching/offsets on non-rectangular remnants.
      const bin=svg.querySelector("#sheet-bin,.bin");
      const binPoly=bin?polygonifyElement(bin):null;
      if(!binPoly||binPoly.length<3)return null;

      const srcBounds=bounds(remnant.polygon);
      const binBounds=bounds(binPoly);
      if(!Number.isFinite(srcBounds.width)||!Number.isFinite(srcBounds.height)||
         !Number.isFinite(binBounds.width)||!Number.isFinite(binBounds.height)||
         srcBounds.width<=0||srcBounds.height<=0||binBounds.width<=0||binBounds.height<=0)return null;

      // Визуализируем фактическую геометрию #sheet-bin, которая была
      // реально передана в текущий этап раскроя. Это исключает растяжение
      // нормализованного сохранённого полигона по габаритам листа.
      const ns="http://www.w3.org/2000/svg";
      const g=document.createElementNS(ns,"g");
      g.classList.add("remnant-overlay");
      g.setAttribute("data-remnant-overlay",String(remnant.id||index));

      const points=binPoly.map(p=>{
        const x=Number(p.x),y=Number(p.y);
        return Number.isFinite(x)&&Number.isFinite(y)?x+","+y:null;
      }).filter(Boolean).join(" ");
      if(!points)return null;

      const shape=document.createElementNS(ns,"polygon");
      shape.setAttribute("points",points);
      shape.classList.add("remnant-overlay-shape");
      g.appendChild(shape);

      let orientation=0;
      try{
        const fit=classify(remnant.polygon,num("remnantMinLength",500),num("remnantMinWidth",300),Number(document.getElementById("gap")?.value||2));
        if(fit&&fit.business)orientation=fit.orientation===90?90:0;
      }catch(_){}

      const cx=binBounds.minX+binBounds.width/2;
      const cy=binBounds.minY+binBounds.height/2;
      const label=document.createElementNS(ns,"text");
      label.setAttribute("x",cx);label.setAttribute("y",cy-8);
      label.setAttribute("text-anchor","middle");
      label.classList.add("remnant-overlay-label");
      label.textContent=String(remnant.displayId||("REM-"+String(index+1).padStart(3,"0")));
      g.appendChild(label);

      const meta=document.createElementNS(ns,"text");
      meta.setAttribute("x",cx);meta.setAttribute("y",cy+13);
      meta.setAttribute("text-anchor","middle");
      meta.classList.add("remnant-overlay-meta");
      meta.textContent=Math.round(srcBounds.width)+" × "+Math.round(srcBounds.height)+" мм · "+(orientation===90?"90°":"0°");
      g.appendChild(meta);
      return g;
    }catch(err){
      console.warn("SheetNest: business remnant overlay skipped",err);
      return null;
    }
  }

  function validateRemnantOverlay(svg,remnant){
    try{
      if(!svg||!remnant||!Array.isArray(remnant.polygon)||remnant.polygon.length<3){
        return {status:"fail",ok:false,message:"Нет геометрии делового остатка."};
      }
      const bin=svg.querySelector("#sheet-bin,.bin");
      const binPoly=bin?polygonifyElement(bin):null;
      if(!binPoly||binPoly.length<3){
        return {status:"fail",ok:false,message:"Не найден контур листа/остатка #sheet-bin."};
      }
      const overlay=svg.querySelector(".remnant-overlay .remnant-overlay-shape");
      if(!overlay){
        return {status:"fail",ok:false,message:"Зелёный контур не создан."};
      }
      const points=(overlay.getAttribute("points")||"").trim().split(/\s+/).map(v=>v.split(",").map(Number)).filter(v=>v.length===2&&v.every(Number.isFinite)).map(v=>({x:v[0],y:v[1]}));
      if(points.length<3){
        return {status:"fail",ok:false,message:"Зелёный контур создан, но содержит недостаточно точек."};
      }
      const greenArea=area(points),binArea=area(binPoly),expectedArea=area(remnant.polygon);
      const areaDiff=binArea>0?Math.abs(greenArea-binArea)/binArea*100:100;
      const sourceDiff=expectedArea>0?Math.abs(greenArea-expectedArea)/expectedArea*100:100;
      const b=bounds(points),bb=bounds(binPoly);
      const bboxDiff=Math.max(bb.width,bb.height)>0?(Math.abs(b.width-bb.width)/Math.max(bb.width,bb.height)+Math.abs(b.height-bb.height)/Math.max(bb.width,bb.height))*50:100;
      const tolerance=1;
      const ok=areaDiff<=tolerance&&sourceDiff<=tolerance&&bboxDiff<=tolerance;
      return {status:ok?"ok":"warn",ok,message:ok?"Зелёный контур совпадает с геометрией остатка.":"Зелёный контур создан, но его геометрия отличается от исходного остатка.",areaDiff,sourceDiff,bboxDiff,points:points.length};
    }catch(err){
      console.warn("SheetNest: remnant overlay validation failed",err);
      return {status:"fail",ok:false,message:"Ошибка проверки зелёного контура: "+(err?.message||String(err))};
    }
  }

  function validateAllRemnantSheets(remnantResults){
    const checks=[];
    (Array.isArray(remnantResults)?remnantResults:[]).forEach((item,ri)=>{
      const remnant=item?.remnant;
      (Array.isArray(item?.results)?item.results:[]).forEach((svg,si)=>{
        const displayId=remnant?.displayId||("REM-"+String(ri+1).padStart(3,"0"));
        const check=validateRemnantOverlay(svg,remnant);
        checks.push({sheetIndex:si+1,remnantIndex:ri+1,displayId,check});
      });
    });
    return checks;
  }

  function renderRemnantValidationPanel(wrap,checks){
    if(!wrap)return;
    const list=document.createElement("div");list.className="remnant-validation-list";
    const total=checks.length,ok=checks.filter(x=>x.check?.status==="ok").length,failed=checks.filter(x=>x.check?.status==="fail").length;
    const title=document.createElement("div");title.className="remnant-validation "+(failed?"fail":ok===total?"ok":"warn");
    title.innerHTML="<span class=\"remnant-validation-dot\"></span><strong>Проверка зелёных контуров:</strong> "+ok+"/"+total+" совпадают"+(failed?" · ошибок: "+failed:"");
    list.appendChild(title);
    checks.forEach(x=>{
      const cls=x.check?.status||"fail";
      const item=document.createElement("div");item.className="remnant-validation-item "+cls;
      const details=x.check?.status==="ok"?"OK":(x.check?.message||"Проверка не пройдена");
      item.innerHTML="<span class=\"remnant-validation-dot\"></span><b>Лист "+x.sheetIndex+"</b> · "+x.displayId+" <span class=\"remnant-validation-note\">"+details+"</span>";
      list.appendChild(item);
    });
    wrap.insertBefore(list,wrap.firstChild?.nextSibling||null);
  }

  function addRemnantLayerControls(wrap,remnants){
    ensureRemnantStyles();
    const tools=document.createElement("div");tools.className="remnant-layer-tools";
    const left=document.createElement("div");left.className="remnant-layer-left";
    left.innerHTML="<strong>Геометрические слои</strong><span>остаток · фактическая свободная область</span>";
    const legend=document.createElement("div");legend.style.display="flex";legend.style.alignItems="center";legend.style.gap="12px";
    const rleg=document.createElement("span");rleg.className="remnant-legend";rleg.innerHTML="<i></i><span>Деловой остаток</span>";
    const fleg=document.createElement("span");fleg.className="free-area-legend";fleg.innerHTML="<i></i><span>Свободная область</span>";
    legend.appendChild(rleg);legend.appendChild(fleg);
    const toggle=document.createElement("button");toggle.type="button";toggle.className="remnant-layer-toggle";toggle.textContent="Скрыть слои";
    toggle.addEventListener("click",()=>{
      const hidden=wrap.classList.toggle("remnant-layers-hidden");
      wrap.querySelectorAll(".remnant-overlay,.free-area-overlay").forEach(g=>g.style.display=hidden?"none":"");
      toggle.classList.toggle("off",hidden);toggle.textContent=hidden?"Показать слои":"Скрыть слои";
    });
    const right=document.createElement("div");right.style.display="flex";right.style.alignItems="center";right.style.gap="12px";right.appendChild(legend);right.appendChild(toggle);
    tools.appendChild(left);tools.appendChild(right);wrap.appendChild(tools);
    const list=document.createElement("div");list.className="remnant-list";
    remnants.forEach((rem,i)=>{
      try{
        const b=bounds(Array.isArray(rem.polygon)?rem.polygon:[]);
        if(!Number.isFinite(b.width)||!Number.isFinite(b.height))return;
        const chip=document.createElement("div");chip.className="remnant-chip";
        chip.innerHTML="<b>"+(rem.displayId||("REM-"+String(i+1).padStart(3,"0")))+"</b> · "+Math.round(b.width)+" × "+Math.round(b.height)+" мм";
        list.appendChild(chip);
      }catch(_){}
    });
    if(remnants.length)wrap.appendChild(list);
  }


  function renderMixed(remnantResults,newResults,meta,placed,total){
    state.remnantResultSvgs=Array.isArray(remnantResults)?remnantResults.flatMap(x=>Array.isArray(x?.results)?x.results:[]):[];
    const wrap=$("canvasWrap");wrap.innerHTML="";
    const safeRemnantResults=Array.isArray(remnantResults)?remnantResults.filter(x=>x&&Array.isArray(x.results)):[]; 
    const safeNewResults=Array.isArray(newResults)?newResults.filter(Boolean):[];
    const visibleRemnants=safeRemnantResults.map((x,i)=>{const r={...(x.remnant||{})};r.displayId="REM-"+String(i+1).padStart(3,"0");return r});
    if(visibleRemnants.length){try{addRemnantLayerControls(wrap,visibleRemnants)}catch(err){console.warn("SheetNest: remnant controls skipped",err)}}
    const remnantChecks=[];
    const addCard=(svg,title,remnant,remnantIndex)=>{
      const card=document.createElement("div");card.className="result-card"+(remnant?" remnant-result":"");
      const head=document.createElement("div");head.className="result-title";
      let rb=null,rcheck=null;
      try{
        rb=remnant&&Array.isArray(remnant.polygon)&&remnant.polygon.length>=3?bounds(remnant.polygon):null;
        rcheck=remnant&&rb?classify(remnant.polygon,num("remnantMinLength",500),num("remnantMinWidth",300),meta.gap):null;
      }catch(_){rb=null;rcheck=null}
      const dim=rb?Math.round(rb.width)+" × "+Math.round(rb.height)+" мм":"";
      const ori=rcheck&&rcheck.business?(rcheck.orientation===90?" · 90°":" · 0°"):"";
      head.innerHTML="<strong>"+title+"</strong><span>"+(remnant?"Деловой остаток · "+dim+ori:"Новый металлический лист")+"</span>";
      const clone=svg.cloneNode(true);clone.classList.add("sheet-svg");clone.removeAttribute("width");clone.removeAttribute("height");

      // Результаты на деловом остатке не проходят через decorateResultSvg(),
      // поэтому исходный #sheet-bin мог остаться с дефолтной чёрной заливкой.
      // Оформляем сам контур остатка без изменения его viewBox/координат.
      if(remnant){
        try{
          const bin=clone.querySelector("#sheet-bin,.bin");
          if(bin){
            bin.setAttribute("fill","#b8c1ca");
            bin.setAttribute("fill-opacity","0.72");
            bin.setAttribute("stroke","#687481");
            bin.setAttribute("stroke-width","0.9");
            bin.setAttribute("vector-effect","non-scaling-stroke");
          }
        }catch(err){console.warn("SheetNest: remnant base styling skipped",err)}
      }

      const freePolys=actualFreePolygonsFromSvg(clone);
      const comparison=remnant?compareRemnantToFree(clone,remnant,freePolys):null;

      if(remnant){
        const overlay=remnantOverlayGroup(clone,remnant,remnantIndex);if(overlay)clone.appendChild(overlay);
        remnantChecks.push({sheetIndex:remnantIndex+1,remnantIndex:remnantIndex+1,displayId:remnant.displayId||("REM-"+String(remnantIndex+1).padStart(3,"0")),check:validateRemnantOverlay(clone,remnant)});
      }else decorateResultSvg(clone,meta,wrap.children.length);

      const freeOverlay=actualFreeOverlayGroup(clone,freePolys,remnantIndex);
      if(freeOverlay)clone.appendChild(freeOverlay);

      card.appendChild(head);card.appendChild(clone);

      const summary=document.createElement("div");summary.className="sheet-summary";
      if(remnant&&comparison){
        const statusText=comparison.consumedArea>0.01?"частично использован":"совпадает с остатком";
        const statusClass=comparison.consumedArea>0.01?"warn":"ok";
        summary.innerHTML="<span>Фактическая свободная площадь: <strong>"+Math.round(comparison.freeArea)+" мм²</strong></span><span>Осталось от остатка: <strong>"+comparison.remainingPct.toFixed(1)+"%</strong></span><span>Использовано: <strong>"+Math.round(comparison.consumedArea)+" мм²</strong></span>";
        const check=document.createElement("div");check.className="geometry-check";
        check.innerHTML="<span class='"+statusClass+"'>Геометрическое сравнение: "+statusText+"</span><span>Свободная область внутри зелёного контура: "+comparison.overlapPct.toFixed(1)+"%</span><span>Расхождение контура: "+comparison.greenContourDiffPct.toFixed(2)+"%</span>";
        summary.appendChild(check);
      }else{
        summary.innerHTML="<span>Фактическая свободная область: <strong>"+Math.round(polygonAreaSum(freePolys))+" мм²</strong></span><span>"+(remnant?"Деловой остаток":"Новый металлический лист")+" · зазор: <strong>"+meta.gap+" мм</strong></span>";
      }
      if(remnant&&rcheck)summary.innerHTML+="<span class='remnant-fit-badge'>Минимум "+num("remnantMinLength",500)+" × "+num("remnantMinWidth",300)+" · "+(rcheck.business?"проходит":"не проходит")+"</span>";
      card.appendChild(summary);wrap.appendChild(card);
    };
    let remIndex=0;
    safeRemnantResults.forEach((x,i)=>x.results.forEach((svg,j)=>{
      try{addCard(svg,""+(visibleRemnants[i]?.displayId||("REM-"+String(i+1).padStart(3,"0")))+" · раскрой "+(j+1),visibleRemnants[i],remIndex++)}
      catch(err){console.warn("SheetNest: remnant result visualization skipped",err)}
    }));
    safeNewResults.forEach((svg,i)=>{
      try{addCard(svg,"Новый лист "+(i+1),null,-1)}
      catch(err){console.warn("SheetNest: new-sheet visualization skipped",err)}
    });
    state.remnantValidation=remnantChecks;
    if(remnantChecks.length){try{renderRemnantValidationPanel(wrap,remnantChecks)}catch(err){console.warn("SheetNest: remnant validation panel skipped",err)}}
    $("statSheets").textContent=safeRemnantResults.reduce((n,x)=>n+x.results.length,0)+safeNewResults.length;
    $("statParts").textContent=placed;$("statEfficiency").textContent=total?Math.round(placed/total*100)+"%":"0%";
    try{applyCanvasZoom()}catch(err){console.warn("SheetNest: canvas zoom update skipped",err)}
  }

  function styleLiveCandidateSvg(svg,label,index){
    try{
      if(typeof forceVisibleSheetBin==="function"){
        forceVisibleSheetBin(svg,true);
      }else{
        const bins=svg?.querySelectorAll("#sheet-bin,.bin")||[];
        bins.forEach(bin=>{
          bin.setAttribute("fill","#b8c1ca");
          bin.setAttribute("fill-opacity",label==="remnant"?"0.72":"0.92");
          bin.setAttribute("stroke","#687481");
          bin.setAttribute("stroke-width","0.9");
          if(bin.style){
            bin.style.setProperty("fill","#b8c1ca","important");
            bin.style.setProperty("fill-opacity",label==="remnant"?"0.72":"0.92","important");
            bin.style.setProperty("stroke","#687481","important");
            bin.style.setProperty("stroke-width","0.9","important");
          }
        });
        svg?.setAttribute("preserveAspectRatio","xMidYMid meet");
      }
    }catch(err){
      console.warn("SheetNest: live candidate sheet styling skipped",err);
    }
  }

  function renderLiveCandidate(svgList,efficiency,placed,total,label,isBest){
    const wrap=$("canvasWrap");if(!wrap||!svgList?.length)return;
    wrap.innerHTML="";
    wrap.classList.add("searching");
    svgList.forEach((svg,index)=>{
      const card=document.createElement("div");card.className="result-card search-frame";
      const head=document.createElement("div");head.className="result-title";
      head.innerHTML="<strong>"+(label==="remnant"?"Поиск в деловом остатке":"Поиск на новом листом")+" · лист "+(index+1)+"</strong><span>"+(isBest?"Новый лучший вариант":"Текущий кандидат")+"</span>";
      const clone=svg.cloneNode(true);clone.classList.add("sheet-svg");
      // SvgNest сохраняет реальный viewBox; явно фиксируем режим масштабирования,
      // чтобы CSS-растягивание рабочей карточки никогда не меняло пропорции CAD-геометрии.
      if(!clone.getAttribute("preserveAspectRatio")){
        clone.setAttribute("preserveAspectRatio","xMidYMid meet");
      }
      clone.removeAttribute("width");clone.removeAttribute("height");
      styleLiveCandidateSvg(clone,label,index);
      card.appendChild(head);card.appendChild(clone);
      const summary=document.createElement("div");summary.className="sheet-summary";
      summary.innerHTML="<span>"+(label==="remnant"?"Деловой остаток":"Новый металлический лист")+"</span><span>Деталей: <strong>"+Number(placed||0)+"/"+Number(total||0)+"</strong> · заполнение: <strong>"+Math.round(Number(efficiency||0)*100)+"%</strong></span>";
      card.appendChild(summary);wrap.appendChild(card);
    });
    $("statSheets").textContent=svgList.length;
    $("statParts").textContent=Number(placed||0);
    $("statEfficiency").textContent=Math.round(Number(efficiency||0)*100)+"%";
    try{applyCanvasZoom()}catch(err){console.warn("SheetNest: live canvas zoom update skipped",err)}
  }

  async function mixedRunCore(){
    if(state.running)return;
    if(!state.customParts.length&&!state.libraryParts.length)throw new Error("Загрузите один или несколько DXF/SVG или добавьте типовую деталь.");
    const originalInstances=allInstances();if(!originalInstances.length)throw new Error("Количество деталей должно быть больше нуля.");
    state.runAbortReason="";
    const originalRun=state.runId;state.runId=originalRun+1;state.expectedPartCount=originalInstances.length;state.nestingManifest=createNestingManifest();state.lastValidation=null;
    initializeInstanceDiagnostics();
    state.running=true;state.startedAt=Date.now();state.searchFrames=0;state.bestFrames=0;
    $("nestButton").disabled=true;$("stopButton").disabled=false;$("downloadButton").disabled=true;$("downloadDxfButton")?.setAttribute("disabled","");
    status("Расчёт...");
    const remaining=new Map(originalInstances.map(x=>[x.instanceId,x]));
    const testedRemnantIds=new Set();
    const usedResults=[];
    const minL=num("remnantMinLength",500),minW=num("remnantMinWidth",300),gap=num("gap",2);
    const currentSheet=getSheet();
    const currentSheetArea=Math.max(1,Number(currentSheet.w||0)*Number(currentSheet.h||0));
    let remnants=load().filter(compatible);
    const invalidRemnants=[];
    remnants=remnants.filter(r=>{
      try{
        if(!Array.isArray(r?.polygon)||r.polygon.length<3){
          invalidRemnants.push({rem:r,reason:"polygon отсутствует или слишком короткий"});
          return false;
        }
        const ra=area(r.polygon),rb=bounds(r.polygon);
        // Старые ошибочные записи, представляющие практически весь лист,
        // не должны снова попадать в расчёт.
        if(ra/currentSheetArea>=0.995){
          invalidRemnants.push({rem:r,reason:"почти весь текущий лист"});
          return false;
        }
        if(rb.width>=Number(currentSheet.w||0)*0.995 && rb.height>=Number(currentSheet.h||0)*0.995 && ra/currentSheetArea>=0.90){
          invalidRemnants.push({rem:r,reason:"габариты совпадают с листом"});
          return false;
        }
        const check=validateRemnantForNesting(r,minL,minW,gap,currentSheet);
        if(!check.valid){
          invalidRemnants.push({rem:r,reason:check.reason});
          return false;
        }
        // Нормализуем проверенную геометрию, чтобы ниже по коду использовались
        // ровно те координаты, которые прошли SVG/SvgNest probe.
        r.polygon=check.polygon;
        r.area=check.area;
        r.bbox={width:check.bounds.width,height:check.bounds.height};
        return true;
      }catch(err){
        invalidRemnants.push({rem:r,reason:"ошибка фильтра"});
        console.warn("SheetNest: invalid saved remnant skipped",err);
        return false;
      }
    });
    if(invalidRemnants.length){
      try{
        const invalidIds=new Set(invalidRemnants.map(x=>x.rem?.id).filter(Boolean));
        if(invalidIds.size){
          const stored=load().filter(x=>!invalidIds.has(x.id));
          save(stored);
        }
        invalidRemnants.forEach(x=>console.warn("SheetNest: damaged business remnant excluded:",x.rem?.id,x.reason));
      }catch(err){console.warn("SheetNest: invalid remnant cleanup skipped",err)}
    }
    remnants.sort((a,b)=>b.area-a.area);
    const q=qualityConfig();
    const maxRemnants=q.seconds<=10?6:q.seconds<=30?10:18;
    if(remnants.length>maxRemnants)remnants=remnants.slice(0,maxRemnants);
    const sheet=getSheet();
    const orientations=sheet.auto?[{w:sheet.w,h:sheet.h},{w:sheet.h,h:sheet.w}]:[{w:sheet.w,h:sheet.h}];
    const phases=(enabled("useRemnants",true)?remnants.length:0)+(remaining.size?orientations.length:0);
    state.durationMs=Math.max(1,phases*Math.max(3,Math.min(12,q.seconds/3))*1000);
    $("progressBar").style.width="0%";
    $("runInfo").textContent=phases+" этапов · расчёт времени…";
    let phaseIndex=0;
    let lastVisualUpdate=0;
    const updateMixed=(info)=>{
      if(!state.running)return;
      const phaseProgress=Math.max(0,Math.min(1,Number(info?.progress)||0));
      const overall=phases?Math.min(1,(phaseIndex+phaseProgress)/phases):1;
      $("progressBar").style.width=Math.round(overall*100)+"%";
      const elapsed=Date.now()-state.startedAt;
      const eta=Math.max(0,Math.ceil((state.durationMs-elapsed)/1000));
      const frame=state.searchFrames;
      const tag=info?.label==="remnant"?"остаток":"лист";
      $("runInfo").textContent="Поиск · "+tag+" "+(phaseIndex+1)+"/"+Math.max(1,phases)+" · кадр "+frame+" · "+Math.ceil(eta)+" с";
      status("Ищем раскладку…");
      if(info?.svglist?.length && (info.frame || Date.now()-lastVisualUpdate>=220)){
        lastVisualUpdate=Date.now();
        state.searchFrames++;
        renderLiveCandidate(info.svglist,info.efficiency,info.placed,originalInstances.length,info.label,info.isBest);
      }
    };
    if(enabled("useRemnants",true)){
      for(const rem of remnants){
        if(!remaining.size||!state.running)break;
        const instances=[...remaining.values()];
        // Повторная проверка непосредственно перед запуском SvgNest:
        // остаток мог быть изменён/повреждён после первичного фильтра.
        const preRunCheck=validateRemnantForNesting(rem,minL,minW,gap,currentSheet);
        if(!preRunCheck.valid){
          console.warn("SheetNest: damaged business remnant excluded before runBin:",rem.id,preRunCheck.reason);
          testedRemnantIds.add(rem.id);
          try{
            const stored=load().filter(x=>x.id!==rem.id);
            save(stored);
          }catch(err){console.warn("SheetNest: failed to remove damaged remnant",err)}
          continue;
        }
        rem.polygon=preRunCheck.polygon;
        rem.area=preRunCheck.area;
        rem.bbox={width:preRunCheck.bounds.width,height:preRunCheck.bounds.height};
        const run=await runBin(rem.polygon,instances,"remnant",updateMixed);
        testedRemnantIds.add(rem.id);
        phaseIndex++;
        if(!state.running)break;
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
        if(!state.running)break;
        const run=await runBin((()=>[{x:0,y:0},{x:s.w,y:0},{x:s.w,y:s.h},{x:0,y:s.h}])(),[...remaining.values()],"new-sheet",updateMixed);
        phaseIndex++;
        if(run&&(!best||scoreCandidate(run,best)))best=run;
      }
      if(best){
        best.placedIds.forEach(id=>remaining.delete(id));newResults=best.results;
        setDiagForStage(best.placedIds,"Новый лист");
      }
    }

    if(!state.running){
      return {remaining};
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
    try{renderMixed(usedResults,newResults,meta,placed,total)}
    catch(err){console.warn("SheetNest: final remnant visualization skipped; nesting result is preserved",err)}
    try{window.SheetNestDxf?.update?.()}
    catch(err){console.warn("SheetNest: DXF preview update skipped",err)} 
    renderDiagnosticsPanel(true);
    $("progressBar").style.width="100%";
    $("runInfo").textContent=remaining.size?"Частичный смешанный раскрой · не размещено: "+remaining.size:"Готово · деловые остатки: "+usedResults.length+" · новых листов: "+newResults.length+" · размещено: "+placed+"/"+total;
    status(remaining.size?"Частичный раскрой":"Раскрой рассчитан");
    updateCount(load().length);
    $("downloadButton").disabled=newResults.length===0;
    $("downloadDxfButton")?.removeAttribute("disabled");
    state.running=false;
    $("nestButton").disabled=false;$("stopButton").disabled=true;
    $("progressBar").style.width="100%";
    return {remaining};
  }

  async function mixedRun(){
    const runToken=(state.runId||0)+1;
    const started=Date.now();
    const q=qualityConfig();
    const hardLimit=Math.max(30000,Math.min(180000,Number(q.seconds||30)*4000));
    let watchdog=null;
    try{
      watchdog=setTimeout(()=>{
        if(state.running&&state.runId===runToken){
          state.runAbortReason="timeout";
          state.running=false;
          state.runId=runToken;
          try{SvgNest.stop()}catch(_){}
          $("runInfo").textContent="Расчёт остановлен по тайм-ауту";
          status("Расчёт остановлен");
        }
      },hardLimit);
      return await mixedRunCore();
    }catch(err){
      state.runAbortReason="error";
      state.running=false;
      try{SvgNest.stop()}catch(_){}
      $("runInfo").textContent="Ошибка расчёта: "+(err?.message||String(err));
      status("Ошибка расчёта");
      throw err;
    }finally{
      if(watchdog)clearTimeout(watchdog);
      state.running=false;
      try{SvgNest.stop()}catch(_){}
      $("nestButton").disabled=false;
      $("stopButton").disabled=true;
      if(state.runAbortReason==="timeout"){
        $("progressBar").style.width="100%";
      }
    }
  }

  function init(){
    updateCount(load().length);
    ["remnantMinLength","remnantMinWidth","gap"].forEach(id=>document.getElementById(id)?.addEventListener("input",()=>{
      const l=num("remnantMinLength",500),w=num("remnantMinWidth",300),h=document.getElementById("remnantHint");
      if(h)h.textContent="Проверяются обе ориентации: "+l+"×"+w+" и "+w+"×"+l+" мм.";
    }));
    // app.js calls the public runner explicitly; do not overwrite a lexical runSearch binding here.
    // Keeping the integration on the public API also avoids a ReferenceError in strict mode.

  }
  init();
  window.SheetNestRemnants={load,save,classify,capture,freePolygonsFromSvg,run:mixedRun,renderMixed};
})();