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
      const { data } = await this.http.get<T>(endpoint, {
        params: merged,
        timeout: options.timeoutMs
      });
      return data;
    });
  }

  async post<T>(endpoint: string, params: RequestParams = {}, options: RequestOptions = {}): Promise<T> {
    return this.queue.add(async () => {
      const cookie = this.sessionStore.getSession().cookie;
      const merged = { ...params, timestamp: Date.now(), cookie };
      const { data } = await this.http.post<T>(endpoint, null, {
        params: merged,
        timeout: options.timeoutMs
      });
      return data;
    });
  }
}
