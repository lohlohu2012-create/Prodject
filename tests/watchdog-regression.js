const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.join(__dirname,"..");
const app=fs.readFileSync(path.join(root,"public/app.js"),"utf8");
const index=fs.readFileSync(path.join(root,"public/index.html"),"utf8");
const css=fs.readFileSync(path.join(root,"public/styles.css"),"utf8");

assert(app.includes("function startRunWatchdog"),"Watchdog start function is missing");
assert(app.includes("function renderWatchdogPanel"),"Watchdog UI renderer is missing");
assert(app.includes('state.runWatchdogState="stalled"'),"Watchdog stalled state is missing");
assert(app.includes('state.runWatchdogReason="global-timeout"'),"Watchdog global timeout is missing");
assert(app.includes("runWatchdogLastInstanceId"),"Watchdog instance telemetry is missing");
assert(app.includes("runWatchdogLastUnitId"),"Watchdog unit telemetry is missing");
assert(app.includes("runWatchdogCandidateChecks"),"Watchdog candidate telemetry is missing");
assert(app.includes("runWatchdogNfpChecks"),"Watchdog NFP telemetry is missing");
assert(app.includes("renderWatchdogPanel()"),"Watchdog panel refresh is not wired");

assert(index.includes('id="watchdogPanel"'),"Watchdog panel is missing from GUI");
assert(index.includes('id="watchdogState"'),"Watchdog state field is missing from GUI");
assert(index.includes('id="watchdogStage"'),"Watchdog stage field is missing from GUI");
assert(index.includes('id="watchdogDetail"'),"Watchdog telemetry area is missing from GUI");
assert(css.includes(".watchdog-panel"),"Watchdog styles are missing");

console.log("watchdog-regression: ok");
