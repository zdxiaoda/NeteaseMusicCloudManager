import { CloudService } from "../cloud/cloud-service.js";
import { CacheRepo } from "../../infra/db/cache-repo.js";
import { DiffResult, LocalSong, CloudSong } from "../types.js";
export declare class DiffSyncService {
    private readonly cloudService;
    private readonly cacheRepo;
    constructor(cloudService: CloudService, cacheRepo: CacheRepo);
    buildDiff(localSongs: LocalSong[], cloudSongs: CloudSong[]): DiffResult;
    syncCloudSide(diff: DiffResult): Promise<void>;
    syncLocalSide(diff: DiffResult, deleteLocalOnly?: boolean): {
        deletedLocal: number;
        cloudOnlyPending: number;
    };
    private findFuzzy;
    private exactKey;
    private normalize;
}
//# sourceMappingURL=diff-sync-service.d.ts.map