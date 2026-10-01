/**
 * Centralized Typed API Client for Municipal Monitoring Subsystem
 * Strictly integrates with verified Fastify backend contracts
 */

export interface ApiErrorResponse {
  error: string;
  message: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  public status: number;
  public errorCode: string;
  public details?: unknown;

  constructor(status: number, errorCode: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

export class ApiClient {
  private baseUrl: string;
  private tokenGetter?: () => string | null;
  private onUnauthorized?: () => void;

  constructor(options?: {
    baseUrl?: string;
    tokenGetter?: () => string | null;
    onUnauthorized?: () => void;
  }) {
    const envBaseUrl = typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_BASE_URL
      ? String((import.meta as any).env.VITE_API_BASE_URL).replace(/\/+$/, '')
      : null;
    this.baseUrl = options?.baseUrl || envBaseUrl || '/api/v1';
    this.tokenGetter = options?.tokenGetter || (() => {
      try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('municipal_session') : null;
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.token || null;
      } catch {
        return null;
      }
    });
    this.onUnauthorized = options?.onUnauthorized;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getToken(): string | null {
    return this.tokenGetter ? this.tokenGetter() : null;
  }

  public setToken(token: string | null) {
    this.tokenGetter = () => token;
  }

  public setTokenGetter(getter: () => string | null) {
    this.tokenGetter = getter;
  }

  public setOnUnauthorized(handler: () => void) {
    this.onUnauthorized = handler;
  }

  private getHeaders(customHeaders?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders
    };

    if (this.tokenGetter) {
      const token = this.tokenGetter();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  public async request<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: unknown;
      headers?: Record<string, string>;
      timeoutMs?: number;
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, headers, timeoutMs = 15000 } = options;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = cleanEndpoint.startsWith(this.baseUrl) ? cleanEndpoint : `${this.baseUrl}${cleanEndpoint}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: this.getHeaders(headers),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timer);

      if (response.status === 401) {
        if (this.onUnauthorized) {
          this.onUnauthorized();
        }
        let errData: any = {};
        try {
          errData = await response.json();
        } catch {
          // Ignore
        }
        throw new ApiClientError(401, errData.error || 'UNAUTHORIZED', errData.message || 'Session expired or unauthorized.');
      }

      if (response.status === 403) {
        let errData: any = {};
        try {
          errData = await response.json();
        } catch {
          // Ignore
        }
        throw new ApiClientError(403, errData.error || 'FORBIDDEN', errData.message || 'Access denied by municipal RBAC policy.');
      }

      if (!response.ok) {
        let errData: any = {};
        try {
          errData = await response.json();
        } catch {
          // Ignore
        }
        throw new ApiClientError(
          response.status,
          errData.error || 'API_ERROR',
          errData.message || `Request failed with status ${response.status}`,
          errData.details
        );
      }

      return (await response.json()) as T;
    } catch (err: any) {
      clearTimeout(timer);
      if (err instanceof ApiClientError) {
        throw err;
      }
      if (err.name === 'AbortError') {
        throw new ApiClientError(408, 'TIMEOUT', 'Operational request timed out.');
      }
      throw new ApiClientError(0, 'NETWORK_ERROR', err.message || 'Network connection failure.');
    }
  }

  public get<T>(endpoint: string, options?: { headers?: Record<string, string>; timeoutMs?: number }): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', ...options });
  }

  public post<T>(endpoint: string, body?: unknown, options?: { headers?: Record<string, string>; timeoutMs?: number }): Promise<T> {
    return this.request<T>(endpoint, { method: 'POST', body, ...options });
  }

  public patch<T>(endpoint: string, body?: unknown, options?: { headers?: Record<string, string>; timeoutMs?: number }): Promise<T> {
    return this.request<T>(endpoint, { method: 'PATCH', body, ...options });
  }

  public put<T>(endpoint: string, body?: unknown, options?: { headers?: Record<string, string>; timeoutMs?: number }): Promise<T> {
    return this.request<T>(endpoint, { method: 'PUT', body, ...options });
  }

  public delete<T>(endpoint: string, options?: { headers?: Record<string, string>; timeoutMs?: number }): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', ...options });
  }
}

export const apiClient = new ApiClient();
