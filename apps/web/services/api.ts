const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
type ApiResponse<T> = { success: boolean; message: string; data: T };

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    const refreshToken =
      typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
    if (refreshToken) {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const refreshRes = await fetch(`${baseUrl}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          const refreshBody = (await refreshRes.json()) as ApiResponse<{ accessToken: string }>;
          if (refreshRes.ok && refreshBody.data?.accessToken) {
            const newAccessToken = refreshBody.data.accessToken;
            localStorage.setItem('accessToken', newAccessToken);
            isRefreshing = false;
            onRefreshed(newAccessToken);
          } else {
            throw new Error('Refresh failed');
          }
        } catch (err) {
          isRefreshing = false;
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          if (typeof window !== 'undefined') {
            window.location.href = '/login';
          }
          throw err;
        }
      }

      return new Promise<T>((resolve, reject) => {
        subscribeTokenRefresh((newToken) => {
          const retryInit = {
            ...init,
            headers: {
              ...init.headers,
              Authorization: `Bearer ${newToken}`,
            },
          };
          api<T>(path, retryInit).then(resolve).catch(reject);
        });
      });
    }
  }

  const body = (await response.json()) as ApiResponse<T>;
  if (!response.ok) throw new Error(body.message);
  return body.data;
}
