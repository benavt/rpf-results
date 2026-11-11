const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto'),{gzipSync}=require('node:zlib');
const root=path.join(__dirname,'..'),sha=b=>createHash('sha256').update(b).digest('hex');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.attributes={};this.events={};}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
 appendChild(n){this.append(n);return n;} replaceChildren(...n){this.children=[];this.append(...n);}
 setAttribute(k,v){this.attributes[k]=v;} addEventListener(k,v){this.events[k]=v;}
 get options(){return this.children;} remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
}
function frame(dx){return [[1,0,0],[0,2,0],[0,0,3]].map((p,i)=>`ATOM  ${String(i+1).padStart(5)}  CA  ALA A${String(i+1).padStart(4)}    ${[p[0]+dx,p[1],p[2]].map(v=>v.toFixed(3).padStart(8)).join('')}  1.00 20.00           C`).join('\n')+'\nEND\n';}
const raw=[Buffer.from(frame(0)),Buffer.from(frame(20))],packed=gzipSync(Buffer.concat(raw));
const rows=raw.map((b,i)=>({id:['first','second'][i],dp:.5+i*.1,structure:{path:'current/queries/test.pdbpack.gz',offset:i?raw[0].length:0,bytes:b.length,sha256:sha(b)}}));
const index=Buffer.from(JSON.stringify(rows)),catalog=JSON.stringify({independent_models:{path:'current/models.json',sha256:sha(index),count:2}});
const loaded=[],calls=[];const viewer={addModel(text){loaded.push(text);return{show(){},hide(){},getID(){return 1;},setStyle(){}};},render(){},zoomTo(){},clear(){}};
const window={$3Dmol:{createViewer(){return viewer;}}},document={baseURI:'https://example.test/',currentScript:{src:'https://example.test/current-structure.js'},createElement:t=>new Element(t)};
const context={window,document,URL,Blob,Response,DecompressionStream,TextDecoder,Uint8Array,crypto:webcrypto,fetch:async url=>{
 calls.push(url.pathname);const b=url.pathname.endsWith('catalog.json')?catalog:url.pathname.endsWith('models.json')?index:packed;return new Response(b);
}};
for(const f of ['structure-presentation.js','current-structure.js','comparison-ensemble.js'])vm.runInNewContext(fs.readFileSync(path.join(root,f),'utf8'),context);
// This fixture uses the public alignment selection interface; the selected range
// is shortened to the fixture's three residues, not a different native input.
window.RpfPresentation.selection=()=>({chain:'A',positions:[1,2,3],label:'1–3'});
(async()=>{
 const container=new Element('main');await window.RpfComparisonEnsemble.show({id:'saved',range:'all',score_context:'native_ensemble',models:2,members:['second','first']},container);
 for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));
 assert.equal(loaded.length,2);assert(loaded[0].includes('21.000'));assert(loaded[1].includes('21.000'),'Second member must fit the first saved member, preserving requested order');
 assert.equal(calls.filter(p=>p.endsWith('test.pdbpack.gz')).length,1,'Members sharing a pack fetch it once');
 window.RpfComparisonEnsemble.clear();
 const rejected=new Element('main');await window.RpfComparisonEnsemble.show({score_context:'native_ensemble',models:2,members:['first','first']},rejected);assert.match(rejected.textContent,/complete native ensemble/);
 // An unknown saved member must fail before the renderer sees another model.
 const before=loaded.length;const invalid=new Element('main');await window.RpfComparisonEnsemble.show({id:'bad',range:'all',score_context:'native_ensemble',models:2,members:['first','unknown']},invalid);
 assert.match(invalid.textContent,/missing from the coordinate index/);assert.equal(loaded.length,before);
 console.log('Comparison saved-member verification, pack reuse, requested order, displayed alignment, and incomplete selection rejection passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
