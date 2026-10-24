const {build,sources}=require('../scripts/package-halloween.cjs');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const JSZip=require('jszip');
async function main(){
 const {output}=await build(process.argv[2]);
 const zip=await JSZip.loadAsync(fs.readFileSync(path.join(output,'halloween-site-result.zip')));
 for(const [name,source]of Object.entries(sources)){
  const expected=fs.readFileSync(path.resolve(__dirname,'..',source));
  assert.ok(expected.equals(await zip.file(name).async('nodebuffer')),`ZIP diverge da fonte: ${name}`);
  assert.ok(expected.equals(fs.readFileSync(path.join(output,'site',name))),`Diretório diverge da fonte: ${name}`);
 }
 for(const name of Object.keys(zip.files))assert.ok(!/\.sql$|\.env|status-local|private|service.role/i.test(name),'Arquivo interno no pacote público');
 console.log('PASS pacote: ZIP e diretório usam as mesmas6 fontes canônicas; nenhum SQL ou configuração local incluído.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
