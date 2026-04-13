import { CacheRepo } from "../../infra/db/cache-repo.js";
import { LocalSong } from "../types.js";
export declare class LocalScanner {
    private readonly cacheRepo;
    constructor(cacheRepo: CacheRepo);
    scan(folder: string, onProgress?: (progress: {
        current: number;
        total: number;
        filePath: string;
        scanned: number;
        skipped: number;
    }) => void): Promise<LocalSong[]>;
    private hashMd5;
}
//# sourceMappingURL=local-scanner.d.ts.map