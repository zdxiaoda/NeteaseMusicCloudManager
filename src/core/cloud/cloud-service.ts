import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { ApiClient } from "../../infra/api/client.js";
import { CacheRepo } from "../../infra/db/cache-repo.js";
import { SessionStore } from "../../infra/config/session-store.js";
import { CloudSong } from "../types.js";

interface CloudListResponse {
  data: Array<{
    simpleSong: {
      name: string;
      ar?: Array<{ name: string }>;
      al?: { name: string };
      dt?: number;
      id?: number;
    };
    songId?: number;
    songName: string;
    fileName: string;
    addTime: number;
    fileSize: number;
    cover?: number;
    album?: string;
    artist?: string;
    lyricId?: string;
    bitrate?: number;
    md5?: string;
    songType?: number;
    id: number;
  }>;
  count: number;
  hasMore: boolean;
}

interface SongUrlResponse {
  data: Array<{ url?: string }>;
}

export class CloudService {
  constructor(
    private readonly apiClient: ApiClient,
    private readonly cacheRepo: CacheRepo,
    private readonly sessionStore: SessionStore
  ) {}

  async getCloudSongs(forceRefresh = false): Promise<CloudSong[]> {
    const now = Date.now();
    const lastUpdate = this.sessionStore.getCloudCacheUpdatedAt();
    const stale = now - lastUpdate > 24 * 60 * 60 * 1000;
    if (!forceRefresh && !stale) {
      const cached = this.cacheRepo.getCloudSongs();
      if (cached.length > 0) return cached;
    }

    const songs = await this.fetchAllCloudSongs();
    this.cacheRepo.replaceCloudSongs(songs);
    this.sessionStore.setCloudCacheUpdatedAt(now);
    return songs;
  }

  async deleteCloudSongs(cloudIds: number[]): Promise<void> {
    if (!cloudIds.length) return;
    await this.apiClient.post("/user/cloud/del", { id: JSON.stringify(cloudIds) });
    await this.getCloudSongs(true);
  }

  async uploadSong(filePath: string): Promise<void> {
    const stat = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    await this.apiClient.post("/cloud", {
      songFile: filePath,
      filename: fileName,
      songid: 0,
      size: stat.size
    });
  }

  async matchSong(cloudId: number, songId: number): Promise<void> {
    await this.apiClient.get("/cloud/match", { sid: cloudId, asid: songId });
  }

  async getSongDownloadUrl(songId: number): Promise<string> {
    const response = await this.apiClient.get<SongUrlResponse>("/song/url/v1", {
      id: songId,
      level: "exhigh"
    });
    const url = response.data?.[0]?.url;
    if (!url) {
      throw new Error(`未获取到 songId=${songId} 的下载地址`);
    }
    return url;
  }

  async downloadCloudSong(song: CloudSong, targetDir: string): Promise<string> {
    if (!song.songId) {
      throw new Error(`cloudId=${song.cloudId} 缺少 songId，无法下载`);
    }
    fs.mkdirSync(targetDir, { recursive: true });
    const url = await this.getSongDownloadUrl(song.songId);
    const safeName = this.sanitizeName(song.fileName || `${song.simpleSongName}.mp3`);
    const outputPath = path.join(targetDir, safeName);

    const response = await axios.get(url, { responseType: "stream", timeout: 60000 });
    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
    return outputPath;
  }

  private async fetchAllCloudSongs(): Promise<CloudSong[]> {
    const all: CloudSong[] = [];
    let offset = 0;
    const limit = 200;
    let hasMore = true;
    while (hasMore) {
      const response = await this.apiClient.get<CloudListResponse>("/user/cloud", { limit, offset });
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

  private sanitizeName(name: string): string {
    return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  }
}
