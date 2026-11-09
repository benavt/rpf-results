(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const pageSize = 50;
  const ranges = {
    all: 'Residues 1–139',
    'res5-95': 'Residues 5–95',
    'res32-47-plus78-99': 'Residues 32–47 and 78–99'
  };
  const scoreNames = {dp: 'DP', recall: 'Recall', precision: 'Precision'};
  const state = {page: 0, sort: 'dp', ascending: false};
  const packs = new Map();
  let catalog, modelIndex, panelIndex, viewer, loaded, activeURL, request = 0;

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  const pretty = id => id.replace(/^SR215_bmr6366__/, '');
  const score = value => typeof value === 'number' ? value.toFixed(3) : '—';
  const count = value => value.toLocaleString();
  function href(view, id) {
    return id ? '#' + view + '?' + new URLSearchParams({id}) : '#' + view;
  }
  function route() {
    const hash = location.hash.slice(1);
    if (/^sr215-s[1-9]\d*-/.test(hash)) {
      location.replace('./legacy.html#' + hash);
      return null;
    }
    const [view, params] = hash.split('?', 2);
    return {view: view === 'ensembles' ? view : 'models', id: new URLSearchParams(params).get('id')};
  }
  function asset(path) {
    if (!/^current\/[a-zA-Z0-9_.\/-]+$/.test(path) || path.split('/').includes('..')) {
      throw new Error('Invalid snapshot path');
    }
    return new URL(path, document.baseURI);
  }
  async function response(path) {
    const res = await fetch(asset(path), {credentials:'omit'});
    if (!res.ok) throw new Error(`Snapshot file unavailable (${res.status})`);
    return res;
  }
  async function unpack(path) {
    const res = await response(path);
    if (!res.body) throw new Error('Coordinate response is empty');
    const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function queryPack(path) {
    if (!packs.has(path)) {
      packs.set(path, unpack(path).catch(error => { packs.delete(path); throw error; }));
      if (packs.size > 2) packs.delete(packs.keys().next().value);
    }
    return packs.get(path);
  }
  async function verify(bytes, expected) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    if (actual !== expected) throw new Error('Coordinate checksum does not match the scored structure');
    return bytes;
  }
  async function snapshot(record) {
    const bytes = new Uint8Array(await (await response(record.path)).arrayBuffer());
    await verify(bytes, record.sha256);
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function singleBytes(model) {
    const {path, offset, bytes, sha256} = model.structure;
    const packed = await queryPack(path);
    if (offset + bytes > packed.length) throw new Error('Coordinate record is incomplete');
    return verify(packed.subarray(offset, offset + bytes), sha256);
  }
  function clearViewer() {
    viewer?.destroy();
    viewer = null;
    if (activeURL) URL.revokeObjectURL(activeURL);
    activeURL = null;
  }
  function title(item, ensemble) {
    return ensemble ? `${item.state} · ${item.selection.toUpperCase()} · repeat ${item.repeat}` : pretty(item.id);
  }
  function showMembers(item) {
    $('panel-members').innerHTML = item ? `<details><summary>50 members and independent scores</summary>
      <p>Member links open each model’s independent score and exact protonated structure.</p>
      <div class="table-wrap"><table aria-label="Independent scores for ensemble members">
      <thead><tr><th scope="col">Member</th><th scope="col" class="numeric">DP</th><th scope="col" class="numeric">Recall</th><th scope="col" class="numeric">Precision</th></tr></thead>
      <tbody>${item.members.map((id, index) => {
        const member = modelIndex.get(id);
        return `<tr><td><a href="${esc(href('models',id))}">${index + 1}. ${esc(pretty(id))}</a></td>${scoreCells(member)}</tr>`;
      }).join('')}</tbody></table></div></details>` : '';
  }
  async function showStructure(item, ensemble) {
    const key = item ? `${ensemble ? 'ensemble' : 'model'}:${item.id}` : '';
    if (loaded === key) return;
    loaded = key;
    const token = ++request;
    clearViewer();
    const download = $('structure-download'), container = $('current-structure');
    download.hidden = true;
    download.removeAttribute('href');
    $('structure-title').textContent = item ? title(item, ensemble) : 'Structure';
    $('structure-detail').textContent = item ? (ensemble ?
      `${ranges[item.residue_range]} · 50 protonated models · seed ${item.seed}` : item.method + ' · protonated scored coordinates') : '';
    showMembers(ensemble && item);
    container.innerHTML = item ? '<p role="status">Loading verified coordinates…</p>' : '<p>Select a result to inspect its structure.</p>';
    if (!item) return;
    try {
      const bytes = ensemble ? await verify(await unpack(item.structure.path), item.structure.sha256) : await singleBytes(item);
      if (token !== request) return;
      const url = URL.createObjectURL(new Blob([bytes], {type:'chemical/x-pdb'}));
      activeURL = url;
      download.href = url;
      download.download = (ensemble ? item.id : item.id + '.protonated') + '.pdb';
      download.hidden = false;
      const models = ensemble ? item.members.map((id, i) => ({id,index:i + 1,...item.member_scores[i]})) : [{id:item.id,index:1,...item}];
      viewer = window.RpfStructure.mount(container, {run:{
        id:ensemble ? item.id : 'current-single-model',
        models,
        single_model:!ensemble,
        initial_display:ensemble ? 'ensemble' : 'single',
        score_domains:ensemble ? undefined : catalog.score_domains,
        residue_metrics_url:ensemble ? asset(item.diagnostics.path).href : undefined
      }, model:models[0], coordinateText:new TextDecoder().decode(bytes)});
    } catch (error) {
      if (token !== request) return;
      loaded = undefined;
      download.hidden = true;
      clearViewer();
      container.innerHTML = `<p role="status">${esc(error.message)}. Select this result again to retry.</p>`;
    }
  }
  function modelMatches(item) {
    const query = $('model-search').value.toLowerCase().trim();
    const method = $('method-filter').value;
    const dp = $('min-dp').value;
    return (!query || item.id.toLowerCase().includes(query)) &&
      (!method || method === item.method) && (dp === '' || item.dp >= Number(dp));
  }
  function panelMatches(item) {
    return item.residue_range === $('range-filter').value &&
      (!$('state-filter').value || item.state === $('state-filter').value) &&
      (!$('selector-filter').value || item.selection === $('selector-filter').value);
  }
  function states() {
    const input = $('state-filter'), previous = input.value;
    const available = [...new Set(catalog.ensembles.filter(p => p.residue_range === $('range-filter').value).map(p => p.state))].sort();
    input.replaceChildren(new Option('All states', ''), ...available.map(s => new Option(s,s)));
    input.value = available.includes(previous) ? previous : '';
  }
  function compare(left, right) {
    const key = state.sort;
    const order = typeof left[key] === 'number' ? left[key] - right[key] : left[key].localeCompare(right[key]);
    return (state.ascending ? order : -order) || left.id.localeCompare(right.id);
  }
  function scoreCells(item) {
    return Object.keys(scoreNames).map(key => `<td class="numeric">${score(item[key])}</td>`).join('');
  }
  function renderResults(current, locate = false) {
    if (!current) return;
    const ensemble = current.view === 'ensembles';
    const index = ensemble ? panelIndex : modelIndex;
    const selection = index.get(current.id);
    if (locate && ensemble && selection && !panelMatches(selection)) {
      $('range-filter').value = selection.residue_range;
      states();
      $('state-filter').value = '';
      $('selector-filter').value = '';
    }
    const rows = (ensemble ? catalog.ensembles.filter(panelMatches) : catalog.models.filter(modelMatches)).sort(compare);
    if (locate && selection && rows.includes(selection)) state.page = Math.floor(rows.indexOf(selection) / pageSize);
    const pages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.min(state.page, pages - 1);
    const item = selection || rows[state.page * pageSize];
    $('model-tools').hidden = ensemble;
    $('panel-tools').hidden = !ensemble;
    for (const [id, active] of [['single-view', !ensemble], ['ensemble-view', ensemble]]) {
      if (active) $(id).setAttribute('aria-current','page');
      else $(id).removeAttribute('aria-current');
    }
    $('score-context').textContent = ensemble ?
      'Native RPF ensemble scores (ASDP Model ave). The residue range defines state assignment. RPF uses the full construct and the current TR peak lists.' :
      'Independent RPF scores for individual protonated structures using the current TR peak lists.';
    $('result-count').textContent = `${count(rows.length)} / ${count(index.size)} ${ensemble ? 'ensembles' : 'models'}`;
    $('page-label').textContent = `Page ${state.page + 1} of ${pages}`;
    $('pagination').hidden = pages <= 1;
    $('previous-page').disabled = state.page === 0;
    $('next-page').disabled = state.page === pages - 1;

    const columns = {id: ensemble ? 'Ensemble' : 'Model', ...scoreNames};
    $('result-table').innerHTML = rows.length ? `<table aria-label="${ensemble ? 'Current ensemble' : 'Current independent model'} RPF scores">
      <thead><tr>${Object.entries(columns).map(([key, label]) => `<th scope="col"${key === 'id' ? '' : ' class="numeric"'}${key === state.sort ? ` aria-sort="${state.ascending ? 'ascending' : 'descending'}"` : ''}><button type="button" data-sort="${key}">${label}${key === state.sort ? (state.ascending ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${rows.slice(state.page * pageSize, (state.page + 1) * pageSize).map(row => `<tr><td><a href="${esc(href(current.view,row.id))}"${item === row ? ' aria-current="true"' : ''}>${esc(title(row,ensemble))}</a></td>${scoreCells(row)}</tr>`).join('')}</tbody></table>` : '<p class="empty-state">No results match these filters.</p>';
    $('browser-status').hidden = false;
    $('browser-status').textContent = current.id && !selection ? 'This result ID is absent from the current snapshot.' :
      selection && !rows.includes(selection) ? 'The selected result is outside the active filters.' : '';
    $('browser-status').hidden = !$('browser-status').textContent;
    showStructure(item, ensemble);
  }
  function filtered() {
    const current = route();
    if (!current) return;
    state.page = 0;
    if (current.id) history.replaceState(null, '', href(current.view));
    renderResults({view:current.view});
  }
  function routeChanged() {
    state.page = 0;
    renderResults(route(), true);
  }
  async function load() {
    if (!route()) return;
    try {
      catalog = await (await response('current/catalog.json')).json();
      const [models, ensembles] = await Promise.all([
        snapshot(catalog.independent_models), snapshot(catalog.ensemble_panels)
      ]);
      catalog.models = models;
      catalog.ensembles = ensembles;
      modelIndex = new Map(models.map(row => [row.id, row]));
      panelIndex = new Map(ensembles.map(row => [row.id, row]));
      if (modelIndex.size !== catalog.independent_models.count || panelIndex.size !== catalog.ensemble_panels.count) {
        throw new Error('Snapshot inventory is incomplete');
      }
      $('method-filter').append(...[...new Set(models.map(model => model.method))].sort().map(m => new Option(m,m)));
      $('range-filter').replaceChildren(...Object.entries(ranges).map(([key,label]) => new Option(label,key)));
      states();
      for (const id of ['model-search','min-dp']) $(id).addEventListener('input', filtered);
      for (const id of ['method-filter','state-filter','selector-filter']) $(id).addEventListener('change', filtered);
      $('range-filter').addEventListener('change', () => { states(); filtered(); });
      $('previous-page').addEventListener('click', () => { state.page--; renderResults(route()); });
      $('next-page').addEventListener('click', () => { state.page++; renderResults(route()); });
      $('result-table').addEventListener('click', event => {
        const key = event.target.closest('[data-sort]')?.dataset.sort;
        if (key) {
          state.ascending = key === state.sort ? !state.ascending : key === 'id';
          state.sort = key;
          state.page = 0;
          renderResults(route());
          $('result-table').querySelector(`[data-sort="${key}"]`)?.focus();
        } else if (event.target.closest('[aria-current]') && loaded === undefined) {
          renderResults(route());
        }
      });
      window.addEventListener('hashchange', routeChanged);
      $('browser').hidden = false;
      routeChanged();
    } catch (error) {
      $('browser-status').textContent = `Current viewer unavailable. ${error.message}. The score downloads and archive are available above.`;
    }
  }
  load();
})();
