const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash,webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p));
const data=p=>JSON.parse(read(p));
const v1=data('current/models.json'),v3=data('current/v3/models.json');
const model=v3.find(r=>r.id.endsWith('AFSample3__0000'));
const archive=v1.find(r=>r.id===model.id);
const digest=raw=>createHash('sha256').update(raw).digest('hex');
const contextURL=(search,hash)=>new URL(`http://preview.test/rpf-results/${search}${hash}`);

async function render(search,hash,crypto) {
  const elements=new Map(), mounted=[], calls=[];
  const document={baseURI:'http://preview.test/rpf-results/',getElementById(id){
    if(!elements.has(id)) elements.set(id,{value:'',textContent:'',hidden:false,items:[],
      setAttribute(){},removeAttribute(){},addEventListener(){},
      append(...options){this.items.push(...options);},
      replaceChildren(...options){this.items=options;this.value=options[0]?.value||'';}
    });
    return elements.get(id);
  }};
  const location=contextURL(search,hash),window={addEventListener(){},RpfStructure:{mount(_,payload){mounted.push(payload);return {destroy(){}};}}};
  const Option=function(label,value){return {label,value};};
  const source=read('current.js').toString().replace(/\n  load\(\);\n/, '\n  window.ready=load();\n');
  const context={window,location,document,URL,URLSearchParams,Option,TextDecoder,Uint8Array,Blob,Response,DecompressionStream,crypto,
    fetch:async url=>{const file=url.pathname.replace(/^\/rpf-results\//,'');calls.push(file);return new Response(read(file));}};
  vm.runInNewContext(read('score-checksum.js').toString(),context);
  assert.equal(await window.RpfChecksum(new Uint8Array(Buffer.from('abc'))),digest('abc'));
  vm.runInNewContext(source,context);
  await window.ready;
  for(let i=0;!mounted.length&&i<100;i++) await new Promise(r=>setTimeout(r,20));
  assert.equal(mounted.length,1,elements.get('current-structure')?.innerHTML);
  return {get:id=>elements.get(id),structure:mounted[0],calls};
}

(async()=>{
  const link='#models?id='+encodeURIComponent(model.id);
  const recent=await render('',link,undefined);
  assert.match(recent.get('result-count').textContent,/12,104 \/ 12,104/);
  assert.match(recent.get('score-context').textContent,/2026-11-13-v3/);
  assert.equal(recent.structure.model.dp,model.dp);
  assert.equal(recent.structure.run.residue_metrics,undefined);
  assert.equal(digest(recent.structure.coordinateText),model.structure.sha256);
  assert.equal(recent.get('structure-download').hidden,false);
  assert.ok(!recent.calls.includes('current/models.json'));
  const old=await render('?input=v1',link,webcrypto);
  assert.match(old.get('score-context').textContent,/2026-11-06-v1/);
  assert.equal(old.structure.model.dp,archive.dp);
  assert.equal(typeof old.structure.run.residue_metrics,'function');
  assert.notEqual(old.structure.model.dp,recent.structure.model.dp);
  const focused=await render('?cohort=2000',link,webcrypto);
  assert.match(focused.get('result-count').textContent,/2,000 \/ 2,000/);
  assert.deepEqual(focused.get('method-filter').items.map(r=>r.value),['afsample3','bioemu2']);
  console.log('v3 default, v1 diagnostics, exact scored coordinate and checksum, and 2,000-model routes passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
