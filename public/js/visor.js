(async function main() {
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    },
    center: [-103.3496, 20.6595],
    zoom: 7,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
  map.addControl(new maplibregl.FullscreenControl(), 'top-left');

  const layerListEl = document.getElementById('layerList');
  const layerCountEl = document.getElementById('layerCount');
  const zoomLevelEl = document.getElementById('zoomLevel');
  const centerInfoEl = document.getElementById('centerInfo');
  const modal = document.getElementById('layerModal');

  document.getElementById('refreshBtn').addEventListener('click', loadLayers);
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.dataset.close !== undefined) modal.classList.remove('show');
  });

  function vectorStyle(layer) {
    const s = layer.style || {};
    const base = {
      version: 8,
      sources: {},
      layers: [],
    };
    base.sources[layer.name] = {
      type: 'geojson',
      data: `/api/layers/${layer.id}/data`,
    };
    base.layers.push({
      id: layer.name,
      type: 'line',
      source: layer.name,
      paint: {
        'line-color': s.line_color || '#3388ff',
        'line-width': Number(s.line_width ?? 2),
        'line-opacity': Number(layer.opacity ?? 1),
      },
    });
    if (s.fill_color) {
      base.layers.push({
        id: layer.name + '_fill',
        type: 'fill',
        source: layer.name,
        paint: {
          'fill-color': s.fill_color,
          'fill-opacity': Number(s.fill_opacity ?? 0.3) * Number(layer.opacity ?? 1),
        },
      });
    }
    if (s.circle_color) {
      base.layers.push({
        id: layer.name + '_pt',
        type: 'circle',
        source: layer.name,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-color': s.circle_color,
          'circle-radius': Number(s.circle_radius ?? 5),
          'circle-opacity': Number(layer.opacity ?? 1),
        },
      });
    }
    return base;
  }

  function applyVisibility() {
    document.querySelectorAll('.layer-item input[type=checkbox]').forEach((cb) => {
      const id = cb.dataset.id;
      const layer = state.layers.find((l) => String(l.id) === id);
      if (!layer) return;
      const visibility = cb.checked ? 'visible' : 'none';
      try {
        if (map.getLayer(layer.name)) map.setLayoutProperty(layer.name, 'visibility', visibility);
        if (map.getLayer(layer.name + '_fill')) map.setLayoutProperty(layer.name + '_fill', 'visibility', visibility);
        if (map.getLayer(layer.name + '_pt')) map.setLayoutProperty(layer.name + '_pt', 'visibility', visibility);
        if (map.getSource(layer.name + '_raster')) {
          map.setLayoutProperty(layer.name + '_raster', 'visibility', visibility);
        }
      } catch (e) { /* layer not loaded yet */ }
    });
  }

  function applyOpacity() {
    document.querySelectorAll('.layer-item input[type=range]').forEach((rng) => {
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
    layerListEl.innerHTML = '';
    if (!state.layers.length) {
      layerListEl.innerHTML = '<div class="empty">Sin capas todavía. Sube algunas en el panel admin.</div>';
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
        try {
          await API.put(`/api/layers/${l.id}`, { visible: v });
          l.visible = v;
          applyVisibility();
        } catch (err) { alert(err.message); }
      });
      const rng = div.querySelector('input[type=range]');
      rng.addEventListener('input', () => {
        div.querySelector('.op-val').textContent = Number(rng.value).toFixed(2);
        applyOpacity();
      });
      rng.addEventListener('change', async (e) => {
        try {
          await API.put(`/api/layers/${l.id}`, { opacity: Number(e.target.value) });
          l.opacity = Number(e.target.value);
        } catch (err) { alert(err.message); }
      });
      div.querySelector('.name').addEventListener('click', () => focusLayer(l));
      layerListEl.appendChild(div);
    }
  }

  function focusLayer(l) {
    if (l.bbox_minx != null) {
      map.fitBounds(
        [[l.bbox_minx, l.bbox_miny], [l.bbox_maxx, l.bbox_maxy]],
        { padding: 40, maxZoom: 16, duration: 800 }
      );
    } else {
      map.flyTo({ center: [-103.3496, 20.6595], zoom: 8 });
    }
    showLayerInfo(l);
  }

  function showLayerInfo(l) {
    document.getElementById('layerModalTitle').textContent = l.title;
    const meta = `
      <p><strong>Tipo:</strong> ${l.type} · <strong>Formato:</strong> ${l.format.toUpperCase()}</p>
      <p><strong>Descripción:</strong> ${escapeHtml(l.description || '—')}</p>
      <p><strong>BBox:</strong> ${l.bbox_minx?.toFixed?.(4) ?? '—'}, ${l.bbox_miny?.toFixed?.(4) ?? '—'}, ${l.bbox_maxx?.toFixed?.(4) ?? '—'}, ${l.bbox_maxy?.toFixed?.(4) ?? '—'}</p>
      <p><strong>Archivo:</strong> ${escapeHtml(l.original_name || '—')} (${formatBytes(l.size_bytes)})</p>
      <p><strong>URL datos:</strong> <a href="/api/layers/${l.id}/data" target="_blank">/api/layers/${l.id}/data</a></p>
    `;
    document.getElementById('layerModalBody').innerHTML = meta;
    modal.classList.add('show');
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatBytes(b) {
    if (!b) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0, n = b;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(1)} ${units[i]}`;
  }

  const state = { layers: [] };

  async function loadLayers() {
    try {
      const { layers } = await API.get('/api/layers');
      state.layers = layers;
      renderLayerList();

      for (const l of layers) {
        const sourceId = l.name;
        const styleId = sourceId;
        if (l.type === 'vector') {
          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, { type: 'geojson', data: `/api/layers/${l.id}/data` });
            const s = l.style || {};
            if (!map.getLayer(styleId)) {
              map.addLayer({
                id: styleId, type: 'line', source: sourceId,
                paint: {
                  'line-color': s.line_color || '#3388ff',
                  'line-width': Number(s.line_width ?? 2),
                  'line-opacity': Number(l.opacity ?? 1),
                },
              });
            }
            if (s.fill_color && !map.getLayer(styleId + '_fill')) {
              map.addLayer({
                id: styleId + '_fill', type: 'fill', source: sourceId,
                paint: {
                  'fill-color': s.fill_color,
                  'fill-opacity': Number(s.fill_opacity ?? 0.3) * Number(l.opacity ?? 1),
                },
              });
            }
            if (s.circle_color && !map.getLayer(styleId + '_pt')) {
              map.addLayer({
                id: styleId + '_pt', type: 'circle', source: sourceId,
                filter: ['==', '$type', 'Point'],
                paint: {
                  'circle-color': s.circle_color,
                  'circle-radius': Number(s.circle_radius ?? 5),
                  'circle-opacity': Number(l.opacity ?? 1),
                },
              });
            }
          }
        } else if (l.type === 'raster') {
          if (!map.getSource(sourceId + '_raster')) {
            map.addSource(sourceId + '_raster', {
              type: 'raster',
              tiles: [`/api/layers/${l.id}/tile/{z}/{x}/{y}.png`],
              tileSize: 256,
            });
            if (!map.getLayer(sourceId + '_raster')) {
              map.addLayer({
                id: sourceId + '_raster', type: 'raster', source: sourceId + '_raster',
                paint: { 'raster-opacity': Number(l.opacity ?? 1) },
              });
            }
          }
        }
        if (!l.visible) {
          try { map.setLayoutProperty(styleId, 'visibility', 'none'); } catch {}
          try { map.setLayoutProperty(styleId + '_fill', 'visibility', 'none'); } catch {}
          try { map.setLayoutProperty(styleId + '_pt', 'visibility', 'none'); } catch {}
          try { map.setLayoutProperty(sourceId + '_raster', 'visibility', 'none'); } catch {}
        }
      }
    } catch (e) {
      layerListEl.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
    }
  }

  map.on('zoom', () => { zoomLevelEl.textContent = `z ${map.getZoom().toFixed(2)}`; });
  map.on('move', () => {
    const c = map.getCenter();
    centerInfoEl.textContent = `${c.lng.toFixed(4)}, ${c.lat.toFixed(4)}`;
  });

  map.on('load', loadLayers);
})();
