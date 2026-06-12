(async function main() {
  const token = localStorage.getItem('token');
  if (!token) { location.href = '/login'; return; }

  let user = null;
  try {
    const r = await API.get('/api/auth/me');
    user = r.user;
  } catch {
    localStorage.removeItem('token');
    location.href = '/login';
    return;
  }

  document.getElementById('userLabel').textContent = user.username;
  document.getElementById('roleLabel').textContent = user.role;

  if (user.role !== 'admin') {
    document.querySelector('[data-tab="users"]').style.display = 'none';
  }

  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.href = '/login';
  });

  document.querySelectorAll('#nav button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#nav button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
      document.getElementById('tab-' + b.dataset.tab).classList.add('active');
    });
  });

  // Layers
  async function loadLayers() {
    const { layers } = await API.get('/api/layers');
    const tbody = document.getElementById('layersTable');
    tbody.innerHTML = '';
    if (!layers.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#64748b;padding:20px">Sin capas</td></tr>';
      return;
    }
    for (const l of layers) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(l.title)}</strong><div style="font-size:11px;color:#64748b">${escapeHtml(l.description || '')}</div></td>
        <td><span class="badge ${l.type}">${l.type}</span></td>
        <td>${l.format.toUpperCase()}</td>
        <td><input type="checkbox" data-id="${l.id}" data-field="visible" ${l.visible ? 'checked' : ''} /></td>
        <td><input type="number" value="${l.z_index}" data-id="${l.id}" data-field="z_index" style="width:60px" /></td>
        <td><input type="number" min="0" max="1" step="0.05" value="${l.opacity}" data-id="${l.id}" data-field="opacity" style="width:60px" /></td>
        <td class="row-actions">
          <button data-id="${l.id}" data-act="edit">Estilo</button>
          <button data-id="${l.id}" data-act="del" class="danger">Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll('input[data-field]').forEach((inp) => {
      inp.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const field = e.target.dataset.field;
        let val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        if (field === 'opacity' || field === 'z_index') val = Number(val);
        try { await API.put(`/api/layers/${id}`, { [field]: val }); }
        catch (err) { alert(err.message); }
      });
    });
    tbody.querySelectorAll('button[data-act=del]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar capa?')) return;
        try { await API.del(`/api/layers/${b.dataset.id}`); loadLayers(); }
        catch (err) { alert(err.message); }
      });
    });
    tbody.querySelectorAll('button[data-act=edit]').forEach((b) => {
      b.addEventListener('click', () => editStyle(Number(b.dataset.id)));
    });
  }

  async function editStyle(id) {
    const { layer } = await API.get(`/api/layers/${id}`);
    const s = layer.style || {};
    const html = `
      <div class="form-grid">
        <div><label>Color línea</label><input type="color" id="s_line_color" value="${s.line_color || '#3388ff'}" /></div>
        <div><label>Grosor línea</label><input type="number" id="s_line_width" value="${s.line_width ?? 2}" min="0" max="10" step="0.5" /></div>
        <div><label>Color relleno</label><input type="color" id="s_fill_color" value="${s.fill_color || '#3388ff'}" /></div>
        <div><label>Opacidad relleno (0-1)</label><input type="number" id="s_fill_opacity" value="${s.fill_opacity ?? 0.3}" min="0" max="1" step="0.05" /></div>
        <div><label>Color puntos</label><input type="color" id="s_circle_color" value="${s.circle_color || '#3388ff'}" /></div>
        <div><label>Radio puntos</label><input type="number" id="s_circle_radius" value="${s.circle_radius ?? 5}" min="1" max="20" /></div>
        <div class="full"><button class="btn primary" id="saveStyle">Guardar estilo</button></div>
      </div>
    `;
    openModal(`Estilo: ${layer.title}`, html);
    document.getElementById('saveStyle').addEventListener('click', async () => {
      const style = {
        line_color: document.getElementById('s_line_color').value,
        line_width: Number(document.getElementById('s_line_width').value),
        fill_color: document.getElementById('s_fill_color').value,
        fill_opacity: Number(document.getElementById('s_fill_opacity').value),
        circle_color: document.getElementById('s_circle_color').value,
        circle_radius: Number(document.getElementById('s_circle_radius').value),
      };
      try {
        await API.put(`/api/layers/${id}`, { style });
        closeModal();
        loadLayers();
      } catch (err) { alert(err.message); }
    });
  }

  // Upload
  document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const type = fd.get('type');
    const endpoint = type === 'vector' ? '/api/layers/upload/vector' : '/api/layers/upload/raster';
    try {
      await API.upload(endpoint, fd);
      e.target.reset();
      loadLayers();
    } catch (err) { alert(err.message); }
  });

  // Users (admin only)
  async function loadUsers() {
    if (user.role !== 'admin') return;
    const { users } = await API.get('/api/users');
    const tbody = document.getElementById('usersTable');
    tbody.innerHTML = '';
    for (const u of users) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.id}</td>
        <td>${escapeHtml(u.username)}</td>
        <td>${u.role}</td>
        <td class="row-actions">
          ${u.id !== user.sub ? `<button data-id="${u.id}" data-act="del" class="danger">Eliminar</button>` : '<span style="color:#94a3b8;font-size:12px">(tú)</span>'}
        </td>
      `;
      tbody.appendChild(tr);
    }
    tbody.querySelectorAll('button[data-act=del]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (!confirm('¿Eliminar usuario?')) return;
        try { await API.del(`/api/users/${b.dataset.id}`); loadUsers(); }
        catch (err) { alert(err.message); }
      });
    });
  }
  document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await API.post('/api/users', {
        username: fd.get('username'),
        password: fd.get('password'),
        role: fd.get('role'),
      });
      e.target.reset();
      loadUsers();
    } catch (err) { alert(err.message); }
  });

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Modal helpers
  function openModal(title, bodyHtml) {
    let backdrop = document.getElementById('adminModal');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'adminModal';
      backdrop.className = 'modal-backdrop show';
      backdrop.innerHTML = '<div class="modal"><header><h3 id="mTitle"></h3><button class="close" data-close>&times;</button></header><div class="body" id="mBody"></div></div>';
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop || e.target.dataset.close !== undefined) closeModal(); });
    }
    backdrop.classList.add('show');
    document.getElementById('mTitle').textContent = title;
    document.getElementById('mBody').innerHTML = bodyHtml;
  }
  function closeModal() { document.getElementById('adminModal')?.classList.remove('show'); }

  loadLayers();
  loadUsers();
})();
