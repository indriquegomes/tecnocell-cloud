const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const file=path.join(__dirname,'../lib/halloween-pdv.ts'),exportsObject={};
const src=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(src,{exports:exportsObject,Number,Math,Error});
const {halloweenUnitDiscount,isAutomaticPromotion}=exportsObject;
assert.equal(halloweenUnitDiscount(21.5,18),3.87);assert.equal(halloweenUnitDiscount(83,15),12.45);assert.equal(halloweenUnitDiscount(0.1,15),0.02);
for(const args of [[-1,15],[10,101],[NaN,15],[10,NaN]])assert.throws(()=>halloweenUnitDiscount(...args));
assert.equal(isAutomaticPromotion({manual_only:true}),false);assert.equal(isAutomaticPromotion({}),true);
console.log('PASS Halloween PDV: manual only, percent unit rounding, invalid input');
