import { env } from '../../core/config/env.js';
import { AppError } from '../../core/errors/app-error.js';

export class AIGatewayService {
  private baseUrl: string;
  private serviceToken?: string;

  constructor() {
    this.baseUrl = env.AI_SERVICE_URL.replace(/\/+$/, '');
    this.serviceToken = env.PLATFORM_SERVICE_TOKEN;
  }

  async forwardRequest<T = any>(options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    userId?: string;
    tenantId?: string;
    requestId?: string;
    queryParams?: Record<string, string | number | undefined | null>;
    body?: unknown;
  }): Promise<T> {
    let url = `${this.baseUrl}${options.path.startsWith('/') ? '' : '/'}${options.path}`;
    if (options.queryParams) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(options.queryParams)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tenant-Id': options.tenantId || '00000000-0000-0000-0000-000000000001',
      'X-Request-Id': options.requestId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'req-' + Date.now()),
    };

    if (this.serviceToken) {
      headers['X-Service-Token'] = this.serviceToken;
      headers['Authorization'] = `Bearer ${this.serviceToken}`;
    }

    if (options.userId) {
      headers['X-User-Id'] = options.userId;
    }

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const responseText = await response.text();
      let responseJson: any = null;
      try {
        responseJson = JSON.parse(responseText);
      } catch {
        // Raw non-JSON response
      }

      if (!response.ok) {
        const errorDetail = responseJson?.detail || responseJson?.error || responseJson;
        const code = errorDetail?.code || `AI_SERVICE_${response.status}`;
        const message = errorDetail?.message || (typeof errorDetail === 'string' ? errorDetail : `AI Service returned status ${response.status}`);
        throw new AppError(response.status, code, message, errorDetail);
      }

      return responseJson?.data !== undefined ? responseJson.data : responseJson;
    } catch (error: any) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(502, 'AI_SERVICE_UNAVAILABLE', `Could not reach AI Service: ${error?.message || 'Network error'}`);
    }
  }
}

export const aiGatewayService = new AIGatewayService();
