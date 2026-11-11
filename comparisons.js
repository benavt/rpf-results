(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const filters = ['context','study','cohort','range','partition','pool','method','seed'];
  const pageSize = 50;
  const state = {page:0, sort:'dp', ascending:false, selected:null};
  const contextNotes = {
    native_ensemble:'Native ASDP ensemble DP, Recall and Precision. Scores are retained at native printed precision. These rows include reused panels across studies.',
    mean_independent_member:'Arithmetic means of independent model scores in each saved selection. These are not native ensemble scores. Variable-size cluster selections retain their actual cardinality.',
    visit_weighted_member:'Mean model scores weighted by retained visits, including repeat visits. The model count is the number of distinct models visited, not a 50-conformer ensemble.'
  };
  const names = {mcmc50:'MCMC50',disco50:'DISCO50',uniform50:'Uniform50',gumbel50:'Gumbel50',exact50:'Exact50',
    random50:'Random50',topdp50:'Top DP50 (control)','quality-coverage50':'Quality + coverage50',coverage50:'Coverage50',
    'quality-rank50':'Quality rank50','strata-hdbscan50':'HDBSCAN strata50','strata-graph50':'Graph strata50',
    'graph-state50':'Graph state50','matched-logdet50':'Matched logdet50','matched-random50':'Matched random50',
    rank_rpf:'Top RPF (control)',rank_molprobity:'Lowest MolProbity',rank_ebm:'Lowest ProteinEBM',
    disco_min_per_cluster:'Minimum energy per cluster',categorical_visits:'Exact categorical visits',mh_visits:'Metropolis visits',uniform_visits:'Uniform visits'};
  const ranges = {all:'1–139','res5-95':'5–95','res32-47-plus78-99':'32–47 + 78–99'};
  const priors = {density:'HDBSCAN',hdbscan:'HDBSCAN',primary:'Primary UMAP KNN','selection-specific':'Method-specific'};
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const label = key => names[key] || key;
  const fmt = value => typeof value === 'number' ? value.toFixed($('context').value==='native_ensemble'?2:3) : '—';
  const pool = r => `${r.rule} · ${r.state}`;
  let data, studies, selectedRows = [], exportURL;

  function choices(id, values, title = x => x) {
    const value=$(id).value;
    $(id).replaceChildren(new Option(id==='pool'?'All rules and states':`All ${id==='partition'?'priors':id==='method'?'methods':'seeds'}`,''),
      ...[...new Set(values)].sort().map(x=>new Option(title(x),x)));
    if ([...$(id).options].some(o=>o.value===value)) $(id).value=value;
  }
  function matches(row, skip) {
    const fields = {context:row.score_context,study:row.study,cohort:String(row.cohort_models),range:row.range,
      partition:row.partition,pool:pool(row),method:row.method,seed:String(row.seed)};
    return filters.every(id=>id===skip || !$(id).value || $(id).value===fields[id]);
  }
  function updateURL() {
    const params=new URLSearchParams();
    for(const id of filters) if($(id).value) params.set(id,$(id).value);
    if(state.selected) params.set('id',state.selected);
    history.replaceState(null,'','#'+params);
  }
  function updateChoices() {
    const contextRows=data.rows.filter(r=>r.score_context===$('context').value);
    const available=new Set(contextRows.map(r=>r.study));
    if($('study').value && !available.has($('study').value)) $('study').value='';
    const study=$('study').value;
    $('study').replaceChildren(new Option('All studies',''),...data.studies.filter(s=>available.has(s.id)).map(s=>new Option(s.title,s.id)));
    $('study').value=study;
    for(const id of ['partition','pool','method','seed']) {
      const candidates=data.rows.filter(r=>matches(r,id));
      choices(id,candidates.map(r=>id==='pool'?pool(r):String(r[id])),id==='method'?label:id==='partition'?(v=>priors[v]||v):v=>v);
    }
  }
  function restore() {
    const params=new URLSearchParams(location.hash.slice(1));
    for(const id of filters) if(params.has(id)) {
      const value=params.get(id);
      if([...$(id).options].some(o=>o.value===value)) $(id).value=value;
    }
    state.selected=params.get('id');
    const selected=data.rows.find(r=>r.id===state.selected);
    if(selected && !params.has('context')) $('context').value=selected.score_context;
  }
  function chart(rows) {
    const start=state.page*pageSize,shown=rows.slice(start,start+pageSize),height=70+shown.length*26;
    $('plot-note').textContent=`Rows ${rows.length?start+1:0}–${start+shown.length} of ${rows.length.toLocaleString()} matching rows, in the active table sort order. Hover a point for its full context. DP axis is fixed at 0–1.`;
    if(!shown.length){$('plot').innerHTML='<p>No results match these filters.</p>';return;}
    const x=dp=>360+dp*600;
    const ticks=[0,.2,.4,.6,.8,1].map(v=>`<line x1="${x(v)}" x2="${x(v)}" y1="30" y2="${height-30}" stroke="#e1e6eb"/><text x="${x(v)}" y="20" text-anchor="middle">${v.toFixed(1)}</text>`).join('');
    $('plot').innerHTML=`<svg viewBox="0 0 1000 ${height}" role="img" aria-label="DP values for matching configurations; the table below contains the same scores"><g font-family="system-ui" font-size="12" fill="#445469">${ticks}${shown.map((r,i)=>{
      const y=45+i*26,title=`${studies.get(r.study).title} / ${ranges[r.range]} / ${r.partition} / ${pool(r)} / ${label(r.method)} / seed ${r.seed} / DP ${r.dp}`;
      const prior=r.partition==='primary'?'Primary':r.partition==='hdbscan'?'HDBSCAN':'Selector';
      return `<text x="340" y="${y+4}" text-anchor="end">${esc(label(r.method))} · ${prior} · ${esc(r.seed)}</text><circle cx="${x(r.dp)}" cy="${y}" r="4.5" fill="${r.cohort_models===11104?'#b46535':'#24786b'}"><title>${esc(title)}</title></circle>`;
    }).join('')}</g></svg>`;
  }
  function detail(row) {
    window.RpfComparisonEnsemble.clear();
    if(!row){$('selection-detail').replaceChildren();return;}
    const study=studies.get(row.study);
    const members=row.members || [];
    const memberMetric=value=>typeof value==='number'?value.toFixed(3):'—';
    $('selection-detail').innerHTML=`<h3>${esc(label(row.method))} · ${esc(study.title)}</h3>
      <p>${esc(ranges[row.range])} · ${esc(priors[row.partition]||row.partition)} · ${esc(pool(row))} · seed ${esc(row.seed)} · ${row.models} models</p>
      <p>${esc(contextNotes[row.score_context])}</p>
      ${row.member_metrics?`<div class="table-wrap"><table aria-label="Ensemble scores and mean member quality"><thead><tr><th>Measure</th><th>Native ensemble</th><th>Mean independent member</th></tr></thead><tbody>${[['dp','DP'],['recall','Recall'],['precision','Precision'],['molprobity','MolProbity'],['clashscore','Clashscore'],['energy_t10','ProteinEBM t=0.10']].map(([key,title])=>`<tr><th scope="row">${title}</th><td>${['dp','recall','precision'].includes(key)?fmt(row[key]):'—'}</td><td>${memberMetric(row.member_metrics[key])}</td></tr>`).join('')}</tbody></table></div>`:''}
      <p>${row.viewer_id?`<a href="./#ensembles?id=${encodeURIComponent(row.viewer_id)}">Open exact scored ensemble and residue coloring</a>`:members.length?'View or download the aligned ensemble below, or inspect its individual members.':'This screen reports model-score summaries. Its individual selections are available in the saved study, outside this web release.'}</p>
      ${members.length && row.score_context==='native_ensemble'?'<button type="button" class="button" id="view-comparison-ensemble">View aligned ensemble / download PDB</button><p>Alignment uses this row’s clustering residues. Per-model colors use independent single-model scores. The saved native ensemble scores above retain their original interpretation.</p><div id="comparison-structure" style="min-height:0"></div>':''}
      <details><summary>Scoring provenance</summary><p>Peak lists: ${esc(data.peak_list_version)} · control: ${esc(data.control_variant)}</p>
      <p class="hash">Snapshot SHA-256: ${esc(study.snapshot_sha256)}<br>Acceptance SHA-256: ${esc(study.audit_sha256)}${row.ensemble_sha256?'<br>Scored ensemble SHA-256: '+esc(row.ensemble_sha256):''}</p>
      <p>Source row: <code>${esc(row.source_id)}</code></p></details>
      ${members.length?`<details><summary>${members.length} saved members</summary><ol class="member-list">${members.map(id=>`<li><a href="./#models?id=${encodeURIComponent(id)}">${esc(id.replace(/^SR215_bmr6366__/,''))}</a></li>`).join('')}</ol></details>`:''}`;
    const button=$('view-comparison-ensemble');
    if(button)button.addEventListener('click',()=>window.RpfComparisonEnsemble.show(row,$('comparison-structure')));
  }
  function render() {
    updateChoices();
    const rows=data.rows.filter(r=>matches(r));
    rows.sort((a,b)=>{
      const av=state.sort==='method'?label(a.method):a[state.sort],bv=state.sort==='method'?label(b.method):b[state.sort];
      return (state.ascending?1:-1)*(typeof av==='number'?av-bv:String(av).localeCompare(String(bv))) || a.id.localeCompare(b.id);
    });
    selectedRows=rows;
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));state.page=Math.min(state.page,pages-1);
    $('context-note').textContent=contextNotes[$('context').value];
    const studyCount=new Set(rows.map(r=>r.study)).size;
    $('matches').textContent=`${rows.length.toLocaleString()} matching study rows · ${studyCount} ${studyCount===1?'study':'studies'}`;
    $('page').textContent=`Page ${state.page+1} of ${pages}`;$('previous').disabled=state.page===0;$('next').disabled=state.page===pages-1;
    const headings=[['method','Selection method'],['study','Study'],['range','Residues'],['partition','Prior'],['state','State'],['seed','Seed'],['models','Models'],['dp','DP'],['recall','Recall'],['precision','Precision']];
    $('comparison-table').innerHTML=rows.length?`<table><thead><tr>${headings.map(([k,v])=>`<th scope="col"${k===state.sort?` aria-sort="${state.ascending?'ascending':'descending'}"`:''}><button type="button" data-sort="${k}">${v}${k===state.sort?(state.ascending?' ↑':' ↓'):''}</button></th>`).join('')}</tr></thead><tbody>${rows.slice(state.page*pageSize,(state.page+1)*pageSize).map(r=>`<tr${r.id===state.selected?' class="selected-row"':''}><td><button type="button" class="row-choice" data-row="${esc(r.id)}">${esc(label(r.method))}</button></td><td>${esc(studies.get(r.study).title)}</td><td>${esc(ranges[r.range])}</td><td>${esc(priors[r.partition]||r.partition)}</td><td>${esc(pool(r))}</td><td>${esc(r.seed)}</td><td>${r.models}</td><td>${fmt(r.dp)}</td><td>${fmt(r.recall)}</td><td>${fmt(r.precision)}</td></tr>`).join('')}</tbody></table>`:'<p>No matching configurations. Reset filters to see all accepted results.</p>';
    detail(rows.find(r=>r.id===state.selected));chart(rows);updateURL();
  }
  function download() {
    if(exportURL) URL.revokeObjectURL(exportURL);
    const fields=['id','study','cohort_models','range','partition','rule','state','method','seed','models','score_context','dp','recall','precision','ensemble_sha256'];
    const cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
    const csv=[fields.join(','),...selectedRows.map(r=>fields.map(k=>cell(r[k])).join(','))].join('\r\n')+'\r\n';
    exportURL=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=exportURL;link.download='SR215-current-configurations.csv';link.click();
  }
  async function load() {
    try {
      const catalog=await (await fetch('current/catalog.json')).json();
      const res=await fetch(catalog.configuration_comparisons.path);if(!res.ok)throw new Error('Comparison file unavailable');
      const bytes=await res.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
      if([...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')!==catalog.configuration_comparisons.sha256) throw new Error('Comparison checksum differs from catalog');
      data=JSON.parse(new TextDecoder().decode(bytes));
      if(data.peak_list_version!==catalog.peak_list_version)throw new Error('Input versions do not match');
      studies=new Map(data.studies.map(s=>[s.id,s]));
      $('study').append(...data.studies.map(s=>new Option(s.title,s.id)));
      choices('partition',data.rows.map(r=>r.partition));choices('method',data.rows.map(r=>r.method),label);
      choices('pool',data.rows.map(pool));choices('seed',data.rows.map(r=>String(r.seed)));
      $('coverage').innerHTML=data.studies.map(s=>`<article><h3>${esc(s.title)}</h3><p>${s.rows.toLocaleString()} study rows · ${s.cohort_models.toLocaleString()}-model cohort</p><button class="button" type="button" data-study="${s.id}">Explore study</button></article>`).join('');
      for(const id of filters)$(id).addEventListener('change',()=>{
        if(id==='study' && $('study').value==='member-screen' && $('context').value==='native_ensemble') $('context').value='mean_independent_member';
        state.page=0;state.selected=null;render();
      });
      $('reset').addEventListener('click',()=>{for(const id of filters)$(id).value=id==='context'?'native_ensemble':'';state.page=0;state.selected=null;render();});
      $('previous').addEventListener('click',()=>{state.page--;render();});$('next').addEventListener('click',()=>{state.page++;render();});
      $('export').addEventListener('click',download);
      $('comparison-table').addEventListener('click',e=>{
        const sort=e.target.closest('[data-sort]')?.dataset.sort,row=e.target.closest('[data-row]')?.dataset.row;
        if(sort){state.ascending=state.sort===sort?!state.ascending:!['dp','recall','precision'].includes(sort);state.sort=sort;state.page=0;render();$('comparison-table').querySelector(`[data-sort="${sort}"]`)?.focus();}
        if(row){state.selected=row;render();$('selection-detail').scrollIntoView({block:'nearest',behavior:'instant'});}
      });
      $('coverage').addEventListener('click',e=>{const id=e.target.closest('[data-study]')?.dataset.study;if(id){for(const f of filters)$(f).value='';$('context').value=id==='member-screen'?'mean_independent_member':'native_ensemble';$('study').value=id;state.page=0;state.selected=null;render();$('filter-heading').scrollIntoView();}});
      window.addEventListener('hashchange',()=>{restore();state.page=0;render();});
      restore();render();$('load-status').textContent=`Current input version verified · ${data.studies.length} accepted studies · release ${data.release_date}`;
    } catch(error){$('load-status').textContent=`Comparison viewer unavailable: ${error.message}. Download the results catalog or use the archive links above.`;}
  }
  load();
})();
