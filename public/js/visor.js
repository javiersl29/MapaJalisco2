(async function main() {
  let MB_TOKEN = '';
  try {
    const cfg = await fetch('/api/config').then(r => r.json());
    MB_TOKEN = cfg.mapbox_token || '';
  } catch (e) {
    console.error('[visor] Config no disponible:', e);
  }
  const ANPS_SL = 'ConcentradoANPS.zip-18ufyr';
  const MUN_SL = 'Municipios.zip-gytvjw';

  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'g-hybrid': {
          type: 'raster',
          tiles: ['https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'],
          tileSize: 256,
          maxzoom: 20,
          attribution: '© Google Maps',
        },
        'g-roads': {
          type: 'raster',
          tiles: ['https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}'],
          tileSize: 256,
          maxzoom: 20,
          attribution: '© Google Maps',
        },
      },
      layers: [
        { id: 'base-hybrid', type: 'raster', source: 'g-hybrid' },
        { id: 'base-roads', type: 'raster', source: 'g-roads', layout: { visibility: 'none' } },
      ],
    },
    center: [-103.3496, 20.6595],
    zoom: 7,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

  const dbLayerListEl = document.getElementById('dbLayers');
  const layerCountEl = document.getElementById('layerCount');
  const zoomLevelEl = document.getElementById('zoomLevel');
  const centerInfoEl = document.getElementById('centerInfo');
  const modal = document.getElementById('layerModal');

  document.getElementById('refreshBtn').addEventListener('click', loadLayers);

  document.getElementById('fsBtn')?.addEventListener('click', () => {
    const el = document.getElementById('map');
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
    setTimeout(() => map.resize(), 200);
  });

  document.getElementById('gmapsBtn')?.addEventListener('click', () => {
    const c = map.getCenter();
    const z = Math.round(map.getZoom());
    window.open(`https://www.google.com/maps/@${c.lat},${c.lng},${z}z`, '_blank');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.dataset.close !== undefined) modal.classList.remove('show');
  });

  // ===== Base layer switching =====
  document.querySelectorAll('input[name="basemap"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      if (e.target.value === 'hybrid') {
        map.setLayoutProperty('base-hybrid', 'visibility', 'visible');
        map.setLayoutProperty('base-roads', 'visibility', 'none');
      } else {
        map.setLayoutProperty('base-hybrid', 'visibility', 'none');
        map.setLayoutProperty('base-roads', 'visibility', 'visible');
      }
    });
  });

  // ===== SIG layers on load =====
  map.on('load', () => {

    map.addSource('mun-src', {
      type: 'vector',
      tiles: [`https://api.mapbox.com/v4/javierslsemadet.njsr40/{z}/{x}/{y}.vector.pbf?access_token=${MB_TOKEN}`],
      minzoom: 0,
      maxzoom: 13,
    });
    map.addLayer({
      id: 'mun-fill', type: 'fill', source: 'mun-src', 'source-layer': MUN_SL,
      paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.35 },
    });
    map.addLayer({
      id: 'mun-line', type: 'line', source: 'mun-src', 'source-layer': MUN_SL,
      paint: { 'line-color': '#2563eb', 'line-width': 1, 'line-opacity': 0.7 },
    });

    map.addSource('anps-src', {
      type: 'vector',
      tiles: [`https://api.mapbox.com/v4/javierslsemadet.za1ttr/{z}/{x}/{y}.vector.pbf?access_token=${MB_TOKEN}`],
      minzoom: 0,
      maxzoom: 13,
    });
    map.addLayer({
      id: 'anps-fill', type: 'fill', source: 'anps-src', 'source-layer': ANPS_SL,
      paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.5 },
    });
    map.addLayer({
      id: 'anps-line', type: 'line', source: 'anps-src', 'source-layer': ANPS_SL,
      paint: { 'line-color': '#15803d', 'line-width': 1.5, 'line-opacity': 0.9 },
    });

    setupSIGControls();
    setupPopups();
    loadLayers();
  });

  function setupSIGControls() {
    document.getElementById('sig-anps').addEventListener('change', (e) => {
      const v = e.target.checked ? 'visible' : 'none';
      map.setLayoutProperty('anps-fill', 'visibility', v);
      map.setLayoutProperty('anps-line', 'visibility', v);
    });
    document.getElementById('sig-anps-op').addEventListener('input', (e) => {
      const v = parseInt(e.target.value) / 100;
      document.getElementById('sig-anps-val').textContent = e.target.value + '%';
      map.setPaintProperty('anps-fill', 'fill-opacity', v);
      map.setPaintProperty('anps-line', 'line-opacity', Math.min(v + 0.2, 1));
    });
    document.getElementById('sig-mun').addEventListener('change', (e) => {
      const v = e.target.checked ? 'visible' : 'none';
      map.setLayoutProperty('mun-fill', 'visibility', v);
      map.setLayoutProperty('mun-line', 'visibility', v);
    });
    document.getElementById('sig-mun-op').addEventListener('input', (e) => {
      const v = parseInt(e.target.value) / 100;
      document.getElementById('sig-mun-val').textContent = e.target.value + '%';
      map.setPaintProperty('mun-fill', 'fill-opacity', v);
      map.setPaintProperty('mun-line', 'line-opacity', Math.min(v + 0.2, 1));
    });
  }

  function setupPopups() {
    const fmtNum = (n) => (!n || isNaN(n)) ? 'N/A' : Number(n).toLocaleString('es-MX');

    map.on('click', 'anps-fill', (e) => {
      const p = e.features[0].properties;
      new maplibregl.Popup({ maxWidth: '300px' })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="popup-content">
            <div class="popup-title">${p.NOM_ANP || 'ANP'}</div>
            <div class="popup-row"><span class="popup-label">Tipo</span><span class="popup-val">${p.TIPO || 'N/A'}</span></div>
            <div class="popup-row"><span class="popup-label">Región</span><span class="popup-val">${p.REGION || 'N/A'}</span></div>
            <div class="popup-row"><span class="popup-label">Municipio</span><span class="popup-val">${p.MUNICIPIO || 'N/A'}</span></div>
            <div class="popup-row"><span class="popup-label">Superficie</span><span class="popup-val">${fmtNum(p.SUPERFICIE)} ha</span></div>
          </div>`)
        .addTo(map);
    });

    map.on('click', 'mun-fill', (e) => {
      const p = e.features[0].properties;
      new maplibregl.Popup({ maxWidth: '300px' })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div class="popup-content">
            <div class="popup-title">${p.nombre || 'Municipio'}</div>
            <div class="popup-row"><span class="popup-label">Región</span><span class="popup-val">${p.region || 'N/A'}</span></div>
            <div class="popup-row"><span class="popup-label">Clave</span><span class="popup-val">${p.clave_muni ?? 'N/A'}</span></div>
          </div>`)
        .addTo(map);
    });

    ['anps-fill', 'mun-fill'].forEach((id) => {
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    });
  }

  // ===== Database layer functions =====
  function vectorStyle(layer) {
    const s = layer.style || {};
    const base = { version: 8, sources: {}, layers: [] };
    base.sources[layer.name] = { type: 'geojson', data: `/api/layers/${layer.id}/data` };
    base.layers.push({
      id: layer.name, type: 'line', source: layer.name,
      paint: { 'line-color': s.line_color || '#3388ff', 'line-width': Number(s.line_width ?? 2), 'line-opacity': Number(layer.opacity ?? 1) },
    });
    if (s.fill_color) {
      base.layers.push({
        id: layer.name + '_fill', type: 'fill', source: layer.name,
        paint: { 'fill-color': s.fill_color, 'fill-opacity': Number(s.fill_opacity ?? 0.3) * Number(layer.opacity ?? 1) },
      });
    }
    if (s.circle_color) {
      base.layers.push({
        id: layer.name + '_pt', type: 'circle', source: layer.name, filter: ['==', '$type', 'Point'],
        paint: { 'circle-color': s.circle_color, 'circle-radius': Number(s.circle_radius ?? 5), 'circle-opacity': Number(layer.opacity ?? 1) },
      });
    }
    return base;
  }

  function applyVisibility() {
    document.querySelectorAll('#dbLayers .layer-item input[type=checkbox]').forEach((cb) => {
      const id = cb.dataset.id;
      const layer = state.layers.find((l) => String(l.id) === id);
      if (!layer) return;
      const visibility = cb.checked ? 'visible' : 'none';
      try {
        if (map.getLayer(layer.name)) map.setLayoutProperty(layer.name, 'visibility', visibility);
        if (map.getLayer(layer.name + '_fill')) map.setLayoutProperty(layer.name + '_fill', 'visibility', visibility);
        if (map.getLayer(layer.name + '_pt')) map.setLayoutProperty(layer.name + '_pt', 'visibility', visibility);
        if (map.getSource(layer.name + '_raster')) map.setLayoutProperty(layer.name + '_raster', 'visibility', visibility);
      } catch (e) { /* layer not loaded yet */ }
    });
  }

  function applyOpacity() {
    document.querySelectorAll('#dbLayers .layer-item input[type=range]').forEach((rng) => {
      const id = rng.dataset.id;
      const layer = state.layers.find((l) => String(l.id) === id);
      if (!layer) return;
      try {
        if (map.getLayer(layer.name)) map.setPaintProperty(layer.name, 'line-opacity', Number(rng.value));
        if (map.getLayer(layer.name + '_fill')) map.setPaintProperty(layer.name + '_fill', 'fill-opacity', Number(rng.value) * 0.3);
        if (map.getLayer(layer.name + '_pt')) map.setPaintProperty(layer.name + '_pt', 'circle-opacity', Number(rng.value));
        if (map.getLayer(layer.name + '_raster')) map.setPaintProperty(layer.name + '_raster', 'raster-opacity', Number(rng.value));
      } catch (e) { /* layer not loaded yet */ }
    });
  }

  function renderLayerList() {
    dbLayerListEl.innerHTML = '';
    if (!state.layers.length) {
      dbLayerListEl.innerHTML = '<div class="empty">Sin capas. Sube algunas en el panel admin.</div>';
    }
    layerCountEl.textContent = `${state.layers.length} capa(s)`;
    for (const l of state.layers) {
      const div = document.createElement('div');
      div.className = 'layer-item';
      const safeTitle = escapeHtml(l.title);
      div.innerHTML = `
        <input type="checkbox" data-id="${l.id}" ${l.visible ? 'checked' : ''} />
        <div style="flex:1">
          <div class="name">${safeTitle}</div>
          <div class="meta">${l.format.toUpperCase()} · z${l.z_index} · opacidad <span class="op-val">${Number(l.opacity).toFixed(2)}</span></div>
          <input type="range" min="0" max="1" step="0.05" value="${l.opacity}" data-id="${l.id}" style="width:100%" />
        </div>
        <span class="badge ${l.type}">${l.type}</span>
      `;
      div.querySelector('input[type=checkbox]').addEventListener('change', async (e) => {
        const v = e.target.checked;
        try { await API.put(`/api/layers/${l.id}`, { visible: v }); l.visible = v; applyVisibility(); }
        catch (err) { alert(err.message); }
      });
      const rng = div.querySelector('input[type=range]');
      rng.addEventListener('input', () => { div.querySelector('.op-val').textContent = Number(rng.value).toFixed(2); applyOpacity(); });
      rng.addEventListener('change', async (e) => {
        try { await API.put(`/api/layers/${l.id}`, { opacity: Number(e.target.value) }); l.opacity = Number(e.target.value); }
        catch (err) { alert(err.message); }
      });
      div.querySelector('.name').addEventListener('click', () => focusLayer(l));
      dbLayerListEl.appendChild(div);
    }
  }

  function focusLayer(l) {
    if (l.bbox_minx != null) {
      map.fitBounds([[l.bbox_minx, l.bbox_miny], [l.bbox_maxx, l.bbox_maxy]], { padding: 40, maxZoom: 16, duration: 800 });
    } else { map.flyTo({ center: [-103.3496, 20.6595], zoom: 8 }); }
    showLayerInfo(l);
  }

  function showLayerInfo(l) {
    document.getElementById('layerModalTitle').textContent = l.title;
    document.getElementById('layerModalBody').innerHTML = `
      <p><strong>Tipo:</strong> ${l.type} · <strong>Formato:</strong> ${l.format.toUpperCase()}</p>
      <p><strong>Descripción:</strong> ${escapeHtml(l.description || '—')}</p>
      <p><strong>BBox:</strong> ${l.bbox_minx?.toFixed?.(4) ?? '—'}, ${l.bbox_miny?.toFixed?.(4) ?? '—'}, ${l.bbox_maxx?.toFixed?.(4) ?? '—'}, ${l.bbox_maxy?.toFixed?.(4) ?? '—'}</p>
      <p><strong>Archivo:</strong> ${escapeHtml(l.original_name || '—')} (${formatBytes(l.size_bytes)})</p>
      <p><strong>URL datos:</strong> <a href="/api/layers/${l.id}/data" target="_blank">/api/layers/${l.id}/data</a></p>`;
    modal.classList.add('show');
  }

  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function formatBytes(b) { if (!b) return '—'; const u = ['B','KB','MB','GB']; let i=0,n=b; while(n>=1024&&i<u.length-1){n/=1024;i++;} return `${n.toFixed(1)} ${u[i]}`; }

  const state = { layers: [] };

  async function loadLayers() {
    try {
      const { layers } = await API.get('/api/layers');
      state.layers = layers.filter(l => !/uso\s*de\s*suelo/i.test(l.title || l.name || ''));
      renderLayerList();
      for (const l of state.layers) {
        const sourceId = l.name;
        if (l.type === 'vector') {
          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, { type: 'geojson', data: `/api/layers/${l.id}/data` });
            const s = l.style || {};
            if (!map.getLayer(sourceId)) map.addLayer({ id: sourceId, type: 'line', source: sourceId, paint: { 'line-color': s.line_color || '#3388ff', 'line-width': Number(s.line_width ?? 2), 'line-opacity': Number(l.opacity ?? 1) } });
            if (s.fill_color && !map.getLayer(sourceId + '_fill')) map.addLayer({ id: sourceId + '_fill', type: 'fill', source: sourceId, paint: { 'fill-color': s.fill_color, 'fill-opacity': Number(s.fill_opacity ?? 0.3) * Number(l.opacity ?? 1) } });
            if (s.circle_color && !map.getLayer(sourceId + '_pt')) map.addLayer({ id: sourceId + '_pt', type: 'circle', source: sourceId, filter: ['==', '$type', 'Point'], paint: { 'circle-color': s.circle_color, 'circle-radius': Number(s.circle_radius ?? 5), 'circle-opacity': Number(l.opacity ?? 1) } });
          }
        } else if (l.type === 'raster') {
          if (!map.getSource(sourceId + '_raster')) {
            map.addSource(sourceId + '_raster', { type: 'raster', tiles: [`/api/layers/${l.id}/tile/{z}/{x}/{y}.png`], tileSize: 256 });
            if (!map.getLayer(sourceId + '_raster')) map.addLayer({ id: sourceId + '_raster', type: 'raster', source: sourceId + '_raster', paint: { 'raster-opacity': Number(l.opacity ?? 1) } });
          }
        }
        if (!l.visible) {
          try { map.setLayoutProperty(sourceId, 'visibility', 'none'); } catch {}
          try { map.setLayoutProperty(sourceId + '_fill', 'visibility', 'none'); } catch {}
          try { map.setLayoutProperty(sourceId + '_pt', 'visibility', 'none'); } catch {}
          try { map.setLayoutProperty(sourceId + '_raster', 'visibility', 'none'); } catch {}
        }
      }
    } catch (e) { dbLayerListEl.innerHTML = `<div class="empty">Error: ${e.message}</div>`; }
  }

  map.on('zoom', () => { zoomLevelEl.textContent = `z ${map.getZoom().toFixed(2)}`; });
  map.on('move', () => { const c = map.getCenter(); centerInfoEl.textContent = `${c.lng.toFixed(4)}, ${c.lat.toFixed(4)}`; });
})();
