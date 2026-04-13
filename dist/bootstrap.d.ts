import { AuthService } from "./core/auth/auth-service.js";
import { CloudService } from "./core/cloud/cloud-service.js";
import { LocalScanner } from "./core/local/local-scanner.js";
import { DiffSyncService } from "./core/sync/diff-sync-service.js";
import { ApiClient } from "./infra/api/client.js";
import { SessionStore } from "./infra/config/session-store.js";
import { CacheRepo } from "./infra/db/cache-repo.js";
export declare function createApp(baseUrl: string): {
    sessionStore: SessionStore;
    cacheRepo: CacheRepo;
    apiClient: ApiClient;
    authService: AuthService;
    cloudService: CloudService;
    localScanner: LocalScanner;
    diffSyncService: DiffSyncService;
};
//# sourceMappingURL=bootstrap.d.ts.map