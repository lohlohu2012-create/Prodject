const assert=require("assert");
const fs=require("fs");
const path=require("path");

const root=path.join(__dirname,"..");
const worker=fs.readFileSync(path.join(root,"public/nest/util/placementworker.js"),"utf8");
const nest=fs.readFileSync(path.join(root,"public/nest/svgnest.js"),"utf8");
const app=fs.readFileSync(path.join(root,"public/app.js"),"utf8");

assert(worker.includes("collectCandidates"),"NFP candidate collector is missing");
assert(worker.includes("segmentSamples"),"NFP segment sampling is missing");
assert(worker.includes("candidateBudget"),"NFP candidate budget is missing");
assert(worker.includes("nfpSearchBudgetMs"),"NFP bounded search budget is missing");
assert(worker.includes("budgetExceededCount"),"NFP budget telemetry is missing");
assert(worker.includes('source:"segment"'),"NFP interior segment candidates are missing");
assert(worker.includes("out.sort"),"NFP candidate prioritization is missing");
assert(worker.includes("searchBudgetHit"),"NFP deadline guard is missing");

assert(nest.includes("candidateBudget"),"SvgNest candidate budget config is missing");
assert(nest.includes("segmentSamples"),"SvgNest segment sample config is missing");
assert(nest.includes("nfpSearchBudgetMs"),"SvgNest NFP budget config is missing");
assert(nest.includes("nfpCacheHits"),"NFP cache hit telemetry is missing");
assert(nest.includes("nfpCacheMisses"),"NFP cache miss telemetry is missing");

assert(app.includes("nfpCacheHits"),"GUI/Watchdog NFP cache hit integration is missing");
assert(app.includes("nfpCacheMisses"),"GUI/Watchdog NFP cache miss integration is missing");
assert(app.includes("budgetExceededCount"),"GUI/Watchdog NFP budget integration is missing");

console.log("nfp-search-2-regression: ok");
