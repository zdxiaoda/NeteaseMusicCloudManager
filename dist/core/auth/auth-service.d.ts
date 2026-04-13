import { ApiClient } from "../../infra/api/client.js";
import { SessionStore } from "../../infra/config/session-store.js";
export declare class AuthService {
    private readonly apiClient;
    private readonly sessionStore;
    constructor(apiClient: ApiClient, sessionStore: SessionStore);
    ensureLogin(): Promise<boolean>;
    loginByPhone(phone: string, password: string): Promise<void>;
    loginByEmail(email: string, password: string): Promise<void>;
    createQr(): Promise<{
        qrimg: string;
        key: string;
    }>;
    waitQrLogin(key: string, timeoutMs?: number): Promise<boolean>;
    logout(): void;
    private persistSession;
}
//# sourceMappingURL=auth-service.d.ts.map