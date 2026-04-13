import { ApiClient } from "../../infra/api/client.js";
import { CacheRepo } from "../../infra/db/cache-repo.js";
import { SessionStore } from "../../infra/config/session-store.js";
import { CloudSong } from "../types.js";
export declare class CloudService {
    private readonly apiClient;
    private readonly cacheRepo;
    private readonly sessionStore;
    constructor(apiClient: ApiClient, cacheRepo: CacheRepo, sessionStore: SessionStore);
    getCloudSongs(forceRefresh?: boolean): Promise<CloudSong[]>;
    deleteCloudSongs(cloudIds: number[]): Promise<void>;
    uploadSong(filePath: string): Promise<void>;
    matchSong(cloudId: number, songId: number): Promise<void>;
    private fetchAllCloudSongs;
}
//# sourceMappingURL=cloud-service.d.ts.map