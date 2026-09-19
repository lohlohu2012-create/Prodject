const express = require("express");
const multer = require("multer");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const DxfParser = require("dxf-parser");

const execFileAsync = promisify(execFile);
const app = express();
const upload = multer({ dest:path.join(os.tmpdir(),"sheetnest-uploads"), limits:{fileSize:100*1024*1024} });

app.use(express.json({limit:"2mb"}));
app.use(express.static(path.join(__dirname,"public")));

function num(value,fallback=0){const n=Number(value); return Number.isFinite(n)?n:fallback;}

function boundsForEntity(entity,b){
  const add=(x,y)=>{
    if(!Number.isFinite(x)||!Number.isFinite(y)) return;
    b.minX=Math.min(b.minX,x); b.maxX=Math.max(b.maxX,x); b.minY=Math.min(b.minY,y); b.maxY=Math.max(b.maxY,y);
  };
  const type=String(entity.type||"").toUpperCase();
  if(type==="LINE"){(entity.vertices||[]).forEach(v=>add(num(v.x),num(v.y)));}
  else if(type==="LWPOLYLINE"||type==="POLYLINE"){(entity.vertices||[]).forEach(v=>add(num(v.x),num(v.y)));}
  else if(type==="CIRCLE"){
    const cx=num(entity.center?.x),cy=num(entity.center?.y),r=Math.abs(num(entity.radius));
    add(cx-r,cy-r); add(cx+r,cy+r);
  } else if(type==="ARC"){
    const cx=num(entity.center?.x),cy=num(entity.center?.y),r=Math.abs(num(entity.radius));
    const start=num(entity.startAngle),end=num(entity.endAngle),norm=a=>((a%360)+360)%360;
    const s=norm(start),e=norm(end),inside=a=>{const x=norm(a);return s<=e?x>=s&&x<=e:x>=s||x<=e;};
    for(const a of [start,end,0,90,180,270]) if(inside(a)){const rad=a*Math.PI/180; add(cx+r*Math.cos(rad),cy+r*Math.sin(rad));}
  }
}

function pointsToPath(points,close=false){
  if(!points||points.length<2) return "";
  let d=`M ${num(points[0].x)} ${-num(points[0].y)}`;
  for(let i=1;i<points.length;i++) d+=` L ${num(points[i].x)} ${-num(points[i].y)}`;
  if(close)d+=" Z"; return d;
}

function entityToSvg(entity){
  const type=String(entity.type||"").toUpperCase();
  if(type==="LINE") return `<line x1="${num(entity.vertices?.[0]?.x)}" y1="${-num(entity.vertices?.[0]?.y)}" x2="${num(entity.vertices?.[1]?.x)}" y2="${-num(entity.vertices?.[1]?.y)}" />`;
  if(type==="LWPOLYLINE"||type==="POLYLINE"){const vertices=entity.vertices||[]; return `<path d="${pointsToPath(vertices,Boolean(entity.shape||entity.closed))}" />`;}
  if(type==="CIRCLE") return `<circle cx="${num(entity.center?.x)}" cy="${-num(entity.center?.y)}" r="${Math.abs(num(entity.radius))}" />`;
  if(type==="ARC"){
    const c=entity.center||{},r=Math.abs(num(entity.radius)),a0=num(entity.startAngle)*Math.PI/180,a1=num(entity.endAngle)*Math.PI/180;
    const x0=num(c.x)+r*Math.cos(a0),y0=-(num(c.y)+r*Math.sin(a0)),x1=num(c.x)+r*Math.cos(a1),y1=-(num(c.y)+r*Math.sin(a1));
    let delta=(num(entity.endAngle)-num(entity.startAngle))%360;if(delta<0)delta+=360;const large=delta>180?1:0;
    return `<path d="M ${x0} ${y0} A ${r} ${r} 0 ${large} 0 ${x1} ${y1}" />`;
  }
  return "";
}

function dxfToSvg(dxf){
  const entities=Array.isArray(dxf.entities)?dxf.entities:[];
  const b={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
  entities.forEach(e=>boundsForEntity(e,b));
  if(!Number.isFinite(b.minX)) throw new Error("В DXF не найдена геометрия.");
  const padding=1,minX=b.minX-padding,maxX=b.maxX+padding,minY=b.minY-padding,maxY=b.maxY+padding;
  const width=Math.max(1,maxX-minX),height=Math.max(1,maxY-minY);
  const parts=entities.map(entityToSvg).filter(Boolean);
  const translated=`<g transform="translate(${-minX} ${maxY})">${parts.join("")}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><g fill="none" stroke="black" stroke-width="0.2">${translated}</g></svg>`;
}

app.post("/api/import/dxf",upload.single("file"),(req,res)=>{
  if(!req.file)return res.status(400).json({error:"Файл не передан"});
  try{
    const source=fs.readFileSync(req.file.path,"utf8"),dxf=new DxfParser().parseSync(source);
    res.json({format:"dxf",svg:dxfToSvg(dxf)});
  }catch(err){res.status(422).json({error:`Не удалось разобрать DXF: ${err.message}`});}
  finally{fs.rm(req.file.path,{force:true},()=>{});}
});

app.post("/api/import/dwg",upload.single("file"),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:"Файл не передан"});
  const converter=process.env.DWG_CONVERTER;
  if(!converter){
    fs.rm(req.file.path,{force:true},()=>{});
    return res.status(501).json({error:"DWG-конвертер не настроен. Задайте переменную DWG_CONVERTER на сервере."});
  }
  const outDir=fs.mkdtempSync(path.join(os.tmpdir(),"sheetnest-dwg-"));
  const inputPath=path.join(outDir,path.basename(req.file.originalname));
  fs.copyFileSync(req.file.path,inputPath);
  try{
    await execFileAsync(converter,[outDir,outDir,"DXF","ACAD2018","0","1","*"],{timeout:120000});
    const candidates=fs.readdirSync(outDir).filter(name=>path.extname(name).toLowerCase()===".dxf");
    if(!candidates.length)throw new Error("Конвертер не создал DXF-файл");
    const dxfText=fs.readFileSync(path.join(outDir,candidates[0]),"utf8"),dxf=new DxfParser().parseSync(dxfText);
    res.json({format:"dwg",svg:dxfToSvg(dxf)});
  }catch(err){res.status(422).json({error:`Не удалось преобразовать DWG: ${err.message}`});}
  finally{fs.rm(req.file.path,{force:true},()=>{});fs.rm(outDir,{recursive:true,force:true},()=>{});}
});

app.get("/api/health",(_req,res)=>res.json({ok:true,dwgConverterConfigured:Boolean(process.env.DWG_CONVERTER)}));

const port=Number(process.env.PORT)||3000;
app.listen(port,()=>console.log(`SheetNest listening on http://localhost:${port}`));