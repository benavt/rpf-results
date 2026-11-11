/* Presentation only: Matplotlib Spectral colors and rigid C-alpha ensemble fits. */
(() => {
  'use strict';
  // Matplotlib v3.10.7 _cm.py, _Spectral_data (ColorBrewer Spectral), N=256.
  // https://github.com/matplotlib/matplotlib/blob/v3.10.7/lib/matplotlib/_cm.py
  const stops = ['#9e0142','#d53e4f','#f46d43','#fdae61','#fee08b','#ffffbf','#e6f598','#abdda4','#66c2a5','#3288bd','#5e4fa2'];
  const rgb = color => [1,3,5].map(i => parseInt(color.slice(i,i+2),16));
  const SPECTRAL = Array.from({length:256},(_,i) => {
    const x=i/255*(stops.length-1),j=Math.min(stops.length-2,Math.floor(x)),t=x-j,a=rgb(stops[j]),b=rgb(stops[j+1]);
    return '#'+a.map((v,k)=>Math.round(v+(b[k]-v)*t).toString(16).padStart(2,'0')).join('');
  });
  function spectral(value, low=0, high=1) {
    if (typeof value!=='number' || !Number.isFinite(value)) return '#b9bec7';
    const t=low===high ? .5 : Math.max(0,Math.min(1,(value-low)/(high-low)));
    return SPECTRAL[Math.min(255,Math.floor(t*256))];
  }
  function selection(range) {
    const spans = {all:[[1,139]],'res5-95':[[5,95]],'res32-47-plus78-99':[[32,47],[78,99]]}[range];
    if (!spans) throw Error('The saved clustering residue selection is unavailable.');
    return {chain:'A',positions:spans.flatMap(([a,b])=>Array.from({length:b-a+1},(_,i)=>a+i)),
      label:spans.map(([a,b])=>`${a}–${b}`).join(' + ')};
  }
  function atoms(frame) {
    return frame.split(/\r?\n/).filter(l=>/^(ATOM  |HETATM)/.test(l)).map(line=>{
      const point=[30,38,46].map(i=>Number(line.slice(i,i+8)));
      if(line.length<54 || [30,38,46].some(i=>!line.slice(i,i+8).trim()) || point.some(v=>!Number.isFinite(v))) throw Error('Invalid PDB coordinates.');
      return {line,point};
    });
  }
  function fittingPoints(frame, scope) {
    const found=new Map();
    for(const {line,point} of atoms(frame)) {
      if(!line.startsWith('ATOM  ') || line.slice(12,16).trim()!=='CA' || line.slice(21,22)!==scope.chain) continue;
      const resi=Number(line.slice(22,26));
      if(!scope.positions.includes(resi)) continue;
      if(line[16].trim() || line[26].trim() || found.has(resi)) throw Error('Ambiguous clustering Cα correspondence.');
      found.set(resi,point);
    }
    if(found.size!==scope.positions.length) throw Error('A model is missing clustering Cα residues.');
    return scope.positions.map(p=>found.get(p));
  }
function rigidFit(mobile,reference){
 // Horn's unit-quaternion fit: a proper rigid rotation, without reflection,
 // rescaling, outlier removal or changes to the saved coordinate text.
 if(mobile.length!==reference.length||mobile.length<3||[...mobile,...reference].some(p=>p.length!==3||p.some(v=>!Number.isFinite(v))))throw Error('The clustering residue coordinates do not match.');
 const center=points=>[0,1,2].map(i=>points.reduce((sum,p)=>sum+p[i],0)/points.length),mc=center(mobile),rc=center(reference);
 const centered=(points,c)=>points.map(p=>p.map((v,i)=>v-c[i])),x=centered(mobile,mc),y=centered(reference,rc);
 for(const points of [x,y]){
  const lengths=points.map(p=>p.reduce((sum,v)=>sum+v*v,0)),axis=points[lengths.indexOf(Math.max(...lengths))],scale=Math.max(...lengths);
  const area=Math.max(...points.map(p=>[axis[1]*p[2]-axis[2]*p[1],axis[2]*p[0]-axis[0]*p[2],axis[0]*p[1]-axis[1]*p[0]].reduce((sum,v)=>sum+v*v,0)));
  if(!Number.isFinite(scale)||!Number.isFinite(area)||scale<1e-12||area<1e-12*scale*scale)throw Error('The clustering residues cannot define a stable orientation.');
 }
 const s=[0,1,2].map(i=>[0,1,2].map(j=>x.reduce((sum,p,k)=>sum+p[i]*y[k][j],0)));
 const [[a,b,c],[d,e,f],[g,h,i]]=s;
 const n=[[a+e+i,f-h,g-c,b-d],[f-h,a-e-i,b+d,c+g],[g-c,b+d,-a+e-i,f+h],[b-d,c+g,f+h,-a-e+i]],v=Array.from({length:4},(_,r)=>Array.from({length:4},(_,c)=>Number(r===c)));
 if(n.flat().some(value=>!Number.isFinite(value)))throw Error('The structure alignment is not finite.');
 for(let sweep=0;sweep<64;sweep++){
  let p=0,q=1;for(let r=0;r<4;r++)for(let c=r+1;c<4;c++)if(Math.abs(n[r][c])>Math.abs(n[p][q])){p=r;q=c}
  if(Math.abs(n[p][q])<1e-13*Math.max(1,...n.map((row,r)=>Math.abs(row[r]))))break;
  const angle=.5*Math.atan2(2*n[p][q],n[q][q]-n[p][p]),cs=Math.cos(angle),sn=Math.sin(angle),pp=n[p][p],qq=n[q][q],pq=n[p][q];
  for(let r=0;r<4;r++)if(r!==p&&r!==q){const rp=n[r][p],rq=n[r][q];n[r][p]=n[p][r]=cs*rp-sn*rq;n[r][q]=n[q][r]=sn*rp+cs*rq}
  n[p][p]=cs*cs*pp-2*sn*cs*pq+sn*sn*qq;n[q][q]=sn*sn*pp+2*sn*cs*pq+cs*cs*qq;n[p][q]=n[q][p]=0;
  for(let r=0;r<4;r++){const rp=v[r][p],rq=v[r][q];v[r][p]=cs*rp-sn*rq;v[r][q]=sn*rp+cs*rq}
 }
 const largest=n.map((row,r)=>row[r]),column=largest.indexOf(Math.max(...largest)),quaternion=v.map(row=>row[column]),norm=Math.hypot(...quaternion),[w,qx,qy,qz]=quaternion.map(value=>value/norm);
 const rotation=[[1-2*(qy*qy+qz*qz),2*(qx*qy-qz*w),2*(qx*qz+qy*w)],[2*(qx*qy+qz*w),1-2*(qx*qx+qz*qz),2*(qy*qz-qx*w)],[2*(qx*qz-qy*w),2*(qy*qz+qx*w),1-2*(qx*qx+qy*qy)]];
 const translation=rc.map((value,r)=>value-rotation[r].reduce((sum,value,c)=>sum+value*mc[c],0));
 if([...rotation.flat(),...translation].some(value=>!Number.isFinite(value)))throw Error('The structure alignment is not finite.');
 return {rotation,translation};
}
  function alignEnsemble(frames, scope, ids=[]) {
    if(!frames.length || !scope || !Array.isArray(scope.positions) || scope.positions.length<3 ||
       new Set(scope.positions).size!==scope.positions.length || !scope.positions.every(Number.isInteger))
      throw Error('At least three declared clustering residues are required.');
    const reference=fittingPoints(frames[0],scope);
    rigidFit(reference,reference); // Reject a degenerate reference before changing any frame.
    const aligned=frames.map((frame,i)=>{
      const fit=rigidFit(fittingPoints(frame,scope),reference);
      return frame.split(/\r?\n/).map(line=>{
        if(line.startsWith('ANISOU')) throw Error('Anisotropic records require an explicit tensor transform.');
        if(!/^(ATOM  |HETATM)/.test(line)) return line;
        const point=[30,38,46].map(p=>Number(line.slice(p,p+8)));
        const xyz=fit.rotation.map((row,r)=>row.reduce((sum,v,c)=>sum+v*point[c],fit.translation[r]));
        const fields=xyz.map(v=>{if(!Number.isFinite(v)) throw Error('Invalid aligned coordinate.');const s=(Math.abs(v)<.0005?0:v).toFixed(3);if(s.length>8)throw Error('Aligned coordinate exceeds PDB width.');return s.padStart(8);});
        return i===0?line:line.slice(0,30)+fields.join('')+line.slice(54);
      }).join('\n');
    });
    const label=`Aligned on chain ${scope.chain} Cα residues ${scope.label || scope.positions.join(', ')} to model 1`;
    const pdb='REMARK 950 '+label.replace('Cα','CA').replaceAll('–','-')+'\nREMARK 950 RIGID DISPLAY TRANSFORMS; ORIGINAL SCORED COORDINATES PRESERVED SEPARATELY\n'+aligned.map((frame,i)=>
      'MODEL     '+String(i+1).padStart(4)+'\nREMARK 950 SOURCE_MODEL '+String(ids[i]||i+1).replace(/[\r\n]/g,' ')+'\n'+
      frame.split(/\r?\n/).filter(l=>l && !/^(?:MODEL|ENDMDL|END)(?:\s|$)/.test(l)).join('\n')+'\nENDMDL\n').join('')+'END\n';
    return {frames:aligned,pdb,label};
  }
  window.RpfPresentation={SPECTRAL,spectral,selection,alignEnsemble};
})();
