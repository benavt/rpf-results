/* Same-origin structure inspection; scored coordinates and metric values are unchanged. */
(function () {
  'use strict';
  const mounted = new WeakMap();
  const assetBase = document.currentScript?.src || document.baseURI;
  const cache = new Map();
  const preferences = new Map();
  const MISSING = '#b9bec7';
  const SPECTRAL = window.RpfPresentation.SPECTRAL;
  const CHAINS = ['#0072b2', '#d55e00', '#009e73', '#cc79a7', '#e69f00', '#56b4e9', '#882255', '#999933'];
  let libraryPromise;

  function library() {
    const ready = window.$3Dmol || window['3Dmol'];
    if (ready?.createViewer) return Promise.resolve(ready);
    if (!libraryPromise) libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('vendor/3Dmol-min.js', assetBase).href;
      script.onload = () => {
        const api = window.$3Dmol || window['3Dmol'];
        if (api?.createViewer) resolve(api);
        else reject(new Error('Structure renderer unavailable'));
      };
      script.onerror = () => reject(new Error('Structure renderer unavailable'));
      document.head.appendChild(script);
    });
    return libraryPromise;
  }

  function pdbModels(text) {
    const lines = text.split(/\r?\n/);
    if (!lines.some(line => /^MODEL(?:\s|$)/.test(line))) return lines.some(line => /^(ATOM  |HETATM)/.test(line)) ? [text] : [];
    const result = []; let current = null;
    for (const line of lines) {
      if (/^MODEL(?:\s|$)/.test(line)) {
        if (current) throw new Error('Malformed ensemble MODEL records');
        current = [];
      } else if (/^ENDMDL(?:\s|$)/.test(line)) {
        if (!current || !current.some(item => /^(ATOM  |HETATM)/.test(item))) throw new Error('Empty ensemble model');
        result.push(current.join('\n') + '\nEND\n'); current = null;
      } else if (current) current.push(line);
    }
    if (current) throw new Error('Incomplete ensemble model');
    return result;
  }

  function readFrames(text) {
    if (text.length > 100 * 1024 * 1024) throw new Error('Structure exceeds viewer limit');
    const models = pdbModels(text);
    if (!models.length) throw new Error('No PDB coordinates in this file');
    return models;
  }

  function coordinates(url) {
    if (!cache.has(url)) {
      const pending = fetch(url, {credentials: 'same-origin'}).then(response => {
        if (!response.ok) throw new Error('Structure file unavailable');
        return response.text();
      }).then(readFrames).catch(error => { cache.delete(url); throw error; });
      cache.set(url, pending);
      if (cache.size > 3) cache.delete(cache.keys().next().value);
    }
    return cache.get(url);
  }

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function selector(label, options) {
    const select = element('select'); select.setAttribute('aria-label', label);
    for (const [value, title] of options) { const option = element('option', title); option.value = value; select.appendChild(option); }
    return select;
  }
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const modelID = model => String(model?.id || model?.model_id || '');
  function modelValue(model, metric) {
    const keys = {dp: 'RPF_DP', recall: 'RPF_Recall', precision: 'RPF_Precision'};
    const value = model[metric] ?? model[keys[metric]] ?? model.metrics?.[metric];
    return finite(value) ? value : null;
  }
  function paletteColor(value, low, high) { return window.RpfPresentation.spectral(value,low,high); }
  function rainbow(t) { return paletteColor(t,0,1); }
  function residueKey(atom) { return [String(atom.chain ?? '').trim(), String(atom.resi), String(atom.icode ?? '').trim()].join('|'); }
  function structureMap(frame) {
    const residues = [], chains = [], seen = new Set();
    for (const line of frame.split(/\r?\n/)) {
      if (!/^ATOM  /.test(line)) continue;
      const record = {chain: line.slice(21, 22).trim(), resi: Number(line.slice(22, 26)), icode: line.slice(26, 27).trim()};
      if (!Number.isInteger(record.resi)) throw new Error('Invalid residue identifier');
      const key = residueKey(record);
      if (!chains.includes(record.chain)) chains.push(record.chain);
      if (!seen.has(key)) { seen.add(key); residues.push(record); }
    }
    const ranks = new Map(residues.map((record, index) => [residueKey(record), index]));
    return {residues, chains, ranks};
  }
  function layerPalette() { return SPECTRAL; }
  function layerDomain(layer) {
    if (Array.isArray(layer.domain) && layer.domain.length === 2 && layer.domain.every(finite) && layer.domain[0] <= layer.domain[1]) return layer.domain;
    const values = (layer.values || []).map(x => x.value).filter(finite);
    return values.length ? [Math.min(...values), Math.max(...values)] : [0, 1];
  }
  function layerRows(layer, model) {
    const entries = (layer.values || []).filter(item => layer.scope !== 'model' || item.model_id === modelID(model) || item.model_index === model.index);
    const map = new Map();
    for (const item of entries) {
      const key = residueKey(item);
      if (map.has(key)) throw new Error('Ambiguous residue metric mapping');
      map.set(key, item);
    }
    return map;
  }
  function layerMap(layer, model) {
    return new Map([...layerRows(layer, model)].map(([key, row]) => [key, row.value]));
  }
  function missingColor(layer) { return /^#[0-9a-f]{6}$/i.test(layer.missing_color || '') ? layer.missing_color : MISSING; }
  function residueColor(row, layer, domain, palette) {
    if (!row || !finite(row.value)) return missingColor(layer);
    return paletteColor(row.value, ...domain);
  }

  function mount(container, {run, model, onSelect, coordinateText, onCoordinates} = {}) {
    mounted.get(container)?.destroy();
    let downloadURL;
    let disposed = false, viewer = null, observer = null, selected = 0, glModels = [], maps = [], styled = [], layers = [];
    const records = run?.models || [];
    if (!records.every((item, index) => item.index === undefined || item.index === index + 1)) throw new Error('Model metric order differs from the scored ensemble');
    if (new Set(records.map(modelID)).size !== records.length) throw new Error('Duplicate model metric identities');
    const artifact = (run?.artifacts || []).find(item => item.key === run.structure_key) ||
      (run?.artifacts || []).find(item => (item.key === 'ensemble' || ['ensemble', 'structure'].includes(item.kind)) && item.available !== false);
    const saved = preferences.get(run?.id) || {mode: run.initial_display || 'single', color: run.initial_color || 'rainbow', opacity: 100};
    container.replaceChildren();
    const shell = element('div'); shell.className = 'rpf-molecule';
    shell.style.cssText = 'display:flex;flex-direction:column;min-height:420px;height:100%;gap:10px';
    const toolbar = element('div'); toolbar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
    const mode = selector('Structure display', [['single', 'Single model'], ['ensemble', 'Ensemble']]); mode.value = saved.mode;
    const choice = selector('Structure model', records.map((item, index) => {
      const name = modelID(item).replace(/^SR215_bmr6366__/, '').replaceAll('__', ' · ');
      return [String(index), `${item.index || index + 1} · ${name.length > 40 ? name.slice(0, 37) + '…' : name}`];
    }));
    records.forEach((item, index) => { choice.options[index].title = modelID(item); });
    if (run.single_model) { mode.hidden = true; choice.hidden = true; }
    choice.style.maxWidth = 'min(100%,360px)';
    const choices = [['rainbow', 'Spectral · sequence'], ['chain', 'Chain'], ['uniform', 'Structure']];
    for (const metric of ['dp', 'recall', 'precision']) if (records.some(item => modelValue(item, metric) !== null)) choices.push([metric, `${run.model_score_label || 'Model'} ${metric === 'dp' ? 'DP' : metric[0].toUpperCase() + metric.slice(1)}`]);
    const color = selector('Structure color', choices);
    if (choices.some(([key]) => key === saved.color)) color.value = saved.color;
    const opacityBox = element('label'); opacityBox.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px';
    const opacityText = element('span');
    const opacity = element('input'); opacity.type = 'range'; opacity.min = '20'; opacity.max = '100'; opacity.step = '10'; opacity.value = String(saved.opacity);
    opacity.setAttribute('aria-label', 'Ensemble opacity'); opacity.style.cssText = 'width:80px;padding:0';
    opacityBox.append(opacityText, opacity);
    const isolate = element('button', 'Isolate'); isolate.type = 'button'; isolate.title = 'Show the selected model alone';
    const reset = element('button', 'Reset view'); reset.type = 'button';
    toolbar.append(mode, choice, color, reset, isolate, opacityBox);
    const residueStatus = element('span'); residueStatus.setAttribute('role', 'status');
    residueStatus.style.cssText = 'font-size:11px;color:#68717d'; toolbar.appendChild(residueStatus);
    const canvas = element('div'); canvas.style.cssText = 'position:relative;min-height:340px;flex:1;background:#fafafa;border-radius:10px;overflow:hidden';
    const message = element('div', 'Loading structure…'); message.setAttribute('role', 'status'); message.style.cssText = 'padding:20px;color:#68717d'; canvas.appendChild(message);
    const legend = element('div'); legend.className = 'structure-legend'; legend.style.cssText = 'font-size:11px;color:#5e6672;min-height:28px;line-height:1.5';
    shell.append(toolbar, canvas, legend); container.appendChild(shell);

    function savePreferences() { preferences.set(run.id, {mode: mode.value, color: color.value, opacity: Number(opacity.value)}); }
    function swatch(label, shade) {
      const item = element('span'); item.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-right:12px';
      const dot = element('span'); dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:2px;background:${shade}`;
      item.append(dot, element('span', label)); return item;
    }
    function scaleLegend(label, domain, palette, detail) {
      legend.appendChild(element('div', label + ' · Spectral (Matplotlib)'));
      const scale = element('div'); scale.style.cssText = 'display:flex;align-items:center;gap:7px;margin-top:3px';
      const bar = element('span'); bar.style.cssText = `display:inline-block;width:160px;height:9px;border-radius:2px;background:linear-gradient(to right,${palette.join(',')})`;
      scale.append(element('span', domain[0].toFixed(3)), bar, element('span', domain[1].toFixed(3)));
      legend.append(scale, element('div', detail));
    }
    function paint() {
      if (!viewer || disposed) return;
      opacityBox.hidden = mode.value !== 'ensemble'; isolate.hidden = mode.value !== 'ensemble';
      opacityText.textContent = `Opacity ${opacity.value}%`;
      legend.replaceChildren(); legend.title = '';
      const layer = layers.find(item => 'residue:' + item.id === color.value);
      const values = records.map(item => modelValue(item, color.value)).filter(finite);
      const domain = layer ? layerDomain(layer) : run.score_domains?.[color.value] || (values.length ? [Math.min(...values), Math.max(...values)] : [0, 1]);
      const palette = layer ? layerPalette(layer) : SPECTRAL;
      for (let index = 0; index < glModels.length; index++) {
        const gl = glModels[index], map = maps[index];
        if (mode.value === 'ensemble' || index === selected) gl.show(); else gl.hide();
        const alpha = mode.value === 'ensemble' ? Number(opacity.value) / 100 : 1;
        const signature = color.value + '|' + alpha;
        if (styled[index] === signature) continue;
        let cartoon = {opacity: alpha};
        if (color.value === 'rainbow') cartoon.colorfunc = atom => {
          const rank = map.ranks.get(residueKey(atom));
          return rank === undefined ? MISSING : rainbow(map.residues.length < 2 ? .5 : rank / (map.residues.length - 1));
        };
        else if (color.value === 'chain') cartoon.colorfunc = atom => {
          const index = maps[0].chains.indexOf(String(atom.chain ?? '').trim());
          return index < 0 ? MISSING : CHAINS[index % CHAINS.length];
        };
        else if (layer) {
          const lookup = layerRows(layer, records[index]);
          cartoon.colorfunc = atom => residueColor(lookup.get(residueKey(atom)), layer, domain, palette);
        } else cartoon.color = color.value === 'uniform' ? '#6078b5' : paletteColor(modelValue(records[index], color.value), ...domain);
        gl.setStyle({}, {cartoon}); styled[index] = signature;
      }
      if (color.value === 'chain') {
        legend.appendChild(element('div', 'Chain'));
        maps[0].chains.forEach((chain, index) => legend.appendChild(swatch(chain || 'Blank chain', CHAINS[index % CHAINS.length])));
      } else if (color.value === 'rainbow') {
        legend.appendChild(element('div', 'Spectral (Matplotlib) · sequence N → C'));
        const line = element('div'); line.style.cssText = 'display:flex;align-items:center;gap:7px';
        const bar = element('span'); bar.style.cssText = `display:inline-block;width:160px;height:9px;background:linear-gradient(to right,${SPECTRAL.join(',')});border-radius:2px`;
        line.append(element('span', 'N'), bar, element('span', 'C')); legend.appendChild(line);
        maps[0].chains.forEach((chain, index) => legend.appendChild(element('span', `${index ? ' · ' : ''}${chain || 'Blank chain'}`)));
      } else if (layer) {
        const shared = layer.scope !== 'model';
        const scope = run.single_model ? 'Independent single-model residue diagnostic' :
          shared ? `Ensemble diagnostic · same residue map on all ${records.length} models` : 'Residue metric · model-specific';
        scaleLegend(`${layer.label}${layer.unit ? ' · ' + layer.unit : ''}`, domain, palette, scope);
        legend.title = layer.definition || '';
        const missing = layer.id === 'shortest_unsupported_distance' ? 'No reported group / no assignment' : 'No assigned proton coverage';
        legend.appendChild(swatch(missing, missingColor(layer)));
      } else if (color.value !== 'uniform') {
        const label = color.value === 'dp' ? 'DP' : color.value[0].toUpperCase() + color.value.slice(1);
        const value = modelValue(records[selected], color.value);
        const unique = new Set(values).size;
        if (run.single_model) {
          scaleLegend(`${label} per model · cohort range`, domain, palette, `Selected model: ${finite(value) ? value.toFixed(3) : 'unavailable'}`);
        } else scaleLegend(`${run.model_score_label || 'Model'} ${label} · range within this ensemble`, domain, palette,
          `${unique} distinct scores · selected model ${records[selected].index || selected + 1}: ${finite(value) ? value.toFixed(3) : 'unavailable'}${unique === 1 ? ' · all models have the same score' : ''}`);
      }
      viewer.render();
    }
    function recenter() {
      if (!viewer || disposed || !glModels[selected]) return;
      viewer.zoomTo(mode.value === 'ensemble' ? {} : {model: glModels[selected].getID()}); viewer.render();
    }
    function selectModel(value) {
      const index = typeof value === 'number' ? value : records.findIndex(item => modelID(value) && modelID(item) === modelID(value));
      if (Number.isInteger(index) && index >= 0 && index < records.length) {
        const changed = selected !== index;
        selected = index; choice.value = String(index); paint();
        if (changed && mode.value === 'single') recenter();
      }
    }
    const controller = {selectModel, destroy() {
      disposed = true; observer?.disconnect(); if(downloadURL) URL.revokeObjectURL(downloadURL); if (viewer) { viewer.clear(); viewer = null; }
      container.replaceChildren(); mounted.delete(container);
    }};
    mounted.set(container, controller); selectModel(model);
    choice.addEventListener('change', () => { selected = Number(choice.value); paint(); if (mode.value === 'single') recenter(); if (onSelect) onSelect(records[selected]); });
    mode.addEventListener('change', () => { savePreferences(); paint(); recenter(); });
    color.addEventListener('change', () => { savePreferences(); paint(); });
    opacity.addEventListener('input', () => { savePreferences(); paint(); });
    isolate.addEventListener('click', () => { mode.value = 'single'; savePreferences(); paint(); recenter(); });
    reset.addEventListener('click', recenter);
    if ((coordinateText === undefined && (!artifact || artifact.available === false)) || !records.length) { toolbar.hidden = true; message.textContent = 'Structure unavailable'; return controller; }
    const framesPromise = coordinateText !== undefined ? Promise.resolve().then(() => readFrames(coordinateText)) : coordinates(
      artifact.url ? new URL(artifact.url, document.baseURI).href : `/api/runs/${encodeURIComponent(run.id)}/download/${encodeURIComponent(artifact.key)}`
    );
    // Residue diagnostics are optional; a missing supplement does not block coordinates.
    const residueURL = run.residue_metrics_url ? new URL(run.residue_metrics_url, document.baseURI).href : `/api/runs/${encodeURIComponent(run.id)}/residue-metrics`;
    const residuePromise = run.residue_metrics ? Promise.resolve().then(run.residue_metrics) :
      run.residue_metrics_url || !run.single_model ? fetch(residueURL, {credentials: 'same-origin'}).then(response => {
        if (!response.ok) throw new Error('Saved residue diagnostics unavailable');
        return response.json();
      }) : null;
    if (residuePromise) {
      residueStatus.textContent = 'Loading residue colors…';
      residuePromise.then(data => {
        if (disposed) return;
        layers = (data.layers || []).filter(item => item.id && item.label && Array.isArray(item.values));
        for (const layer of layers) { const option = element('option', 'Residue · ' + layer.label); option.value = 'residue:' + layer.id; color.appendChild(option); }
        const preferred = preferences.get(run.id)?.color || saved.color;
        if (layers.some(layer => 'residue:' + layer.id === preferred)) color.value = preferred;
        residueStatus.textContent = layers.length ? '' : 'Residue coloring unavailable';
        paint();
      }).catch(() => { if (!disposed) residueStatus.textContent = 'Residue coloring unavailable'; });
    }
    Promise.all([library(), framesPromise]).then(([api, frames]) => {
      if (disposed) return;
      if (frames.length !== records.length) throw new Error('Structure/model mapping does not match this run');
      let presentation;
      if(frames.length>1) {
        presentation=window.RpfPresentation.alignEnsemble(frames,run.alignment,records.map(modelID));
        frames=presentation.frames;
        const note=element('div',presentation.label);note.className='alignment-note';toolbar.appendChild(note);
        const download=element('a','Download aligned ensemble PDB');download.className='download-link';
        downloadURL=URL.createObjectURL(new Blob([presentation.pdb],{type:'chemical/x-pdb'}));
        download.href=downloadURL;download.download=String(run.id).replace(/[^a-zA-Z0-9_-]/g,'_')+'.aligned.pdb';toolbar.appendChild(download);
      }
      maps = frames.map(structureMap);
      const first = [...maps[0].ranks.keys()].sort().join('\n');
      if (maps.some(item => [...item.ranks.keys()].sort().join('\n') !== first)) throw new Error('Residue identities differ between ensemble models');
      message.remove(); viewer = api.createViewer(canvas, {backgroundColor: '#fafafa', antialias: true});
      glModels = frames.map(frame => viewer.addModel(frame, 'pdb', {keepH: true}));
      if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(() => { if (viewer && !disposed) viewer.resize(); }); observer.observe(canvas); }
      paint(); recenter(); if(onCoordinates)onCoordinates(presentation || {pdb:frames[0],frames});
    }).catch(error => { if (!disposed) { toolbar.hidden = true; canvas.replaceChildren(element('p', 'Structure unavailable: '+error.message)); } });
    return controller;
  }
  window.RpfStructure = {mount, colors: {modelValue, paletteColor, rainbow, residueKey, structureMap, layerMap, layerRows, residueColor, layerDomain, SPECTRAL, MISSING}};
})();
