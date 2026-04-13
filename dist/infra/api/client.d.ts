import { SessionStore } from "../config/session-store.js";
type RequestParams = Record<string, string | number | boolean | undefined>;
interface RequestOptions {
    timeoutMs?: number;
}
export declare class ApiClient {
    private readonly baseUrl;
    private readonly sessionStore;
    private readonly http;
    private readonly queue;
    constructor(baseUrl: string, sessionStore: SessionStore);
    get<T>(endpoint: string, params?: RequestParams, options?: RequestOptions): Promise<T>;
    post<T>(endpoint: string, params?: RequestParams, options?: RequestOptions): Promise<T>;
}
export {};
//# sourceMappingURL=client.d.ts.map