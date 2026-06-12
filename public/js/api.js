const API = (() => {
  const base = '';

  async function request(path, options = {}) {
    const token = localStorage.getItem('token');
    const headers = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Error');
    }
    return res.json();
  }

  return {
    get: (p) => request(p),
    post: (p, body) => request(p, { method: 'POST', body: JSON.stringify(body) }),
    put: (p, body) => request(p, { method: 'PUT', body: JSON.stringify(body) }),
    del: (p) => request(p, { method: 'DELETE' }),
    upload: (p, formData) => request(p, { method: 'POST', body: formData }),
  };
})();
