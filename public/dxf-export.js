/* SheetNest offline DXF exporter */
(function(){
"use strict";
const VERSION="AC1015";
function layerName(v,fallback){const s=String(v||fallback||"DETAIL").replace(/[^A-Za-z0-9_.-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,180);return s||fallback||"DETAIL"}
function fmt(v){return (Number.isFinite(v)?v:0).toFixed(4)}
function point(m,x,y){return{x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}}
function header(ext,layers){
  const layerList=[...layers].filter(Boolean);
  const a=["0","SECTION","2","HEADER","9","$ACADVER","1",VERSION,"9","$INSUNITS","70","4","9","$EXTMIN","10",fmt(ext.minX),"20",fmt(ext.minY),"9","$EXTMAX","10",fmt(ext.maxX),"20",fmt(ext.maxY),"0","ENDSEC","0","SECTION","2","TABLES","0","TABLE","2","LTYPE","70","1","0","LTYPE","2","CONTINUOUS","70","0","3","Solid line","72","65","73","0","40","0.0","0","ENDTAB","0","TABLE","2","LAYER","70",String(layerList.length)];
  for(const layer of layerList)a.push("0","LAYER","2",layer,"70","0","62",layer==="SHEET"?"3":"7","6","CONTINUOUS");
  a.push("0","ENDTAB","0","ENDSEC","0","SECTION","2","ENTITIES");
  return a.join("\n")+"\n";
}
function footer(){return "0\nENDSEC\n0\nEOF\n"}
function lw(out,points,layer,closed,layers){
  if(!points||points.length<2)return;
  const safeLayer=layerName(layer,"DETAIL");
  layers?.add(safeLayer);
  const clean=[];
  for(const p of points){
    if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
    const q=clean[clean.length-1];
    if(!q||Math.hypot(q.x-p.x,q.y-p.y)>1e-7)clean.push(p);
  }
  if(clean.length<2)return;
  const endpointsCoincident=clean.length>2&&Math.hypot(clean[0].x-clean[clean.length-1].x,clean[0].y-clean[clean.length-1].y)<1e-5;
  if((closed||endpointsCoincident)&&endpointsCoincident)clean.pop();
  if(clean.length<2)return;
  const isClosed=Boolean(closed||endpointsCoincident);
  out.push("0","LWPOLYLINE","8",safeLayer,"90",String(clean.length),"70",isClosed?"1":"0");
  for(const p of clean)out.push("10",fmt(p.x),"20",fmt(p.y));
}
function geometry(el,matrix){
  const tag=el.tagName.toLowerCase();
  if(tag==="path"&&el.getTotalLength){
    const total=el.getTotalLength();
    if(!Number.isFinite(total)||total<=0)return{points:[],closed:true};
    const n=Math.max(16,Math.min(1600,Math.ceil(total/3)));
    const points=[];
    for(let i=0;i<n;i++){const p=el.getPointAtLength(total*i/(n-1));points.push(point(matrix,p.x,p.y))}
    return{points,closed:/[zZ]\s*$/.test(el.getAttribute("d")||"")};
  }
  if(tag==="line"){
    return{points:[
      point(matrix,Number(el.getAttribute("x1")||0),Number(el.getAttribute("y1")||0)),
      point(matrix,Number(el.getAttribute("x2")||0),Number(el.getAttribute("y2")||0))
    ],closed:false};
  }
  if(tag==="polyline"||tag==="polygon"){
    const a=(el.getAttribute("points")||"").trim().split(/[\s,]+/).map(Number),points=[];
    for(let i=0;i+1<a.length;i+=2)points.push(point(matrix,a[i],a[i+1]));
    if(tag==="polygon"&&points.length)points.push(points[0]);
    return{points,closed:tag==="polygon"};
  }
  if(tag==="rect"){
    const x=Number(el.getAttribute("x")||0),y=Number(el.getAttribute("y")||0),w=Number(el.getAttribute("width")||0),h=Number(el.getAttribute("height")||0);
    if(w<=0||h<=0)return{points:[],closed:true};
    return{points:[
      point(matrix,x,y),point(matrix,x+w,y),point(matrix,x+w,y+h),point(matrix,x,y+h),point(matrix,x,y)
    ],closed:true};
  }
  if(tag==="circle"||tag==="ellipse"){
    const cx=Number(el.getAttribute("cx")||0),cy=Number(el.getAttribute("cy")||0);
    const rx=Number(el.getAttribute(tag==="circle"?"r":"rx")||0),ry=Number(el.getAttribute(tag==="circle"?"r":"ry")||0);
    if(rx<=0||ry<=0)return{points:[],closed:true};
    const points=[];for(let i=0;i<=96;i++){const a=Math.PI*2*i/96;points.push(point(matrix,cx+rx*Math.cos(a),cy+ry*Math.sin(a)))}
    return{points,closed:true};
  }
  return{points:[],closed:true};
}
function resultSheets(){return Array.isArray(window.state?.resultSvgs)?window.state.resultSvgs.filter(Boolean):[]}
function toDxf(svg,index){
  if(!svg)throw new Error("Отсутствует лист "+(index+1));
  const host=document.createElement("div");
  host.style.position="fixed";host.style.left="-100000px";host.style.top="0";host.style.width="1px";host.style.height="1px";host.style.visibility="hidden";
  const clone=svg.cloneNode(true);clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
  const sheetW=Number(svg.getAttribute("data-sheet-w"))||Number(svg.getAttribute("width"))||Number((svg.getAttribute("viewBox")||"").trim().split(/[\\s,]+/)[2])||0;
  const sheetH=Number(svg.getAttribute("data-sheet-h"))||Number(svg.getAttribute("height"))||Number((svg.getAttribute("viewBox")||"").trim().split(/[\\s,]+/)[3])||0;
  clone.removeAttribute("class");
  if(sheetW>0)clone.style.setProperty("width",sheetW+"px","important");
  if(sheetH>0)clone.style.setProperty("height",sheetH+"px","important");
  clone.style.setProperty("display","block","important");
  host.appendChild(clone);document.body.appendChild(host);
  const out=[];
  const audit={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity,sheetEntities:0,detailEntities:0,issues:[]};
  const includeBounds=points=>{for(const p of points){audit.minX=Math.min(audit.minX,p.x);audit.minY=Math.min(audit.minY,p.y);audit.maxX=Math.max(audit.maxX,p.x);audit.maxY=Math.max(audit.maxY,p.y)}};
  try{
    const layers=new Set(["0","SHEET"]);
    const sheetGeometries=[];
    const detailRecords=[];
    let sourceOrder=0;
    const sheetBins=[...clone.querySelectorAll("#sheet-bin,.bin")];
    sheetBins.forEach(bin=>{
      const matrix=bin.getCTM()||clone.getCTM();if(!matrix)return;
      const g=geometry(bin,matrix);
      if(g.points.length)sheetGeometries.push(g);
    });
    clone.querySelectorAll("g[data-sheetnest-unit-id]").forEach(group=>{
      const unit=group.getAttribute("data-sheetnest-unit-id")||"UNIT";
      const instance=group.getAttribute("data-sheetnest-source-instance-id")||"INSTANCE";
      const layer=layerName(instance+"__"+unit,"DETAIL");
      group.querySelectorAll("path,polyline,polygon,rect,circle,ellipse,line").forEach(el=>{
        if(el.closest("defs,clipPath,mask,pattern"))return;
        const matrix=el.getCTM()||clone.getCTM();if(!matrix)return;
        const g=geometry(el,matrix);
        if(!g.points.length)return;
        detailRecords.push({group:group,groupKey:instance+"__"+unit,layer,points:g.points,closed:g.closed,sourceOrder:sourceOrder++});
      });
    });
    const pointInPoly=(p,pts)=>{
      let inside=false;
      for(let i=0,j=pts.length-1;i<pts.length;j=i++){
        const xi=pts[i].x,yi=pts[i].y,xj=pts[j].x,yj=pts[j].y;
        const hit=((yi>p.y)!==(yj>p.y))&&(p.x<(xj-xi)*(p.y-yi)/(yj-yi+Number.EPSILON)+xi);
        if(hit)inside=!inside;
      }
      return inside;
    };
    for(const rec of detailRecords){
      rec.depth=0;
      if(!rec.closed||rec.points.length<3)continue;
      const probe=rec.points[0];
      for(const other of detailRecords){
        if(other===rec||!other.closed||other.points.length<3||other.groupKey!==rec.groupKey)continue;
        if(pointInPoly(probe,other.points))rec.depth++;
      }
    }
    detailRecords.sort((a,b)=>{
      if(a.depth!==b.depth)return b.depth-a.depth;
      return a.sourceOrder-b.sourceOrder;
    });
    for(const rec of detailRecords){
      audit.detailEntities++;includeBounds(rec.points);lw(out,rec.points,rec.layer,rec.closed,layers);
    }
    for(const g of sheetGeometries){
      audit.sheetEntities++;includeBounds(g.points);lw(out,g.points,"SHEET",true,layers);
    }
    if(sheetBins.length!==1)audit.issues.push("Ожидался ровно один контур листа, найдено "+sheetBins.length+".");
    if(sheetW>0&&sheetH>0&&audit.sheetEntities===1){
      const sw=audit.maxX-audit.minX,sh=audit.maxY-audit.minY;
      if(Math.abs(sw-sheetW)>0.1||Math.abs(sh-sheetH)>0.1)audit.issues.push("Контур листа имеет "+sw.toFixed(3)+"×"+sh.toFixed(3)+" вместо "+sheetW+"×"+sheetH+" мм.");
      const tol=0.1;
      if(audit.minX<-tol||audit.minY<-tol||audit.maxX>sheetW+tol||audit.maxY>sheetH+tol)audit.issues.push("Часть геометрии деталей выходит за границы листа.");
    }
    if(audit.detailEntities===0)audit.issues.push("В результате нет ни одного контура детали.");
    if(!Number.isFinite(audit.minX))audit.issues.push("Экспорт не содержит геометрических сущностей.");
    if(audit.issues.length)throw new Error("Проверка DXF не пройдена: "+audit.issues.join(" "));
    out.unshift(header({minX:audit.minX,minY:audit.minY,maxX:audit.maxX,maxY:audit.maxY},layers));
    return out.join("\n");
  }finally{host.remove()}
}
function download(content,name){
  const blob=new Blob([content],{type:"application/dxf;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},1000);
}
function exportAll(){
  const sheets=resultSheets();if(!sheets.length){alert("Сначала выполните расчёт раскроя.");return}
  sheets.forEach((svg,index)=>download(toDxf(svg,index),"SheetNest_layout_"+String(index+1).padStart(3,"0")+".dxf"));
}
function update(){const b=document.getElementById("downloadDxfButton");if(b)b.disabled=resultSheets().length===0||Boolean(window.state?.running)}
function init(){update();document.getElementById("downloadDxfButton")?.addEventListener("click",exportAll)}
window.SheetNestDxf={exportAll,update,exportSvg:toDxf};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();