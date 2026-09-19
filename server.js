const express=require("express");
const multer=require("multer");
const fs=require("fs");
const os=require("os");
const path=require("path");
const DxfParser=require("dxf-parser");

const app=express();
const upload=multer({dest:path.join(os.tmpdir(),"sheetnest-uploads"),limits:{fileSize:100*1024*1024}});
app.use(express.json({limit:"2mb"}));
app.use(express.static(path.join(__dirname,"public")));

const EPS=0.01;
function num(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback}
function point(x,y){return{x:num(x),y:num(y)}}
function same(a,b){return Math.hypot(a.x-b.x,a.y-b.y)<=EPS}
function dPoint(p){return `${p.x} ${-p.y}`}
function pathFromPoints(points,close=true){
  if(!points||points.length<2)return "";
  let d=`M ${dPoint(points[0])}`;
  for(let i=1;i<points.length;i++)d+=` L ${dPoint(points[i])}`;
  if(close)d+=" Z";
  return d;
}
function collectDxfContours(dxf){
  const closed=[], open=[], segments=[];
  for(const e of (dxf.entities||[])){
    const type=String(e.type||"").toUpperCase();
    if(type==="LWPOLYLINE"||type==="POLYLINE"){
      const pts=(e.vertices||[]).map(v=>point(v.x,v.y));
      if(pts.length>=2){
        const isClosed=Boolean(e.shape||e.closed);
        if(isClosed){closed.push(pts)}
        else{open.push(pts)}
      }
      continue;
    }
    if(type==="LINE"){
      const a=e.vertices?.[0],b=e.vertices?.[1];
      if(a&&b)segments.push({a:point(a.x,a.y),b:point(b.x,b.y)});
      continue;
    }
    if(type==="CIRCLE"){
      const cx=num(e.center?.x),cy=num(e.center?.y),r=Math.abs(num(e.radius));
      const steps=Math.max(24,Math.ceil(2*Math.PI*Math.max(r,1)/2));
      const pts=[];for(let i=0;i<steps;i++){const t=2*Math.PI*i/steps;pts.push(point(cx+r*Math.cos(t),cy+r*Math.sin(t)))}
      closed.push(pts);continue;
    }
    if(type==="ARC"){
      const cx=num(e.center?.x),cy=num(e.center?.y),r=Math.abs(num(e.radius));
      let a0=num(e.startAngle),a1=num(e.endAngle);let delta=(a1-a0)%360;if(delta<0)delta+=360;
      const steps=Math.max(8,Math.ceil(delta/5));const pts=[];
      for(let i=0;i<=steps;i++){const a=(a0+delta*i/steps)*Math.PI/180;pts.push(point(cx+r*Math.cos(a),cy+r*Math.sin(a)))}
      open.push(pts);
    }
  }

  // Stitch LINE entities that share endpoints into continuous contours.
  while(segments.length){
    const seed=segments.pop();
    let chain=[seed.a,seed.b],extended=true;
    while(extended){
      extended=false;
      for(let i=segments.length-1;i>=0;i--){
        const s=segments[i];
        if(same(chain[chain.length-1],s.a)){chain.push(s.b);segments.splice(i,1);extended=true;break}
        if(same(chain[chain.length-1],s.b)){chain.push(s.a);segments.splice(i,1);extended=true;break}
        if(same(chain[0],s.b)){chain.unshift(s.a);segments.splice(i,1);extended=true;break}
        if(same(chain[0],s.a)){chain.unshift(s.b);segments.splice(i,1);extended=true;break}
      }
    }
    if(chain.length>=3&&same(chain[0],chain[chain.length-1])){
      chain.pop();closed.push(chain)
    }else open.push(chain)
  }

  return {closed,open};
}

function getBounds(contours){
  const b={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
  const add=p=>{b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y)};
  contours.forEach(c=>c.forEach(add));
  return b;
}
function dxfToSvg(dxf){
  const data=collectDxfContours(dxf);
  if(!data.closed.length)throw new Error("В DXF не найден замкнутый контур детали.");
  const b=getBounds(data.closed),padding=1,minX=b.minX-padding,maxY=b.maxY+padding;
  const width=Math.max(1,b.maxX-b.minX+2*padding),height=Math.max(1,b.maxY-b.minY+2*padding);
  const paths=data.closed.map(c=>`<path d="${pathFromPoints(c,true)}" />`).join("");
  const content=`<g transform="translate(${-minX} ${maxY})">${paths}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-contours="${data.closed.length}" data-open="${data.open.length}"><g fill="none" stroke="black" stroke-width="0.2">${content}</g></svg>`;
}

app.post("/api/import/dxf",upload.single("file"),(req,res)=>{
  if(!req.file)return res.status(400).json({error:"Файл не передан"});
  try{
    const source=fs.readFileSync(req.file.path,"utf8");
    const dxf=new DxfParser().parseSync(source);
    const svg=dxfToSvg(dxf);
    const root=svg.match(/<svg[^>]*>/)?.[0]||"";
    const contours=Number(root.match(/data-contours="(\d+)"/)?.[1]||0);
    const open=Number(root.match(/data-open="(\d+)"/)?.[1]||0);
    res.json({format:"dxf",svg,contours,open});
  }catch(err){
    res.status(422).json({error:`Не удалось разобрать DXF: ${err.message}`});
  }finally{fs.rm(req.file.path,{force:true},()=>{})}
});

app.get("/api/health",(_req,res)=>res.json({ok:true}));
const port=Number(process.env.PORT)||3000;
app.listen(port,()=>console.log(`SheetNest listening on http://localhost:${port}`));