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
          tileSize: 256, maxzoom: 20, attribution: '© Google Maps',
        },
        'g-roads': {
          type: 'raster',
          tiles: ['https://mt1.google.com/vt/lyrs=r&x={x}&y={y}&z={z}'],
          tileSize: 256, maxzoom: 20, attribution: '© Google Maps',
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
  const measureInfo = document.getElementById('measureInfo');

  document.getElementById('refreshBtn').addEventListener('click', loadLayers);
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.dataset.close !== undefined) modal.classList.remove('show');
  });

  // ===== Sidebar toggle =====
  document.getElementById('toggleSidebar')?.addEventListener('click', () => {
    document.querySelector('.sidebar').classList.toggle('collapsed');
  });

  // ===== Fullscreen =====
  document.getElementById('fsBtn')?.addEventListener('click', () => {
    const el = document.getElementById('map');
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
    setTimeout(() => map.resize(), 200);
  });

  // ===== Google Maps =====
  document.getElementById('gmapsBtn')?.addEventListener('click', () => {
    const c = map.getCenter();
    const z = Math.round(map.getZoom());
    window.open(`https://www.google.com/maps/@${c.lat},${c.lng},${z}z`, '_blank');
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

  // ===== Measurement state =====
  let measureMode = null;
  let measurePoints = [];

  document.getElementById('toolDistance')?.addEventListener('click', () => toggleMeasure('distance'));
  document.getElementById('toolArea')?.addEventListener('click', () => toggleMeasure('area'));
  document.getElementById('toolLocate')?.addEventListener('click', locateUser);
  document.getElementById('measureClear')?.addEventListener('click', () => { clearMeasure(); toggleMeasure(null); });

  function toggleMeasure(mode) {
    if (measureMode === mode) mode = null;
    measureMode = mode;
    measurePoints = [];
    document.getElementById('toolDistance')?.classList.toggle('active', measureMode === 'distance');
    document.getElementById('toolArea')?.classList.toggle('active', measureMode === 'area');
    map.getCanvas().style.cursor = measureMode ? 'crosshair' : '';
    if (measureMode) { map.doubleClickZoom.disable(); measureInfo.style.display = 'flex'; }
    else { map.doubleClickZoom.enable(); clearMeasure(); }
    updateMeasureLabel();
  }

  function clearMeasure() {
    measurePoints = [];
    map.getSource('measure-src')?.setData({ type: 'FeatureCollection', features: [] });
    measureInfo.style.display = 'none';
    document.getElementById('toolDistance')?.classList.remove('active');
    document.getElementById('toolArea')?.classList.remove('active');
    map.getCanvas().style.cursor = '';
  }

  function updateMeasureLabel(previewLngLat) {
    const pts = [...measurePoints];
    if (previewLngLat) pts.push([previewLngLat.lng, previewLngLat.lat]);
    const features = pts.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p } }));
    let label = '';

    if (measureMode === 'distance') {
      if (pts.length >= 2) {
        features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts } });
        label = `Distancia: ${calcDist(pts).toFixed(2)} km`;
      } else { label = 'Click para agregar puntos'; }
    }
    if (measureMode === 'area') {
      if (pts.length >= 3) {
        features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] } });
        const a = calcArea(pts);
        const p = calcDist([...pts, pts[0]]);
        label = `Area: ${(a / 10000).toFixed(2)} ha | Perimetro: ${p.toFixed(2)} km`;
      } else { label = pts.length === 0 ? 'Click para iniciar' : `Click (${pts.length}/3 min)`; }
    }

    measureInfo.querySelector('.measure-text').textContent = label;
    map.getSource('measure-src')?.setData({ type: 'FeatureCollection', features });
  }

  map.on('click', (e) => {
    if (!measureMode) return;
    measurePoints.push([e.lngLat.lng, e.lngLat.lat]);
    updateMeasureLabel();
  });
  map.on('mousemove', (e) => {
    if (!measureMode || measurePoints.length === 0) return;
    updateMeasureLabel(e.lngLat);
  });
  map.on('dblclick', () => { if (measureMode) toggleMeasure(null); });

  function calcDist(pts) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ln1, la1] = pts[i - 1], [ln2, la2] = pts[i];
      const dLa = (la2 - la1) * Math.PI / 180, dLn = (ln2 - ln1) * Math.PI / 180;
      const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLn / 2) ** 2;
      d += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    return d;
  }

  function calcArea(pts) {
    const R = 6378137; let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ln1, la1] = pts[i], [ln2, la2] = pts[(i + 1) % pts.length];
      s += (ln2 - ln1) * Math.PI / 180 * (2 + Math.sin(la1 * Math.PI / 180) + Math.sin(la2 * Math.PI / 180));
    }
    return Math.abs(s * R * R / 2);
  }

  function locateUser() {
    if (!navigator.geolocation) { alert('Geolocalizacion no soportada'); return; }
    const btn = document.getElementById('toolLocate');
    btn.classList.add('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btn.classList.remove('loading');
        const { latitude: lat, longitude: lng } = pos.coords;
        map.flyTo({ center: [lng, lat], zoom: 14 });
        if (map.getSource('locate-src')) {
          map.getSource('locate-src').setData({ type: 'Point', coordinates: [lng, lat] });
        } else {
          map.addSource('locate-src', { type: 'geojson', data: { type: 'Point', coordinates: [lng, lat] } });
          map.addLayer({
            id: 'locate-point', type: 'circle', source: 'locate-src',
            paint: { 'circle-radius': 8, 'circle-color': '#3b82f6', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' },
          });
        }
      },
      (err) => { btn.classList.remove('loading'); alert('Ubicacion no disponible: ' + err.message); },
      { enableHighAccuracy: true }
    );
  }

  // ===== Map load =====
  map.on('load', () => {

    // Municipios - solo lineas, sin relleno
    map.addSource('mun-src', {
      type: 'vector',
      tiles: [`https://api.mapbox.com/v4/javierslsemadet.njsr40/{z}/{x}/{y}.vector.pbf?access_token=${MB_TOKEN}`],
      minzoom: 0, maxzoom: 13,
    });
    map.addLayer({
      id: 'mun-line', type: 'line', source: 'mun-src', 'source-layer': MUN_SL,
      paint: { 'line-color': '#2563eb', 'line-width': 1.5, 'line-opacity': 0.8 },
    });

    // ANPS
    map.addSource('anps-src', {
      type: 'vector',
      tiles: [`https://api.mapbox.com/v4/javierslsemadet.za1ttr/{z}/{x}/{y}.vector.pbf?access_token=${MB_TOKEN}`],
      minzoom: 0, maxzoom: 13,
    });
    map.addLayer({
      id: 'anps-fill', type: 'fill', source: 'anps-src', 'source-layer': ANPS_SL,
      paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.5 },
    });
    map.addLayer({
      id: 'anps-line', type: 'line', source: 'anps-src', 'source-layer': ANPS_SL,
      paint: { 'line-color': '#15803d', 'line-width': 1.5, 'line-opacity': 0.9 },
    });

    // Measurement source
    map.addSource('measure-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'measure-fill', type: 'fill', source: 'measure-src', filter: ['==', '$type', 'Polygon'],
      paint: { 'fill-color': '#073763', 'fill-opacity': 0.15 },
    });
    map.addLayer({
      id: 'measure-line', type: 'line', source: 'measure-src', filter: ['==', '$type', 'LineString'],
      paint: { 'line-color': '#073763', 'line-width': 2.5, 'line-dasharray': [2, 1] },
    });
    map.addLayer({
      id: 'measure-poly-line', type: 'line', source: 'measure-src', filter: ['==', '$type', 'Polygon'],
      paint: { 'line-color': '#073763', 'line-width': 2, 'line-dasharray': [2, 1] },
    });
    map.addLayer({
      id: 'measure-points', type: 'circle', source: 'measure-src', filter: ['==', '$type', 'Point'],
      paint: { 'circle-radius': 5, 'circle-color': '#fff', 'circle-stroke-width': 2, 'circle-stroke-color': '#ff8300' },
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
      map.setPaintProperty('anps-fill', 'fill-opacity', v * 0.6);
      map.setPaintProperty('anps-line', 'line-opacity', Math.min(v + 0.2, 1));
    });
    document.getElementById('sig-mun').addEventListener('change', (e) => {
      map.setLayoutProperty('mun-line', 'visibility', e.target.checked ? 'visible' : 'none');
    });
    document.getElementById('sig-mun-op').addEventListener('input', (e) => {
      const v = parseInt(e.target.value) / 100;
      document.getElementById('sig-mun-val').textContent = e.target.value + '%';
      map.setPaintProperty('mun-line', 'line-opacity', v);
    });
  }

  function setupPopups() {
    const fmt = (n) => (!n || isNaN(n)) ? 'N/A' : Number(n).toLocaleString('es-MX');

    map.on('click', 'anps-fill', (e) => {
      if (measureMode) return;
      const p = e.features[0].properties;
      new maplibregl.Popup({ maxWidth: '300px' }).setLngLat(e.lngLat).setHTML(
        `<div class="popup-content"><div class="popup-title">${p.NOM_ANP || 'ANP'}</div>` +
        (p.ADMIN ? `<div class="popup-badge ${/federal/i.test(p.ADMIN) ? 'federal' : 'estatal'}">${p.ADMIN}</div>` : '') +
        `<div class="popup-row"><span class="popup-label">Tipo</span><span class="popup-val">${p.TIPO || 'N/A'}</span></div>` +
        `<div class="popup-row"><span class="popup-label">Region</span><span class="popup-val">${p.REGION || 'N/A'}</span></div>` +
        `<div class="popup-row"><span class="popup-label">Municipio</span><span class="popup-val">${p.MUNICIPIO || 'N/A'}</span></div>` +
        `<div class="popup-row"><span class="popup-label">Superficie</span><span class="popup-val">${fmt(p.SUPERFICIE)} ha</span></div></div>`
      ).addTo(map);
    });

    map.on('click', 'mun-line', (e) => {
      if (measureMode) return;
      const p = e.features[0].properties;
      new maplibregl.Popup({ maxWidth: '300px' }).setLngLat(e.lngLat).setHTML(
        `<div class="popup-content"><div class="popup-title">${p.nombre || 'Municipio'}</div>` +
        `<div class="popup-row"><span class="popup-label">Region</span><span class="popup-val">${p.region || 'N/A'}</span></div>` +
        `<div class="popup-row"><span class="popup-label">Clave</span><span class="popup-val">${p.clave_muni ?? 'N/A'}</span></div></div>`
      ).addTo(map);
    });

    ['anps-fill', 'mun-line'].forEach((id) => {
      map.on('mouseenter', id, () => { if (!measureMode) map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { if (!measureMode) map.getCanvas().style.cursor = ''; });
    });
  }

  // ===== Database layers =====
  function applyVisibility() {
    document.querySelectorAll('#dbLayers .layer-item input[type=checkbox]').forEach((cb) => {
      const layer = state.layers.find((l) => String(l.id) === cb.dataset.id);
      if (!layer) return;
      const vis = cb.checked ? 'visible' : 'none';
      [['', ''], ['_fill', ''], ['_pt', ''], ['_raster', '']].forEach(([s]) => {
        try { map.setLayoutProperty(layer.name + s, 'visibility', vis); } catch {}
      });
    });
  }

  function applyOpacity() {
    document.querySelectorAll('#dbLayers .layer-item input[type=range]').forEach((rng) => {
      const layer = state.layers.find((l) => String(l.id) === rng.dataset.id);
      if (!layer) return;
      try {
        const v = Number(rng.value);
        if (map.getLayer(layer.name)) map.setPaintProperty(layer.name, 'line-opacity', v);
        if (map.getLayer(layer.name + '_fill')) map.setPaintProperty(layer.name + '_fill', 'fill-opacity', v * 0.3);
        if (map.getLayer(layer.name + '_pt')) map.setPaintProperty(layer.name + '_pt', 'circle-opacity', v);
        if (map.getLayer(layer.name + '_raster')) map.setPaintProperty(layer.name + '_raster', 'raster-opacity', v);
      } catch {}
    });
  }

  function renderLayerList() {
    dbLayerListEl.innerHTML = '';
    if (!state.layers.length) dbLayerListEl.innerHTML = '<div class="empty">Sin capas.</div>';
    layerCountEl.textContent = `${state.layers.length} capa(s)`;
    for (const l of state.layers) {
      const div = document.createElement('div');
      div.className = 'layer-item';
      div.innerHTML = `<input type="checkbox" data-id="${l.id}" ${l.visible ? 'checked' : ''} /><div style="flex:1"><div class="name">${escapeHtml(l.title)}</div><div class="meta">${l.format.toUpperCase()} · z${l.z_index} · opacidad <span class="op-val">${Number(l.opacity).toFixed(2)}</span></div><input type="range" min="0" max="1" step="0.05" value="${l.opacity}" data-id="${l.id}" style="width:100%" /></div><span class="badge ${l.type}">${l.type}</span>`;
      div.querySelector('input[type=checkbox]').addEventListener('change', async (e) => {
        try { await API.put(`/api/layers/${l.id}`, { visible: e.target.checked }); l.visible = e.target.checked; applyVisibility(); }
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
    if (l.bbox_minx != null) map.fitBounds([[l.bbox_minx, l.bbox_miny], [l.bbox_maxx, l.bbox_maxy]], { padding: 40, maxZoom: 16, duration: 800 });
    else map.flyTo({ center: [-103.3496, 20.6595], zoom: 8 });
    document.getElementById('layerModalTitle').textContent = l.title;
    document.getElementById('layerModalBody').innerHTML = `<p><strong>Tipo:</strong> ${l.type} · <strong>Formato:</strong> ${l.format.toUpperCase()}</p><p><strong>Descripcion:</strong> ${escapeHtml(l.description || '—')}</p><p><strong>BBox:</strong> ${l.bbox_minx?.toFixed?.(4) ?? '—'}, ${l.bbox_miny?.toFixed?.(4) ?? '—'}, ${l.bbox_maxx?.toFixed?.(4) ?? '—'}, ${l.bbox_maxy?.toFixed?.(4) ?? '—'}</p>`;
    modal.classList.add('show');
  }

  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  const state = { layers: [] };

  async function loadLayers() {
    try {
      const { layers } = await API.get('/api/layers');
      state.layers = layers.filter(l => !/uso\s*de\s*suelo/i.test(l.title || l.name || ''));
      renderLayerList();
      for (const l of state.layers) {
        const sid = l.name;
        if (l.type === 'vector') {
          if (!map.getSource(sid)) {
            map.addSource(sid, { type: 'geojson', data: `/api/layers/${l.id}/data` });
            const s = l.style || {};
            if (!map.getLayer(sid)) map.addLayer({ id: sid, type: 'line', source: sid, paint: { 'line-color': s.line_color || '#3388ff', 'line-width': Number(s.line_width ?? 2), 'line-opacity': Number(l.opacity ?? 1) } });
            if (s.fill_color && !map.getLayer(sid + '_fill')) map.addLayer({ id: sid + '_fill', type: 'fill', source: sid, paint: { 'fill-color': s.fill_color, 'fill-opacity': Number(s.fill_opacity ?? 0.3) * Number(l.opacity ?? 1) } });
          }
        } else if (l.type === 'raster') {
          if (!map.getSource(sid + '_raster')) {
            map.addSource(sid + '_raster', { type: 'raster', tiles: [`/api/layers/${l.id}/tile/{z}/{x}/{y}.png`], tileSize: 256 });
            if (!map.getLayer(sid + '_raster')) map.addLayer({ id: sid + '_raster', type: 'raster', source: sid + '_raster', paint: { 'raster-opacity': Number(l.opacity ?? 1) } });
          }
        }
        if (!l.visible) { try { map.setLayoutProperty(sid, 'visibility', 'none'); } catch {} }
      }
    } catch (e) { dbLayerListEl.innerHTML = `<div class="empty">Error: ${e.message}</div>`; }
  }

  map.on('zoom', () => { zoomLevelEl.textContent = `z ${map.getZoom().toFixed(2)}`; });
  map.on('move', () => { const c = map.getCenter(); centerInfoEl.textContent = `${c.lng.toFixed(4)}, ${c.lat.toFixed(4)}`; });
})();
