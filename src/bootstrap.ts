import { AuthService } from "./core/auth/auth-service.js";
import { CloudService } from "./core/cloud/cloud-service.js";
import { LocalScanner } from "./core/local/local-scanner.js";
import { DiffSyncService } from "./core/sync/diff-sync-service.js";
import { ApiClient } from "./infra/api/client.js";
import { SessionStore } from "./infra/config/session-store.js";
import { CacheRepo } from "./infra/db/cache-repo.js";

export function createApp(baseUrl: string) {
  const sessionStore = new SessionStore();
  const cacheRepo = new CacheRepo();
  const apiClient = new ApiClient(baseUrl, sessionStore);
  const authService = new AuthService(apiClient, sessionStore);
  const cloudService = new CloudService(apiClient, cacheRepo, sessionStore);
  const localScanner = new LocalScanner(cacheRepo);
  const diffSyncService = new DiffSyncService(cloudService, cacheRepo);

  return {
    sessionStore,
    cacheRepo,
    apiClient,
    authService,
    cloudService,
    localScanner,
    diffSyncService
  };
}
