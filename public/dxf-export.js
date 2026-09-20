/* Offline DXF exporter for SheetNest results. */
(function(){
"use strict";
function download(text,name){const blob=new Blob([text],{type:"application/dxf"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
function tp(m,p){return{x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f}}
function pl(pts,layer){if(pts.length<2)return"";let s="0\nLWPOLYLINE\n8\n"+String(layer).replace(/[^\x20-\x7E]/g,"?")+"\n90\n"+pts.length+"\n70\n1\n";for(const p of pts)s+="10\n"+p.x.toFixed(4)+"\n20\n"+p.y.toFixed(4)+"\n";return s}
function pts(el){const t=el.tagName.toLowerCase(),m=el.getCTM();if(!m)return[];if(t==="path"&&el.getTotalLength){const n=Math.max(8,Math.min(800,Math.ceil(el.getTotalLength()/8))),o=[];for(let i=0;i<n;i++){const p=el.getPointAtLength(el.getTotalLength()*i/(n-1));o.push(tp(m,p))}return o}
if(t==="polyline"||t==="polygon"){const a=(el.getAttribute("points")||"").trim().split(/[\s,]+/).map(Number),o=[];for(let i=0;i+1<a.length;i+=2)o.push(tp(m,{x:a[i],y:a[i+1]}));if(t==="polygon"&&o.length)o.push(o[0]);return o}
if(t==="rect"){const x=+el.getAttribute("x")||0,y=+el.getAttribute("y")||0,w=+el.getAttribute("width")||0,h=+el.getAttribute("height")||0;return[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h},{x,y}].map(p=>tp(m,p))}
if(t==="circle"||t==="ellipse"){const cx=+el.getAttribute("cx")||0,cy=+el.getAttribute("cy")||0,rx=+(el.getAttribute("r")||el.getAttribute("rx"))||0,ry=+(el.getAttribute("r")||el.getAttribute("ry"))||0,o=[];for(let i=0;i<48;i++){const a=2*Math.PI*i/48;o.push(tp(m,{x:cx+rx*Math.cos(a),y:cy+ry*Math.sin(a)}))}o.push(o[0]);return o}return[]}
function one(svg,i){const c=svg.cloneNode(true);c.style.display="block";document.body.appendChild(c);let e="";c.querySelectorAll("path,polyline,polygon,rect,circle,ellipse").forEach(x=>{if(x.closest("defs,clipPath,mask"))return;const p=pts(x);if(p.length>=2)e+=pl(p,x.id==="sheet-bin"?"SHEET":"PART_"+(x.getAttribute("data-sheetnest-source-instance-id")||x.getAttribute("data-sheetnest-unit-id")||"DETAIL"))});c.remove();return"0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n999\nSheetNest layout "+(i+1)+"\n"+e+"0\nENDSEC\n0\nEOF\n"}
function all(){const a=[];if(window.state?.resultSvgs)a.push(...state.resultSvgs);if(window.state?.remnantResultSvgs)a.push(...state.remnantResultSvgs);return a}
function exportAll(){const a=all();if(!a.length){alert("Сначала выполните расчёт раскроя.");return}a.forEach((s,i)=>download(one(s,i),"SheetNest_layout_"+String(i+1).padStart(3,"0")+".dxf"))}
function update(){const b=document.getElementById("downloadDxfButton");if(b){b.disabled=!all().length;b.onclick=exportAll}}
document.addEventListener("DOMContentLoaded",update);setInterval(update,1000);window.SheetNestDxf={exportAll,update}
})();