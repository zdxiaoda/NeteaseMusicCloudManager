import fs from "node:fs";
import path from "node:path";
import { openAsBlob } from "node:fs";
import axios from "axios";
import { ApiClient } from "../../infra/api/client.js";
import { CacheRepo } from "../../infra/db/cache-repo.js";
import { SessionStore } from "../../infra/config/session-store.js";
import { CloudSong } from "../types.js";

interface CloudListResponse {
  data: Array<{
    privateCloud?: {
      id?: number;
    };
    pcId?: number;
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
    id?: number;
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
    void forceRefresh;
    const now = Date.now();
    const songs = await this.fetchAllCloudSongs();
    this.cacheRepo.replaceCloudSongs(songs);
    this.sessionStore.setCloudCacheUpdatedAt(now);
    return songs;
  }

  async deleteCloudSongs(cloudIds: number[]): Promise<void> {
    if (!cloudIds.length) return;
    const chunks = this.chunk(cloudIds, 100);
    for (const ids of chunks) {
      await this.deleteCloudSongsChunk(ids);
    }
  }

  async uploadSong(filePath: string): Promise<void> {
    const fileName = path.basename(filePath);
    const fileBlob = await openAsBlob(filePath);
    const form = new FormData();
    form.append("songFile", fileBlob, fileName);
    await this.apiClient.postMultipart("/cloud", form);
  }

  async matchSong(cloudId: number, songId: number): Promise<void> {
    const uid = this.sessionStore.getSession().userId;
    if (!uid) {
      throw new Error("当前会话缺少 uid，请重新登录后再执行云盘匹配");
    }
    await this.apiClient.get("/cloud/match", { uid, sid: cloudId, asid: songId });
  }

  async getSongDownloadUrl(songId: number): Promise<string> {
    const response = await this.apiClient.get<SongUrlResponse>("/song/url", { id: songId });
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
      const page: CloudSong[] = [];
      for (const item of response.data) {
        const cloudId = item.id ?? item.pcId ?? item.privateCloud?.id;
        if (!cloudId) continue;
        page.push({
          cloudId,
          songId: item.songId ?? item.simpleSong?.id,
          fileName: item.fileName,
          simpleSongName: item.simpleSong?.name ?? item.songName,
          artist: item.artist ?? item.simpleSong?.ar?.[0]?.name ?? "未知歌手",
          album: item.album ?? item.simpleSong?.al?.name ?? "未知专辑",
          durationMs: item.simpleSong?.dt ?? 0,
          addTime: item.addTime,
          fileSize: item.fileSize,
          md5: item.md5
        });
      }
      all.push(...page);
      hasMore = response.hasMore;
      offset += limit;
    }
    return all;
  }

  private sanitizeName(name: string): string {
    return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
  }

  private async deleteCloudSongsChunk(ids: number[]): Promise<void> {
    const id = ids.join(",");
    const attempts: string[] = [];
    const runners: Array<() => Promise<void>> = [
      () => this.apiClient.post("/user/cloud/del", { id }),
      () => this.apiClient.get("/user/cloud/del", { id }),
      () => this.apiClient.post("/cloud/del", { songId: id }),
      () => this.apiClient.get("/cloud/del", { songId: id }),
      () => this.apiClient.post("/cloud/del", { id }),
      () => this.apiClient.get("/cloud/del", { id })
    ];

    for (const run of runners) {
      try {
        await run();
        return;
      } catch (error) {
        const message = (error as Error).message || String(error);
        // Some API variants return HTTP 404 as a business response for non-deletable ids.
        // Do not abort the whole sync here; follow-up verification will report exact failures.
        if (message.includes("HTTP 404")) return;
        attempts.push(message);
      }
    }

    throw new Error(`云盘删除失败（已尝试多种接口）: ${attempts.join(" | ")}`);
  }

  private chunk(values: number[], size: number): number[][] {
    const result: number[][] = [];
    for (let i = 0; i < values.length; i += size) {
      result.push(values.slice(i, i + size));
    }
    return result;
  }
}
