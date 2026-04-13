import { CloudSong, LocalSong } from "../../core/types.js";
export declare class CacheRepo {
    private readonly db;
    constructor();
    private initialize;
    replaceCloudSongs(songs: CloudSong[]): void;
    getCloudSongs(): CloudSong[];
    replaceLocalSongs(songs: LocalSong[]): void;
    getLocalSongs(): LocalSong[];
    setMeta(key: string, value: string): void;
    getMeta(key: string): string | undefined;
}
//# sourceMappingURL=cache-repo.d.ts.map