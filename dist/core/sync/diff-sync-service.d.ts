import { CloudService } from "../cloud/cloud-service.js";
import { CacheRepo } from "../../infra/db/cache-repo.js";
import { DiffResult, LocalSong, CloudSong, BatchTaskSummary } from "../types.js";
export declare class DiffSyncService {
    private readonly cloudService;
    private readonly cacheRepo;
    constructor(cloudService: CloudService, cacheRepo: CacheRepo);
    buildDiff(localSongs: LocalSong[], cloudSongs: CloudSong[]): DiffResult;
    syncCloudSide(diff: DiffResult): Promise<void>;
    syncCloudSideWithReport(diff: DiffResult, onProgress?: (phase: string, summary: BatchTaskSummary, message?: string) => void): Promise<BatchTaskSummary>;
    syncLocalSide(diff: DiffResult, options?: {
        deleteLocalOnly?: boolean;
        downloadCloudOnly?: boolean;
        downloadDir?: string;
    }, onProgress?: (phase: string, summary: BatchTaskSummary, message?: string) => void): Promise<{
        deletedLocal: number;
        cloudOnlyPending: number;
        downloadSummary?: BatchTaskSummary;
    }>;
    private findFuzzy;
    private exactKey;
    private normalize;
    private runBatch;
    private mergeSummary;
    private itemName;
    private itemId;
    private sleep;
}
//# sourceMappingURL=diff-sync-service.d.ts.map