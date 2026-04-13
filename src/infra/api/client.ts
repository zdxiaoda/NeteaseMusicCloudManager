import axios, { AxiosInstance } from "axios";
import PQueue from "p-queue";
import { SessionStore } from "../config/session-store.js";

type RequestParams = Record<string, string | number | boolean | undefined>;
interface RequestOptions {
  timeoutMs?: number;
}

export class ApiClient {
  private readonly http: AxiosInstance;
  private readonly queue = new PQueue({ concurrency: 3, interval: 1000, intervalCap: 3 });

  constructor(
    private readonly baseUrl: string,
    private readonly sessionStore: SessionStore
  ) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 15000
    });
  }

  async get<T>(endpoint: string, params: RequestParams = {}, options: RequestOptions = {}): Promise<T> {
    return this.queue.add(async () => {
      const cookie = this.sessionStore.getSession().cookie;
      const merged = { ...params, timestamp: Date.now(), cookie };
      try {
        const { data } = await this.http.get<T>(endpoint, {
          params: merged,
          timeout: options.timeoutMs
        });
        return data;
      } catch (error) {
        throw this.decorateRequestError("GET", endpoint, error);
      }
    });
  }

  async post<T>(endpoint: string, params: RequestParams = {}, options: RequestOptions = {}): Promise<T> {
    return this.queue.add(async () => {
      const cookie = this.sessionStore.getSession().cookie;
      const merged = { ...params, timestamp: Date.now(), cookie };
      try {
        const { data } = await this.http.post<T>(endpoint, null, {
          params: merged,
          timeout: options.timeoutMs
        });
        return data;
      } catch (error) {
        throw this.decorateRequestError("POST", endpoint, error);
      }
    });
  }

  async postMultipart<T>(
    endpoint: string,
    formData: FormData,
    params: RequestParams = {},
    options: RequestOptions = {}
  ): Promise<T> {
    return this.queue.add(async () => {
      const cookie = this.sessionStore.getSession().cookie;
      const merged = { ...params, timestamp: Date.now(), cookie };
      try {
        const { data } = await this.http.post<T>(endpoint, formData, {
          params: merged,
          timeout: options.timeoutMs
        });
        return data;
      } catch (error) {
        throw this.decorateRequestError("POST(multipart)", endpoint, error);
      }
    });
  }

  private decorateRequestError(method: string, endpoint: string, error: unknown): Error {
    const e = error as Error & { response?: { status?: number; statusText?: string } };
    const status = e.response?.status;
    const statusText = e.response?.statusText;
    const statusPart = status ? `HTTP ${status}${statusText ? ` ${statusText}` : ""}` : "network error";
    return new Error(`${method} ${endpoint} failed: ${statusPart}`);
  }
}
