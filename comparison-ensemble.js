/* Assemble only the selected saved members; never sample or run RPF. */
(() => {
  'use strict';
  let indexPromise, active, serial=0;
  const packs=new Map();
  function asset(path) {
    if(!/^current\/[a-zA-Z0-9_.\/-]+$/.test(path) || path.split('/').includes('..'))throw Error('Invalid coordinate path.');
    return new URL(path,document.baseURI);
  }
  async function verify(bytes, expected) {
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==expected)throw Error('Saved member checksum differs.');return bytes;
  }
  async function response(path) { const r=await fetch(asset(path));if(!r.ok)throw Error('Saved coordinates unavailable.');return r; }
  async function modelIndex() {
    if(!indexPromise)indexPromise=(async()=>{
      const catalog=await (await response('current/catalog.json')).json(),record=catalog.independent_models;
      const bytes=new Uint8Array(await (await response(record.path)).arrayBuffer());await verify(bytes,record.sha256);
      const rows=JSON.parse(new TextDecoder().decode(bytes));
      if(rows.length!==record.count || new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Model index differs from catalog.');
      return new Map(rows.map(r=>[r.id,r]));
    })().catch(e=>{indexPromise=null;throw e;});
    return indexPromise;
  }
  async function pack(path) {
    if(!packs.has(path)) {
      packs.set(path,(async()=>{const r=await response(path);return new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());})().catch(e=>{packs.delete(path);throw e;}));
      if(packs.size>2)packs.delete(packs.keys().next().value);
    }
    return packs.get(path);
  }
  async function memberFrames(ids,index,token) {
    const groups=new Map(),frames=new Map();
    for(const id of ids){const row=index.get(id);if(!row)throw Error('Saved member is missing from the coordinate index.');const path=row.structure.path;if(!groups.has(path))groups.set(path,[]);groups.get(path).push(row);}
    for(const [path,rows] of groups) {
      if(token!==serial)return null;
      const bytes=await pack(path);
      for(const row of rows){const r=row.structure;if(!Number.isInteger(r.offset)||!Number.isInteger(r.bytes)||r.offset<0||r.bytes<=0||r.offset+r.bytes>bytes.length)throw Error('Incomplete member coordinates.');
        const raw=bytes.subarray(r.offset,r.offset+r.bytes);await verify(raw,r.sha256);frames.set(row.id,new TextDecoder().decode(raw));}
    }
    return ids.map(id=>frames.get(id));
  }
  function clear() { serial++;active?.destroy();active=null; }
  async function show(row,container) {
    clear();const token=serial;
    container.textContent='Loading and verifying saved members…';
    try {
      const ids=row.members;
      if(row.score_context!=='native_ensemble'||!Array.isArray(ids)||ids.length!==row.models||new Set(ids).size!==ids.length)throw Error('A complete native ensemble member list is required.');
      const index=await modelIndex(),frames=await memberFrames(ids,index,token);
      if(token!==serial||!frames)return;
      const text=frames.map((f,i)=>'MODEL     '+String(i+1).padStart(4)+'\n'+f.split(/\r?\n/).filter(l=>l&&!/^(?:MODEL|ENDMDL|END)(?:\s|$)/.test(l)).join('\n')+'\nENDMDL\n').join('')+'END\n';
      active=window.RpfStructure.mount(container,{coordinateText:text,run:{id:row.id,initial_display:'ensemble',
        models:ids.map((id,i)=>({...index.get(id),id,index:i+1})),alignment:window.RpfPresentation.selection(row.range),
        residue_metrics:()=>Promise.resolve({layers:[]}),model_score_label:'Independent model'}});
    }catch(e){if(token===serial)container.textContent='Ensemble unavailable: '+e.message;}
  }
  window.RpfComparisonEnsemble={show,clear};
})();
