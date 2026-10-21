const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const vm=require("node:vm");

const filename=path.join(__dirname,"..","lib/shopify-merchant-list.ts");
const result=ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  fileName:filename,
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
});
const mod={exports:{}};
vm.runInThisContext("(function(require,module,exports){"+result.outputText+"\n})",{filename})(require,mod,mod.exports);
const {listQuery,searchPage}=mod.exports;

test("merchant pagination refuses negative, fractional and excessive pages",()=>{
  for(const bad of [-5,1.5,Infinity,2001,"8",NaN]) {
    assert.equal(listQuery({page:bad}).page,0);
  }
  assert.equal(listQuery({page:24}).page,24);
  assert.equal(listQuery({page:2000}).page,2000);
  assert.equal(listQuery({}).pageSize,25);
});
test("server trims and bounds free-text merchant search",()=>{
  const attack="  DROP TABLE lead; " + "x".repeat(100);
  const parsed=listQuery({search:attack});
  assert.equal(parsed.search.length,80);
  assert.ok(parsed.search.startsWith("DROP TABLE lead;"));
  assert.equal(listQuery({search:42}).search,"");
});
test("merchant pagination includes useful totals without leaking filters",()=>{
  const query=listQuery({page:2,search:"dress"});
  assert.deepEqual(searchPage([{id:"a"}],51,query,{status:"HOT"}),{
    items:[{id:"a"}],total:51,page:2,pageSize:25,pageCount:3,
    search:"dress",status:"HOT",
  });
  assert.equal(searchPage([],0,listQuery({})).pageCount,0);
});
