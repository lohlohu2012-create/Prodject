const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

for(const file of [
  "public/app.js",
  "public/dxf-export.js",
  "public/laser-estimator.js",
  "public/nest/svgnest.js",
  "public/nest/util/parallel.js"
]){
  const source=read(file);
  assert.doesNotThrow(()=>new Function(source),`Syntax error in ${file}`);
}

const index=read("public/index.html");
assert(index.includes('src="dxf-export.js"'),"DXF exporter is not wired into public/index.html");
assert(index.includes('src="laser-estimator.js"'),"Laser estimator is not wired into public/index.html");
assert(index.includes("20260921-stability-pass-v1"),"Cache-busting version is stale");

const app=read("public/app.js");
assert(app.includes("startRunWatchdog"),"Global nesting watchdog is missing");
assert(app.includes("runWatchdogReason"),"Watchdog state is missing");
assert(app.includes('window.SheetNestDxf?.update?.()'),"DXF button state is not synchronized with app state");

const exporter=read("public/dxf-export.js");
assert(exporter.includes("LWPOLYLINE"),"DXF exporter does not emit LWPOLYLINE");
assert(exporter.includes('"SHEET"'),"DXF exporter does not emit a sheet layer");
const laser=read("public/laser-estimator.js");
assert(laser.includes("BODOR_3KW"),"Laser estimator reference table is missing");
assert(laser.includes("laserTotalTime"),"Laser result integration is missing");

const svgnest=read("public/nest/svgnest.js");
assert(svgnest.includes("errorCallback"),"NFP engine error callback is missing");
assert(svgnest.includes("engineSession"),"NFP worker session isolation is missing");

console.log("sheetnest-syntax-smoke: ok");