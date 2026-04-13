import { SessionState } from "../../core/types.js";
export declare class SessionStore {
    private readonly conf;
    getSession(): SessionState;
    setSession(session: SessionState): void;
    clearSession(): void;
    getCloudCacheUpdatedAt(): number;
    setCloudCacheUpdatedAt(ts: number): void;
    getLocalScanPath(): string;
    setLocalScanPath(path: string): void;
}
//# sourceMappingURL=session-store.d.ts.map