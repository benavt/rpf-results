const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {webcrypto,createHash} = require('node:crypto');
const {gzipSync} = require('node:zlib');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const model = {id:'first',structure:{path:'current/queries/0000.pdbpack.gz',sha256:'a'.repeat(64)}};
const second = {id:'second',structure:{...model.structure,sha256:'b'.repeat(64)}};
function setup({wrongModel=false,wrongContext=false,corrupt=false}={}) {
  const data = Buffer.from(JSON.stringify({score_context:'independent_single_model',models:{
    first:{query_sha256:wrongModel?'c'.repeat(64):model.structure.sha256,values:[[370,null],[5,null]],heat_colors:['#ff0000','#aeb4be']},
    second:{query_sha256:second.structure.sha256,values:[[0,null],[10,null]],heat_colors:['#0000ff','#aeb4be']}
  }}));
  const packed = gzipSync(data);
  const index = Buffer.from(JSON.stringify({score_context:wrongContext?'ensemble':'independent_single_model',
    input_version:'TR',control_variant:'original',model_index_sha256:'d'.repeat(64),models:2,
    coordinate_packs:{[model.structure.path]:{path:'current/model-diagnostics/0000.json.gz',sha256:sha(packed)}},
    layers:[{id:'legacy_rpf_heat',scope:'model'},{id:'precision_violation_groups',scope:'model',unit:'groups'}],
    residues:[{chain:'A',resi:1},{chain:'A',resi:2}]}));
  const catalog = {peak_list_version:'TR',rpf_control_variant:'original',independent_models:{sha256:'d'.repeat(64),count:2,
    residue_diagnostics:{path:'current/model-diagnostics.json',sha256:sha(index)}}};
  const calls = [];
  const window = {};
  const source = fs.readFileSync(path.join(__dirname,'../current.js'),'utf8');
  const replaced = source.replace(/\n  load\(\);\n\}\)\(\);\s*$/, '\n  window.testLoader={singleDiagnostics,setCatalog(value){catalog=value;}};\n})();');
  assert.notEqual(replaced,source);
  vm.runInNewContext(replaced,{window,document:{baseURI:'https://example.test/'},URL,TextDecoder,Uint8Array,
    crypto:webcrypto,Blob,Response,DecompressionStream,fetch:async url=>{
      calls.push(url.pathname);
      const body=url.pathname.endsWith('model-diagnostics.json')?index:corrupt?Buffer.from('corrupt'):packed;
      return new Response(body);
    }});
  window.testLoader.setCatalog(catalog);
  return {loader:window.testLoader,calls};
}
(async()=>{
  const {loader,calls}=setup();
  const first=await loader.singleDiagnostics(model),next=await loader.singleDiagnostics(second);
  assert.equal(first.layers[0].values[0].color,'#ff0000');
  assert.equal(next.layers[0].values[0].color,'#0000ff');
  assert.equal(next.layers[0].values[0].model_id,'second');
  assert.equal(next.layers[0].values[1].value,null);
  assert.deepEqual(Array.from(first.layers[1].domain),[0,5]);
  assert.deepEqual(Array.from(next.layers[1].domain),[0,10]);
  assert.equal(calls.length,2,'Models sharing a pack should reuse both validated requests');
  await assert.rejects(setup({wrongModel:true}).loader.singleDiagnostics(model),/selected scored model/);
  await assert.rejects(setup({wrongContext:true}).loader.singleDiagnostics(model),/source differs/);
  await assert.rejects(setup({corrupt:true}).loader.singleDiagnostics(model),/checksum/);
  console.log('Residue pack caching, model-specific values and scales, coordinate identity, cohort identity, and checksum failures passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
