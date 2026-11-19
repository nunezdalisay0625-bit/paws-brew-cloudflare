const request = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || 'Request failed') as Error & { data?: unknown };
    error.data = data;
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
    } catch { return null; }
  },
  signInWithRedirect: async () => {
    window.location.href = '/cdn-cgi/access/login?returnTo=' + encodeURIComponent(window.location.pathname + '#staff');
  },
  signOut: async () => {
    window.location.href = '/cdn-cgi/access/logout?returnTo=' + encodeURIComponent('/');
  },
};
