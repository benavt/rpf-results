const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),zlib=require('node:zlib');
const root=path.join(__dirname,'..'),window={};
vm.runInNewContext(fs.readFileSync(path.join(root,'structure-presentation.js'),'utf8'),{window});
const {spectral,selection,alignEnsemble}=window.RpfPresentation;
assert.equal(spectral(0),'#9e0142');assert.equal(spectral(1),'#5e4fa2');assert.equal(spectral(.5),'#ffffbe');
assert.equal(spectral(-3),'#9e0142');assert.equal(spectral(5),'#5e4fa2');assert.equal(spectral(null),'#b9bec7');
assert.equal(spectral(-.5,-1,0),spectral(.5));assert.equal(spectral(4,4,4),'#ffffbe');
function frame(points){return points.map((p,i)=>`ATOM  ${String(i+1).padStart(5)}  CA  ALA A${String(i+1).padStart(4)}    ${p.map(v=>v.toFixed(3).padStart(8)).join('')}  1.00 20.00           C`).join('\n')+'\nEND\n';}
function points(text){return text.split('\n').filter(l=>l.startsWith('ATOM  ')).map(l=>[30,38,46].map(i=>Number(l.slice(i,i+8))));}
const reference=frame([[0,0,0],[2,0,0],[0,3,0],[1,2,4]]),mobile=frame([[10,20,30],[10,22,30],[7,20,30],[100,200,300]]);
const original=[reference,mobile],scope={chain:'A',positions:[1,2,3],label:'1–3'};
const result=alignEnsemble(original,scope,['first','second']),p=points(result.frames[1]);
for(let i=0;i<3;i++)assert(Math.hypot(...p[i].map((v,k)=>v-points(reference)[i][k]))<.002,'Fit must use only clustering residues');
assert(Math.hypot(...p[3])>100,'Excluded residue must not influence the fit');
assert.equal(result.frames[0],reference);assert.equal(original[1],mobile);
for(const [i,line]of mobile.split('\n').filter(l=>l.startsWith('ATOM  ')).entries()){
 const next=result.frames[1].split('\n').filter(l=>l.startsWith('ATOM  '))[i];assert.equal(next.slice(0,30),line.slice(0,30));assert.equal(next.slice(54),line.slice(54));
}
const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));assert(Math.abs(dist(p[0],p[3])-dist(points(mobile)[0],points(mobile)[3]))<.002);
assert.equal((result.pdb.match(/^MODEL\s/gm)||[]).length,2);assert.equal((result.pdb.match(/^ENDMDL$/gm)||[]).length,2);
assert(result.pdb.indexOf('SOURCE_MODEL first')<result.pdb.indexOf('SOURCE_MODEL second'));
assert.throws(()=>alignEnsemble([reference,frame([[0,0,0],[2,0,0]])],scope),/missing clustering/);
assert.throws(()=>alignEnsemble([frame([[0,0,0],[1,0,0],[2,0,0]])],scope),/stable orientation/);
assert.throws(()=>selection('invented'),/unavailable/);
assert.equal(selection('res32-47-plus78-99').positions.length,38);
const panels=JSON.parse(fs.readFileSync(path.join(root,'current/ensembles.json')));
for(const range of ['all','res5-95','res32-47-plus78-99']){
 const panel=panels.find(p=>p.residue_range===range),raw=zlib.gunzipSync(fs.readFileSync(path.join(root,panel.structure.path))).toString();
 const frames=[...raw.matchAll(/^MODEL[^\n]*\n([\s\S]*?)^ENDMDL[^\n]*$/gm)].map(m=>m[1]);
 assert.equal(frames.length,50);const display=alignEnsemble(frames,selection(range),panel.members);
 assert.equal((display.pdb.match(/^MODEL\s/gm)||[]).length,50);assert.equal((display.pdb.match(/^ENDMDL$/gm)||[]).length,50);
 for(const i of [0,1,49]){
  const before=points(frames[i]),after=points(display.frames[i]);assert.equal(after.length,before.length);
  assert(Math.abs(dist(before[0],before.at(-1))-dist(after[0],after.at(-1)))<.003,'Rigid display must preserve internal distances');
 }
}
console.log('Spectral samples, clustering-only rigid fits, ordered multi-model downloads, unchanged atom identities, invalid selections, and three real 50-model scopes passed.');
