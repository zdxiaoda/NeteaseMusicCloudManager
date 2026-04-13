import fs from "node:fs";
import path from "node:path";
export class CloudService {
    apiClient;
    cacheRepo;
    sessionStore;
    constructor(apiClient, cacheRepo, sessionStore) {
        this.apiClient = apiClient;
        this.cacheRepo = cacheRepo;
        this.sessionStore = sessionStore;
    }
    async getCloudSongs(forceRefresh = false) {
        const now = Date.now();
        const lastUpdate = this.sessionStore.getCloudCacheUpdatedAt();
        const stale = now - lastUpdate > 24 * 60 * 60 * 1000;
        if (!forceRefresh && !stale) {
            const cached = this.cacheRepo.getCloudSongs();
            if (cached.length > 0)
                return cached;
        }
        const songs = await this.fetchAllCloudSongs();
        this.cacheRepo.replaceCloudSongs(songs);
        this.sessionStore.setCloudCacheUpdatedAt(now);
        return songs;
    }
    async deleteCloudSongs(cloudIds) {
        if (!cloudIds.length)
            return;
        await this.apiClient.post("/user/cloud/del", { id: JSON.stringify(cloudIds) });
        await this.getCloudSongs(true);
    }
    async uploadSong(filePath) {
        const stat = fs.statSync(filePath);
        const fileName = path.basename(filePath);
        await this.apiClient.post("/cloud", {
            songFile: filePath,
            filename: fileName,
            songid: 0,
            size: stat.size
        });
    }
    async matchSong(cloudId, songId) {
        await this.apiClient.get("/cloud/match", { sid: cloudId, asid: songId });
    }
    async fetchAllCloudSongs() {
        const all = [];
        let offset = 0;
        const limit = 200;
        let hasMore = true;
        while (hasMore) {
            const response = await this.apiClient.get("/user/cloud", { limit, offset });
            const page = response.data.map((item) => ({
                cloudId: item.id,
                songId: item.songId ?? item.simpleSong?.id,
                fileName: item.fileName,
                simpleSongName: item.simpleSong?.name ?? item.songName,
                artist: item.artist ?? item.simpleSong?.ar?.[0]?.name ?? "未知歌手",
                album: item.album ?? item.simpleSong?.al?.name ?? "未知专辑",
                durationMs: item.simpleSong?.dt ?? 0,
                addTime: item.addTime,
                fileSize: item.fileSize,
                md5: item.md5
            }));
            all.push(...page);
            hasMore = response.hasMore;
            offset += limit;
        }
        return all;
    }
}
//# sourceMappingURL=cloud-service.js.map