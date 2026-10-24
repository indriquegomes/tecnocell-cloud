// Gera artefato local; não chama Vercel, Git remoto ou banco.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const JSZip=require('jszip');
const root=path.resolve(__dirname,'..');
const sources={
 'index.html':'docs/halloween-site-index-20261022.html',
 'app.js':'docs/halloween-site-app-20261022.mjs',
 'api.mjs':'docs/halloween-site-api-20261022.mjs',
 'style.css':'docs/halloween-site-style-20261022.css',
 'result.css':'docs/halloween-site-result-20261024.css',
 'atmosphere.mjs':'docs/halloween-site-atmosphere-20261022.mjs',
};
function commonDir(){return execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim();}
async function loadSite({assetsArchive=path.join(path.dirname(commonDir()),'docs/halloween-site-20261022.zip'),localApi=null}={}){
 const archive=await JSZip.loadAsync(fs.readFileSync(assetsArchive)),files=new Map();
 for(const [name,file]of Object.entries(archive.files))if(!file.dir&&(name.startsWith('assets/')||['product-art.mjs','vercel.json'].includes(name)))files.set(name,await file.async('nodebuffer'));
 if(!files.has('product-art.mjs')||!files.has('assets/witch-cauldron.webp'))throw Error('Pacote original de assets incompleto.');
 for(const [name,source]of Object.entries(sources))files.set(name,fs.readFileSync(path.join(root,source)));
 if(localApi){
  if(localApi.url!=='http://127.0.0.1:55421')throw Error('Prévia aceita somente API local55421.');
  files.set('api.mjs',Buffer.from(files.get('api.mjs').toString().replace(/export const serviceUrl=.*;/,`export const serviceUrl=${JSON.stringify(localApi.url)};`).replace(/export const publishableKey=.*;/,`export const publishableKey=${JSON.stringify(localApi.anonKey)};`).replace("export const campaignId='halloween-2026';","export const campaignId='halloween-2026-test';")));
 }
 return files;
}
async function build(output=path.join(commonDir(),'halloween-result-delivery-20261024')){
 const files=await loadSite(),zip=new JSZip(),manifest=[];
 fs.mkdirSync(path.join(output,'site'),{recursive:true});
 for(const [name,body]of files){
  const target=path.join(output,'site',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,body);zip.file(name,body);
  manifest.push({file:name,sha256:crypto.createHash('sha256').update(body).digest('hex'),size:body.length,source:sources[name]||'assets preservados do pacote anterior'});
 }
 fs.writeFileSync(path.join(output,'halloween-site-result.zip'),await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
 console.log(`Pacote local gerado: ${output}. Publicação e migração de produção pendentes.`);
 return {output,manifest};
}
module.exports={loadSite,build,sources};
if(require.main===module)build(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});
