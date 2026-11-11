const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.attributes = {}; this.events = {}; this._value = ''; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, handler) { this.events[name] = handler; }
  remove() { this.parent.children = this.parent.children.filter(item => item !== this); }
  get options() { return this.children; }
  get value() { return this._value || (this.tag === 'select' ? this.children[0]?.value : ''); }
  set value(value) { this._value = String(value); }
}
function find(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children) { const result = find(child, predicate); if (result) return result; }
}
const pdb = 'ATOM      1  CA  ALA A   1       1.000   0.000   0.000  1.00  0.00           C\n' +
  'ATOM      2  CA  GLY A   2       2.000   0.000   0.000  1.00  0.00           C\nEND\n';
const layers = {layers:[{id:'legacy_rpf_heat',label:'Legacy RPF heat index',scope:'model',domain:[0,370],
  color_stops:[{value:0,color:'#0000ff'},{value:370,color:'#ff0000'}],values:[
    {chain:'A',resi:1,model_id:'first',value:370,color:'#ff0000'},
    {chain:'A',resi:2,model_id:'first',value:null,color:'#aeb4be'}],missing_color:'#aeb4be'}]};
const frames = [], styles = [];
let rendered = 0;
const viewer = {addModel(text) {
  frames.push(text); return {show(){},hide(){},getID(){return 0;},setStyle(selection, style){ styles.push(style); }};
},render(){rendered++;},zoomTo(){},clear(){}};
const document = {baseURI:'https://example.test/',currentScript:{src:'https://example.test/current-structure.js'},createElement:tag=>new Element(tag)};
const window = {$3Dmol:{createViewer(){return viewer;}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../structure-presentation.js'),'utf8'),{window});
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../current-structure.js'),'utf8'), {window,document,URL,fetch(){throw Error('Unexpected network call');}});
const tick = async () => { for (let i=0;i<6;i++) await new Promise(resolve=>setImmediate(resolve)); };
const container = new Element('main');
const model = {id:'first',index:1,dp:.8};
const run = {id:'single',models:[model],single_model:true,initial_color:'residue:legacy_rpf_heat',residue_metrics:()=>Promise.resolve(layers)};
(async () => {
  window.RpfStructure.mount(container,{run,model,coordinateText:pdb}); await tick();
  const color = find(container,x=>x.attributes['aria-label']==='Structure color');
  assert.equal(color.value,'residue:legacy_rpf_heat');
  assert.equal(styles.at(-1).cartoon.colorfunc({chain:'A',resi:1}),'#5e4fa2');
  assert.equal(styles.at(-1).cartoon.colorfunc({chain:'A',resi:2}),'#aeb4be');
  assert.equal(styles.at(-1).cartoon.colorfunc({chain:'B',resi:1}),'#aeb4be');
  assert.equal(frames[0],pdb);
  assert(find(container,x=>x.textContent==='Independent single-model residue diagnostic'));
  color.value='dp'; color.events.change();
  let resolve;
  window.RpfStructure.mount(container,{run:{...run,residue_metrics:()=>new Promise(r=>resolve=r)},model,coordinateText:pdb});
  await tick();
  const nextColor = find(container,x=>x.attributes['aria-label']==='Structure color');
  nextColor.value='chain'; nextColor.events.change(); resolve(layers); await tick();
  assert.equal(nextColor.value,'chain','Late diagnostics must preserve a new user choice');
  window.RpfStructure.mount(container,{run:{...run,residue_metrics:()=>Promise.reject(Error('Missing'))},model,coordinateText:pdb}); await tick();
  assert(find(container,x=>x.textContent==='Residue coloring unavailable'));
  assert(rendered>0,'Unavailable diagnostics must preserve the structure');
  let resolveOld;
  const old = window.RpfStructure.mount(container,{run:{...run,residue_metrics:()=>new Promise(r=>resolveOld=r)},model,coordinateText:pdb});
  await tick();old.destroy();resolveOld(layers);await tick();assert.equal(container.children.length,0);
  console.log('Residue colors, exact coordinate preservation, gray missing data, preferences, unavailable data, and stale-load cleanup passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
