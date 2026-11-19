const request = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let data: any = {};
  if (raw) {
    try { data = JSON.parse(raw); }
    catch { data = { error: raw.slice(0, 500) }; }
  }

  if (!response.ok) {
    const message = data?.error || data?.message ||
      (raw ? 'Server returned HTTP ' + response.status + ': ' + raw.slice(0, 300) :
        'Server returned HTTP ' + response.status + '.');
    const error = new Error(message) as Error & { data?: unknown; status?: number };
    error.data = data;
    error.status = response.status;
    throw error;
  }
  return { data };
};

export const api = {
  get: (path: string) => request('GET', path),
  post: (path: string, body?: unknown) => request('POST', path, body),
  put: (path: string, body?: unknown) => request('PUT', path, body),
};

export const auth = {
  getUser: async () => {
    try {
      const result = await api.get('/api/staff/me');
      return (result.data as any)?.user ?? null;
    } catch {
      return null;
    }
  },
  signIn: async (email: string, password: string) => {
    const result = await api.post('/api/auth/login', { email, password });
    return (result.data as any)?.user ?? null;
  },
  signOut: async () => {
    await api.post('/api/auth/logout');
  },
};
