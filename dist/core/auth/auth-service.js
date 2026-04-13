export class AuthService {
    apiClient;
    sessionStore;
    constructor(apiClient, sessionStore) {
        this.apiClient = apiClient;
        this.sessionStore = sessionStore;
    }
    async ensureLogin() {
        const session = this.sessionStore.getSession();
        if (!session.cookie)
            return false;
        const status = await this.apiClient.get("/login/status");
        if (status?.data?.profile?.userId || status?.profile?.userId) {
            return true;
        }
        await this.apiClient.get("/login/refresh");
        const afterRefresh = await this.apiClient.get("/login/status");
        return Boolean(afterRefresh?.data?.profile?.userId || afterRefresh?.profile?.userId);
    }
    async loginByPhone(phone, password) {
        const result = await this.apiClient.post("/login/cellphone", { phone, password });
        this.persistSession(result.cookie, "phone");
    }
    async loginByEmail(email, password) {
        const result = await this.apiClient.post("/login", { email, password });
        this.persistSession(result.cookie, "email");
    }
    async createQr() {
        const keyResult = await this.apiClient.get("/login/qr/key");
        const key = keyResult.data.unikey;
        const qr = await this.apiClient.get("/login/qr/create", {
            key,
            qrimg: true
        });
        return { qrimg: qr.data.qrimg, key };
    }
    async waitQrLogin(key, timeoutMs = 120000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const result = await this.apiClient.get("/login/qr/check", { key });
            if (result.code === 803) {
                this.persistSession(result.cookie, "qr");
                return true;
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        return false;
    }
    logout() {
        this.sessionStore.clearSession();
    }
    persistSession(cookie, method) {
        if (!cookie) {
            throw new Error("登录成功但未收到 cookie，无法保存会话。");
        }
        this.sessionStore.setSession({
            cookie,
            loginMethod: method,
            lastLoginAt: Date.now()
        });
    }
}
//# sourceMappingURL=auth-service.js.map