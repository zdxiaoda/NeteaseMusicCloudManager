import { ApiClient } from "../../infra/api/client.js";
import { SessionStore } from "../../infra/config/session-store.js";
import { LoginMethod } from "../types.js";

interface ApiResponse {
  code: number;
  cookie?: string;
  data?: { profile?: { userId?: number } };
  profile?: { userId?: number };
}

export class AuthService {
  constructor(
    private readonly apiClient: ApiClient,
    private readonly sessionStore: SessionStore
  ) {}

  async ensureLogin(): Promise<boolean> {
    const session = this.sessionStore.getSession();
    if (!session.cookie) return false;

    const status = await this.apiClient.get<ApiResponse>("/login/status");
    if (status?.data?.profile?.userId || status?.profile?.userId) {
      return true;
    }

    await this.apiClient.get<ApiResponse>("/login/refresh");
    const afterRefresh = await this.apiClient.get<ApiResponse>("/login/status");
    return Boolean(afterRefresh?.data?.profile?.userId || afterRefresh?.profile?.userId);
  }

  async loginByPhone(phone: string, password: string): Promise<void> {
    const result = await this.apiClient.post<ApiResponse>("/login/cellphone", { phone, password });
    this.persistSession(result.cookie, "phone");
  }

  async loginByEmail(email: string, password: string): Promise<void> {
    const result = await this.apiClient.post<ApiResponse>("/login", { email, password });
    this.persistSession(result.cookie, "email");
  }

  async createQr(): Promise<{ qrimg: string; key: string }> {
    const keyResult = await this.apiClient.get<{ data: { unikey: string } }>("/login/qr/key");
    const key = keyResult.data.unikey;
    const qr = await this.apiClient.get<{ data: { qrimg: string } }>("/login/qr/create", {
      key,
      qrimg: true
    });
    return { qrimg: qr.data.qrimg, key };
  }

  async waitQrLogin(key: string, timeoutMs = 120000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.apiClient.get<ApiResponse>("/login/qr/check", { key });
      if (result.code === 803) {
        this.persistSession(result.cookie, "qr");
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return false;
  }

  logout(): void {
    this.sessionStore.clearSession();
  }

  private persistSession(cookie: string | undefined, method: LoginMethod): void {
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
