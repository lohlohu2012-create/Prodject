const assert=require("assert");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

const source=fs.readFileSync(path.join(__dirname,"..","public","nest","util","parallel.js"),"utf8");
const sandbox={
  console,
  setTimeout,
  clearTimeout,
  navigator:{hardwareConcurrency:4},
  location:{protocol:"file:"}
};
sandbox.window=sandbox;

vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:"parallel.js"});

assert.strictEqual(typeof sandbox.Parallel,"function","Parallel must be available");

vm.runInContext(
  `
    window.testDone=false;
    window.testResult=null;
    window.testError=null;
    new Parallel([1],{maxWorkers:1})
      .map(function(value){ return value + global.env.delta; },{delta:41})
      .then(function(result){ window.testResult=result; window.testDone=true; },
            function(error){ window.testError=String(error); window.testDone=true; });
  `,
  sandbox
);

const deadline=Date.now()+1000;
(function wait(){
  if(sandbox.testDone){
    if(sandbox.testError)throw new Error(sandbox.testError);
    assert.strictEqual(JSON.stringify(sandbox.testResult),"[42]","file:// synchronous fallback returned the wrong result");
    console.log("offline-parallel-smoke: ok");
    return;
  }
  if(Date.now()>deadline)throw new Error("Timed out waiting for synchronous fallback");
  setTimeout(wait,10);
})();
