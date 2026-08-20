/**
 * API client utility for making authenticated requests from the public site.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

export interface ApiError {
  message: string;
  statusCode?: number;
}

export class ApiClient {
  private baseUrl: string;
  private surfaceHeader: string;

  constructor(baseUrl: string = API_BASE_URL, surfaceHeader: string = 'customer') {
    this.baseUrl = baseUrl;
    this.surfaceHeader = surfaceHeader;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-App-Surface': this.surfaceHeader,
        ...options.headers,
      },
      credentials: 'include',
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      const error: ApiError = {
        message: response.statusText,
        statusCode: response.status,
      };

      try {
        const data = await response.json();
        error.message = data.message || data.error || response.statusText;
      } catch {
        // If response is not JSON, keep statusText
      }

      throw error;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }
}

export const apiClient = new ApiClient();
