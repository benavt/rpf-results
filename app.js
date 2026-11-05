/* Public, read-only results. All resources belong to this published snapshot. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = {runs:[],detail:null,selected:null,selectedModel:null,tab:'models',sort:'dp',ascending:false,viewer:null,request:0,open:{}};
  const esc = value => String(value ?? '').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const finite = value => value !== null && value !== undefined && Number.isFinite(Number(value));
  const score = value => finite(value) ? Number(value).toFixed(2) : '—';
  const bytes = value => finite(value) ? Number(value)<1e6 ? `${(Number(value)/1000).toFixed(1)} KB` : `${(Number(value)/1e6).toFixed(1)} MB` : '—';
  const title = run => run.title || run.name || run.id;
  const inputLabel = value => ({original:'Original inputs',uploaded:'Uploaded inputs'}[value] || value || 'Inputs');
  const stateLabel = value => /^S\d+$/.test(value || '') ? `State ${Number(value.slice(1))}` : value || 'Models';
  const metric = (row,key) => row[key] ?? row[`RPF_${{recall:'Recall',precision:'Precision',dp:'DP'}[key]}`];
  const artifacts = run => run.artifacts || run.files || [];
  function resource(path) {
    if (typeof path!=='string' || !path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) throw new Error('Invalid published resource');
    const base=new URL('.',document.baseURI),url=new URL(path,base);
    if (url.origin!==base.origin || !url.pathname.startsWith(base.pathname)) throw new Error('Resource is outside this snapshot');
    return url.href;
  }
  async function read(path) {
    const response=await fetch(resource(path),{credentials:'omit'});
    if (!response.ok) throw new Error(`Result unavailable (${response.status})`);
    return response.json();
  }
  function linkURL(url) {try {const parsed=new URL(url);return parsed.protocol==='https:' ? parsed.href : null;}catch{return null;}}
  function notice(message) {$('notice').textContent=message;$('notice').hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>{$('notice').hidden=true;},6000);}
  function groupRuns(runs) {
    const targets=new Map();
    for (const run of runs) {
      const target=run.target || 'Models',branch=run.state || 'Models',identity=run.collection_id || run.id;
      if (!targets.has(target)) targets.set(target,{name:target,states:new Map(),definitions:new Set()});
      const item=targets.get(target);
      if (run.collection_definition) item.definitions.add(run.collection_definition);
      if (!item.states.has(branch)) item.states.set(branch,{name:branch,collections:new Map()});
      const stage=item.states.get(branch);
      if (!stage.collections.has(identity)) stage.collections.set(identity,{id:identity,label:run.collection_label || `${run.sampling} · ${run.model_count} models`,runs:[]});
      stage.collections.get(identity).runs.push(run);
    }
    return [...targets.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(target=>({...target,
      states:[...target.states.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true})).map(branch=>({...branch,
        collections:[...branch.collections.values()].sort((a,b)=>a.label.localeCompare(b.label)).map(collection=>({...collection,
          runs:collection.runs.sort((a,b)=>String(a.input_variant).localeCompare(String(b.input_variant)))}))}))}));
  }
  function visibleRuns() {
    const q=$('run-search').value.trim().toLowerCase();
    return state.runs.filter(run=>(!q || [title(run),run.target,run.state,stateLabel(run.state),run.sampling,inputLabel(run.input_variant)].join(' ').toLowerCase().includes(q)) && (!$('sampling-filter').value || run.sampling===$('sampling-filter').value) && (!$('variant-filter').value || run.input_variant===$('variant-filter').value));
  }
  function renderLibrary() {
    const runs=visibleRuns(),tree=groupRuns(runs),filtering=Boolean($('run-search').value || $('sampling-filter').value || $('variant-filter').value);
    $('run-count').textContent=`${new Set(runs.map(run=>run.collection_id || run.id)).size} collections · ${runs.length} results`;
    const opened=(key,selected,fallback)=>filtering || selected || (state.open[key] ?? fallback) ? ' open' : '';
    $('run-list').innerHTML=tree.length ? tree.map(target=>`<section class="target-library"><div class="target-heading"><h2>${esc(target.name)}</h2><span>DP</span></div>${target.definitions.size===1 ? `<div class="cluster-definition">${esc([...target.definitions][0])}</div>` : ''}${target.states.map(branch=>{
      const key=`${target.name}:${branch.name}`,selected=branch.collections.some(c=>c.runs.some(r=>r.id===state.selected));
      return `<details data-group="${esc(key)}" class="state-group"${opened(key,selected,true)}><summary>${esc(stateLabel(branch.name))}<span>${branch.collections.length} collections</span></summary>${branch.collections.map(collection=>{
        const child=key+':'+collection.id,chosen=collection.runs.some(run=>run.id===state.selected);
        return `<details data-group="${esc(child)}" class="collection-group"${opened(child,chosen,false)}><summary>${esc(collection.label)}<span>${collection.runs.length} results</span></summary>${collection.runs.map(run=>`<button class="run-row${run.id===state.selected ? ' selected' : ''}" data-run="${esc(run.id)}"${run.id===state.selected ? ' aria-current="page"' : ''}><span>${esc(inputLabel(run.input_variant))}</span><span class="run-dp" aria-label="Ensemble DP">${score(metric(run.ensemble_metrics || run.metrics || {},'dp'))}</span></button>`).join('')}</details>`;
      }).join('')}</details>`;
    }).join('')}</section>`).join('') : '<p class="empty-state">No matching results.</p>';
    $('run-list').querySelectorAll('[data-run]').forEach(button=>button.addEventListener('click',()=>selectRun(button.dataset.run)));
    $('run-list').querySelectorAll('[data-group]').forEach(node=>{
      node.addEventListener('toggle',()=>{if (!filtering) {state.open[node.dataset.group]=node.open;try {localStorage.setItem('rpf.public.groups',JSON.stringify(state.open));}catch{}}});
      node.querySelector(':scope > summary')?.addEventListener('keydown',event=>{
        if (event.key==='ArrowRight') {event.preventDefault();node.open=true;}
        if (event.key==='ArrowLeft') {event.preventDefault();if(node.open)node.open=false;else node.parentElement?.closest('details')?.querySelector('summary')?.focus();}
      });
    });
  }
  function filter(id,key,label) {$(id).innerHTML=`<option value="">${label}</option>`+[...new Set(state.runs.map(run=>run[key]))].sort().map(value=>`<option value="${esc(value)}">${esc(key==='input_variant' ? inputLabel(value) : value)}</option>`).join('');}
  function destroyViewer() {state.viewer?.destroy?.();state.viewer=null;}
  async function selectRun(id,updateHash=true) {
    const summary=state.runs.find(run=>run.id===id);if(!summary)return;
    state.selected=id;state.selectedModel=null;const request=++state.request;destroyViewer();renderLibrary();
    $('content').innerHTML='<p class="empty-state">Loading result…</p>';
    try {
      const run=await read(summary.url || `data/runs/${encodeURIComponent(id)}.json`);
      if (request!==state.request)return;
      if (run.id!==id)throw new Error('Published result identity differs');
      state.detail=run;if(updateHash)history.replaceState(null,'',`#${encodeURIComponent(id)}`);renderDetail();
    } catch(error) {if(request===state.request)$('content').innerHTML=`<p class="error-state">${esc(error.message)}</p>`;}
  }
  function download(file,label) {return `<a class="${label ? 'button' : 'download-link'}" href="${esc(resource(file.url))}" download="${esc(file.name)}">${esc(label || 'Download')} ↓</a>`;}
  function renderDetail() {
    const run=state.detail,metrics=run.ensemble_metrics || run.metrics || {},bundle=artifacts(run).find(file=>file.key==='run-bundle');
    $('content').innerHTML=`<header class="run-header"><div><div class="breadcrumbs">${esc(run.target)} / ${esc(stateLabel(run.state))} / ${esc(run.sampling)}</div><h1>${esc(title(run))}</h1><div class="run-meta">${run.model_count} models · ${esc(inputLabel(run.input_variant))}</div></div>${bundle ? download(bundle,'Download result') : ''}</header><div class="ensemble-label">Ensemble</div><section class="metrics" aria-label="Ensemble scores">${[['dp','DP'],['recall','Recall'],['precision','Precision']].map(([key,label])=>`<div class="metric"><span>${label}</span><strong>${score(metric(metrics,key))}</strong></div>`).join('')}</section><div class="tabs" role="tablist" aria-label="Result details">${['models','files','inputs'].map(tab=>`<button id="tab-${tab}" data-tab="${tab}" role="tab" aria-selected="${state.tab===tab}" aria-controls="tab-panel" tabindex="${state.tab===tab ? 0 : -1}">${tab[0].toUpperCase()+tab.slice(1)}</button>`).join('')}</div><section id="tab-panel" role="tabpanel" aria-labelledby="tab-${state.tab}"></section>`;
    $('content').querySelectorAll('[data-tab]').forEach(button=>{
      button.addEventListener('click',()=>changeTab(button.dataset.tab));
      button.addEventListener('keydown',event=>{
        const tabs=['models','files','inputs'];let index=tabs.indexOf(state.tab);
        if(event.key==='ArrowRight')index=(index+1)%3;else if(event.key==='ArrowLeft')index=(index+2)%3;else if(event.key==='Home')index=0;else if(event.key==='End')index=2;else return;
        event.preventDefault();changeTab(tabs[index]);$(`tab-${tabs[index]}`).focus();
      });
    });renderPanel();
  }
  function changeTab(tab) {state.tab=tab;destroyViewer();document.querySelectorAll('[data-tab]').forEach(button=>{button.setAttribute('aria-selected',String(button.dataset.tab===tab));button.tabIndex=button.dataset.tab===tab ? 0 : -1;});$('tab-panel').setAttribute('aria-labelledby',`tab-${tab}`);renderPanel();}
  function renderPanel() {
    if(state.tab==='models')renderModels();
    else if(state.tab==='files')renderFiles(artifacts(state.detail).filter(file=>file.kind!=='model'));
    else {renderFiles(state.detail.inputs || artifacts(state.detail).filter(file=>file.kind==='input'),true);renderProvenance();}
  }
  function sortedModels() {return [...(state.detail.models || [])].sort((a,b)=>{
    const left=state.sort==='id' ? a.id : metric(a,state.sort),right=state.sort==='id' ? b.id : metric(b,state.sort);
    if(state.sort!=='id' && (!finite(left)||!finite(right)))return finite(left) ? -1 : finite(right) ? 1 : a.index-b.index;
    return (state.ascending ? 1 : -1)*(state.sort==='id' ? String(left).localeCompare(String(right)) : Number(left)-Number(right)) || a.index-b.index;
  });}
  function renderModels() {
    const models=sortedModels();if(!models.length){$('tab-panel').innerHTML='<p class="empty-state">No member scores.</p>';return;}
    if(!models.some(model=>model.id===state.selectedModel))state.selectedModel=models[0].id;
    destroyViewer();
    $('tab-panel').innerHTML=`<div class="models-layout"><div><div class="section-toolbar"><span>Member scores</span><span>${models.length} models</span></div><div class="table-wrap"><table aria-label="Member scores"><thead><tr>${[['id','Model'],['recall','Recall'],['precision','Precision'],['dp','DP']].map(([key,label])=>`<th${key!=='id' ? ' class="numeric"' : ''}${state.sort===key ? ` aria-sort="${state.ascending ? 'ascending' : 'descending'}"` : ''}><button data-sort="${key}">${label}${state.sort===key ? state.ascending ? ' ↑' : ' ↓' : ''}</button></th>`).join('')}</tr></thead><tbody>${models.map(model=>`<tr data-model="${esc(model.id)}" class="model-row${state.selectedModel===model.id ? ' active' : ''}" tabindex="0" aria-label="Model ${model.index}, DP ${score(metric(model,'dp'))}"><td class="model-name" title="${esc(model.id)}"><span>${model.index}</span>${esc(model.id.replace(/^SR215_bmr6366__/,'').replaceAll('__',' · '))}</td>${['recall','precision','dp'].map(key=>`<td class="numeric">${score(metric(model,key))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div><aside class="viewer-panel" aria-label="Structure"><div class="viewer-heading"><span>Structure</span><span id="selected-model-label"></span><span id="model-download"></span></div><div id="structure-view"></div></aside></div>`;
    $('tab-panel').querySelectorAll('[data-sort]').forEach(button=>button.addEventListener('click',()=>{if(state.sort===button.dataset.sort)state.ascending=!state.ascending;else{state.sort=button.dataset.sort;state.ascending=state.sort==='id';}renderModels();}));
    $('tab-panel').querySelectorAll('[data-model]').forEach(row=>{row.addEventListener('click',()=>selectModel(row.dataset.model));row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectModel(row.dataset.model);}});});
    const selected=state.detail.models.find(model=>model.id===state.selectedModel);updateSelection(selected);
    if(window.RpfStructure?.mount)state.viewer=window.RpfStructure.mount($('structure-view'),{run:state.detail,model:selected,onSelect:model=>selectModel(typeof model==='string' ? model : model.id)});
    else $('structure-view').textContent='Structure viewer unavailable';
  }
  function updateSelection(model) {$('selected-model-label').textContent=`Model ${model.index}`;const file=artifacts(state.detail).find(file=>file.key===model.structure_key);$('model-download').innerHTML=file ? download(file) : '';}
  function selectModel(id) {const model=state.detail.models.find(model=>model.id===id);if(!model)return;state.selectedModel=id;$('tab-panel').querySelectorAll('[data-model]').forEach(row=>row.classList.toggle('active',row.dataset.model===id));updateSelection(model);state.viewer?.selectModel?.(model);}
  function renderFiles(files,inputs=false) {$('tab-panel').innerHTML=`<div class="section-toolbar"><span>${inputs ? 'Experimental inputs' : 'Result files'}</span><span>${files.length} files</span></div><div class="table-wrap"><table aria-label="${inputs ? 'Inputs' : 'Files'}"><thead><tr><th>Name</th><th>Type</th><th class="numeric">Size</th><th><span class="sr-only">Download</span></th></tr></thead><tbody>${files.map(file=>`<tr><td>${esc(file.name)}${inputs && file.sha256 ? `<code class="hash">${esc(file.sha256)}</code>` : ''}</td><td>${esc(file.kind)}</td><td class="numeric">${bytes(file.bytes)}</td><td class="numeric">${download(file)}</td></tr>`).join('')}</tbody></table></div>`;}
  function renderProvenance() {const rows=state.detail.provenance || [];if(!rows.length)return;const node=document.createElement('section');node.className='provenance';node.innerHTML='<h2>Provenance</h2>'+rows.map(row=>`<div><span>${esc(row.label)}</span>${linkURL(row.url) ? `<a href="${esc(linkURL(row.url))}" target="_blank" rel="noopener noreferrer">${esc(row.value || 'Open source')} ↗</a>` : `<code>${esc(row.value || '')}</code>`}</div>`).join('');$('tab-panel').append(node);}
  async function load() {
    try {
      try {state.open=JSON.parse(localStorage.getItem('rpf.public.groups')) || {};}catch{}
      const data=await read('data/index.json');state.runs=data.runs || [];
      filter('sampling-filter','sampling','All sampling');filter('variant-filter','input_variant','All input sets');renderLibrary();
      let requested='';try{requested=decodeURIComponent(location.hash.slice(1));}catch{}
      const id=state.runs.some(run=>run.id===requested) ? requested : state.runs[0]?.id;
      if(id)await selectRun(id,false);else $('content').innerHTML='<p class="empty-state">No published results.</p>';
    }catch(error){$('run-list').innerHTML=`<p class="error-state">${esc(error.message)}</p>`;$('content').innerHTML='<p class="empty-state">Results could not be loaded.</p>';}
  }
  ['run-search','sampling-filter','variant-filter'].forEach(id=>$(id).addEventListener(id==='run-search' ? 'input' : 'change',renderLibrary));
  window.addEventListener('hashchange',()=>{let id='';try{id=decodeURIComponent(location.hash.slice(1));}catch{}if(id && id!==state.selected)selectRun(id,false);});
  document.addEventListener('click',async event=>{
    const link=event.target.closest('a[download]');if(!link || !window.showSaveFilePicker || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
    event.preventDefault();try{const handle=await window.showSaveFilePicker({suggestedName:link.download});const response=await fetch(link.href,{credentials:'omit'});if(!response.ok)throw new Error('Download unavailable');const destination=await handle.createWritable();try{if(response.body)await response.body.pipeTo(destination);else{await destination.write(await response.blob());await destination.close();}}catch(error){await destination.abort().catch(()=>{});throw error;}}catch(error){if(error.name!=='AbortError')notice(error.message);}
  });
  load();
})();
