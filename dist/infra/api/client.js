import axios from "axios";
import PQueue from "p-queue";
export class ApiClient {
    baseUrl;
    sessionStore;
    http;
    queue = new PQueue({ concurrency: 3, interval: 1000, intervalCap: 3 });
    constructor(baseUrl, sessionStore) {
        this.baseUrl = baseUrl;
        this.sessionStore = sessionStore;
        this.http = axios.create({
            baseURL: baseUrl,
            timeout: 15000
        });
    }
    async get(endpoint, params = {}) {
        return this.queue.add(async () => {
            const cookie = this.sessionStore.getSession().cookie;
            const merged = { ...params, timestamp: Date.now(), cookie };
            const { data } = await this.http.get(endpoint, { params: merged });
            return data;
        });
    }
    async post(endpoint, params = {}) {
        return this.queue.add(async () => {
            const cookie = this.sessionStore.getSession().cookie;
            const merged = { ...params, timestamp: Date.now(), cookie };
            const { data } = await this.http.post(endpoint, null, { params: merged });
            return data;
        });
    }
}
//# sourceMappingURL=client.js.map