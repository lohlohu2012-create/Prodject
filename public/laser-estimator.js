/* SheetNest laser cutting time estimator.
 * 3 kW Bodor reference speeds are stored as editable reference data.
 * Pierce and rapid parameters are machine/process settings and remain user-adjustable.
 */
(function(){
"use strict";

const BODOR_3KW={
  "Сталь":{name:"Carbon steel (Q235A)",gas:"O2",rows:[[1,8,10],[2,5.5,7.5],[3,3,4],[4,2.8,3.5]]},
  "Нержавеющая сталь":{name:"Stainless steel (201)",gas:"N2",rows:[[1,30,55],[2,12,30],[3,6,10],[4,4,6],[5,3,5],[6,2,3.2],[8,1,1.8],[10,0.5,0.85]]},
  "Алюминий":{name:"Aluminum",gas:"N2",rows:[[1,25,30],[2,13,20],[3,6.5,7.5],[4,3.5,5],[5,2.5,3.5],[6,1.5,2.5],[8,0.7,1]]}
};
const $=id=>document.getElementById(id);
const num=(id,fallback)=>{const n=Number($(id)?.value);return Number.isFinite(n)?n:fallback};

function interpolate(rows,thickness){
  if(!rows?.length)return null;
  if(thickness<=rows[0][0])return{min:rows[0][1],max:rows[0][2],interpolated:thickness!==rows[0][0]};
  if(thickness>=rows[rows.length-1][0])return{min:rows[rows.length-1][1],max:rows[rows.length-1][2],interpolated:thickness!==rows[rows.length-1][0]};
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i];
    if(thickness<=b[0]){
      const t=(thickness-a[0])/(b[0]-a[0]);
      return{min:a[1]+(b[1]-a[1])*t,max:a[2]+(b[2]-a[2])*t,interpolated:true};
    }
  }
  return null;
}
function speedProfile(){
  const material=$("material")?.value||"";
  const thickness=Math.max(0,num("thickness",3));
  const override=Math.max(0,num("laserSpeedOverride",0));
  if(override>0)return{material,thickness,gas:"manual",name:"Ручная скорость",speed:override,source:"Ручная скорость"};
  const profile=BODOR_3KW[material];
  if(!profile)return{material,thickness,gas:"—",name:"Нет справочной таблицы",speed:0,source:"Для этого материала задайте скорость вручную"};
  const row=interpolate(profile.rows,thickness);
  if(!row)return{material,thickness,gas:profile.gas,name:profile.name,speed:0,source:"Нет данных для заданной толщины"};
  return{material,thickness,gas:profile.gas,name:profile.name,speed:(row.min+row.max)/2*1000,source:"Bodor 3 kW reference · "+profile.gas+(row.interpolated?" · интерполяция":"")};
}
function geometryLength(element){
  const tag=element.tagName.toLowerCase();
  if(tag==="path"&&element.getTotalLength){const n=Number(element.getTotalLength());return Number.isFinite(n)?n:0}
  if(tag==="line"){const dx=Number(element.getAttribute("x2")||0)-Number(element.getAttribute("x1")||0),dy=Number(element.getAttribute("y2")||0)-Number(element.getAttribute("y1")||0);return Math.hypot(dx,dy)}
  if(tag==="polyline"||tag==="polygon"){
    const a=(element.getAttribute("points")||"").trim().split(/[\s,]+/).map(Number),points=[];
    for(let i=0;i+1<a.length;i+=2)points.push([a[i],a[i+1]]);
    let total=0;for(let i=1;i<points.length;i++)total+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
    if(tag==="polygon"&&points.length>1){const q=points[points.length-1];total+=Math.hypot(points[0][0]-q[0],points[0][1]-q[1])}
    return total;
  }
  if(tag==="rect"){const w=Math.max(0,Number(element.getAttribute("width")||0)),h=Math.max(0,Number(element.getAttribute("height")||0));return 2*(w+h)}
  if(tag==="circle"){const r=Math.max(0,Number(element.getAttribute("r")||0));return 2*Math.PI*r}
  if(tag==="ellipse"){const a=Math.max(0,Number(element.getAttribute("rx")||0)),b=Math.max(0,Number(element.getAttribute("ry")||0));if(!a||!b)return 0;const h=Math.pow(a-b,2)/Math.pow(a+b,2);return Math.PI*(a+b)*(1+3*h/(10+Math.sqrt(4-3*h))}
  return 0;
}
function primitiveStart(element){
  const tag=element.tagName.toLowerCase();
  if(tag==="path"&&element.getPointAtLength)return element.getPointAtLength(0);
  if(tag==="line")return{x:Number(element.getAttribute("x1")||0),y:Number(element.getAttribute("y1")||0)};
  if(tag==="rect")return{x:Number(element.getAttribute("x")||0),y:Number(element.getAttribute("y")||0)};
  if(tag==="circle"||tag==="ellipse")return{x:Number(element.getAttribute("cx")||0)+Number(element.getAttribute(tag==="circle"?"r":"rx")||0),y:Number(element.getAttribute("cy")||0)};
  if(tag==="polyline"||tag==="polygon"){const a=(element.getAttribute("points")||"").trim().split(/[\s,]+/).map(Number);if(a.length>=2)return{x:a[0],y:a[1]}}
  return null;
}
function transformPoint(element,p){
  if(!p)return null;
  const m=element.getCTM?.();if(!m)return p;
  return{x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};
}
function contourCount(element){return element.tagName.toLowerCase()==="path"?Math.max(1,(element.getAttribute("d")?.match(/[Mm]/g)||[]).length):1}

function analyze(){
  const result=window.state?.resultSvgs;if(!Array.isArray(result)||!result.length)return null;
  const profile=speedProfile(),rapidMpm=Math.max(1,num("laserRapidMpm",50))*1000,pierceSec=Math.max(0,num("laserPierceSec",1));
  let cutLength=0,rapidLength=0,pierces=0,contours=0;
  for(const svg of result){
    const host=document.createElement("div");host.style.position="fixed";host.style.left="-100000px";host.style.top="0";host.style.visibility="hidden";
    const clone=svg.cloneNode(true);clone.removeAttribute("width");clone.removeAttribute("height");host.appendChild(clone);document.body.appendChild(host);
    try{
      const groups=[...clone.querySelectorAll("g[data-sheetnest-unit-id]")];
      for(const group of groups){
        let previous=null;
        const geometries=[...group.querySelectorAll("path,polyline,polygon,rect,circle,ellipse,line")].filter(el=>!el.closest("defs,clipPath,mask,pattern"));
        for(const el of geometries){
          const length=geometryLength(el);if(length>0)cutLength+=length;
          const start=transformPoint(el,primitiveStart(el));
          if(start&&previous)rapidLength+=Math.hypot(start.x-previous.x,start.y-previous.y);
          if(start)previous=start;
          const count=contourCount(el);contours+=count;
          const tag=el.tagName.toLowerCase();
          if(length>0&&(tag==="path"||tag==="polygon"||tag==="rect"||tag==="circle"||tag==="ellipse"))pierces+=count;
        }
      }
    }finally{host.remove()}
  }
  const speed=profile.speed||0,cutSeconds=speed>0?(cutLength/speed)*60:0,rapidSeconds=(rapidLength/rapidMpm)*60,pierceSeconds=pierces*pierceSec,totalSeconds=cutSeconds+rapidSeconds+pierceSeconds;
  return{...profile,cutLength,rapidLength,pierces,contours,cutSeconds,rapidSeconds,pierceSeconds,totalSeconds,rapidMpm,pierceSec};
}
function fmtLength(mm){return mm>=1000?(mm/1000).toFixed(2)+" м":mm.toFixed(0)+" мм"}
function fmtTime(sec){if(!Number.isFinite(sec)||sec<=0)return"—";const total=Math.round(sec),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;return h?(h+" ч "+m+" мин"):m?(m+" мин "+s+" с"):(s+" с")}
function update(){
  const panel=$("laserPanel");if(!panel)return;
  const data=analyze();if(!data){panel.hidden=true;return}
  panel.hidden=false;
  $("laserMaterial").textContent=data.material||"—";$("laserProfile").textContent=data.name||"—";$("laserGas").textContent=data.gas||"—";
  $("laserSpeed").textContent=data.speed?Math.round(data.speed)+" мм/мин":"нет данных";
  $("laserCutLength").textContent=fmtLength(data.cutLength);$("laserRapidLength").textContent=fmtLength(data.rapidLength);
  $("laserContours").textContent=String(data.contours);$("laserPierces").textContent=String(data.pierces);
  $("laserCutTime").textContent=fmtTime(data.cutSeconds);$("laserTotalTime").textContent=fmtTime(data.totalSeconds);$("laserSource").textContent=data.source||"";
}
function init(){["material","thickness","laserSpeedOverride","laserPierceSec","laserRapidMpm"].forEach(id=>$(id)?.addEventListener("input",update));update()}
window.SheetNestLaser={update,analyze,BODOR_3KW};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();