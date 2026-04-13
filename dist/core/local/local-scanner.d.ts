import { CacheRepo } from "../../infra/db/cache-repo.js";
import { LocalSong } from "../types.js";
export declare class LocalScanner {
    private readonly cacheRepo;
    constructor(cacheRepo: CacheRepo);
    scan(folder: string): Promise<LocalSong[]>;
    private hashMd5;
}
//# sourceMappingURL=local-scanner.d.ts.map