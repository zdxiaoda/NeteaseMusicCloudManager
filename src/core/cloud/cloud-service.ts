import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import axios from "axios";
import { parseFile } from "music-metadata";
import { ApiClient } from "../../infra/api/client.js";
import { CacheRepo } from "../../infra/db/cache-repo.js";
import { SessionStore } from "../../infra/config/session-store.js";
import { CloudSong, SearchSong } from "../types.js";

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

interface CloudSearchResponse {
  result?: {
    songs?: Array<{
      id: number;
      name: string;
      ar?: Array<{ name: string }>;
      al?: { name?: string };
      dt?: number;
    }>;
  };
}

interface UploadTokenResponse {
  code: number;
  msg?: string;
  data?: {
    needUpload: boolean;
    songId: string;
    uploadToken: string;
    uploadUrl: string;
    resourceId: string;
    md5?: string;
  };
}

interface UploadCompleteResponse {
  code: number;
  msg?: string;
}

interface UploadProgress {
  loaded: number;
  total: number;
  speedBps: number;
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

  async uploadSong(filePath: string, onProgress?: (progress: UploadProgress) => void): Promise<void> {
    const fileName = path.basename(filePath);
    const fallbackSongName = path.parse(fileName).name;
    const tagMeta = await this.readMediaMeta(filePath);
    const stat = fs.statSync(filePath);
    const md5 = await this.hashMd5(filePath);
    const tokenRes = await this.apiClient.postBody<UploadTokenResponse>("/cloud/upload/token", {
      md5,
      fileSize: stat.size,
      filename: fileName
    });
    if (tokenRes.code !== 200 || !tokenRes.data) {
      throw new Error(tokenRes.msg || "获取云盘上传凭证失败");
    }
    const tokenData = tokenRes.data;

    if (tokenData.needUpload) {
      let lastLoaded = 0;
      let lastAt = Date.now();
      let loaded = 0;
      const uploadStream = fs.createReadStream(filePath);
      uploadStream.on("data", (chunk: Buffer) => {
        loaded += chunk.length;
        const now = Date.now();
        const elapsedMs = Math.max(1, now - lastAt);
        const speedBps = ((loaded - lastLoaded) * 1000) / elapsedMs;
        lastLoaded = loaded;
        lastAt = now;
        onProgress?.({
          loaded,
          total: stat.size,
          speedBps: Math.max(0, speedBps)
        });
      });
      await axios({
        method: "post",
        url: tokenData.uploadUrl,
        headers: {
          "x-nos-token": tokenData.uploadToken,
          "Content-MD5": md5,
          "Content-Type": "audio/mpeg",
          "Content-Length": String(stat.size)
        },
        data: uploadStream,
        maxContentLength: Number.POSITIVE_INFINITY,
        maxBodyLength: Number.POSITIVE_INFINITY,
        timeout: 10 * 60 * 1000
      });
      onProgress?.({
        loaded: stat.size,
        total: stat.size,
        speedBps: 0
      });
    }

    const completeRes = await this.apiClient.postBody<UploadCompleteResponse>("/cloud/upload/complete", {
      songId: tokenData.songId,
      resourceId: tokenData.resourceId,
      md5: tokenData.md5 || md5,
      filename: fileName,
      song: tagMeta.song || fallbackSongName,
      artist: tagMeta.artist,
      album: tagMeta.album
    });
    if (completeRes.code !== 200) {
      throw new Error(completeRes.msg || "云盘导入失败");
    }
  }

  async matchSong(cloudId: number, songId: number): Promise<void> {
    const uid = this.sessionStore.getSession().userId;
    if (!uid) {
      throw new Error("当前会话缺少 uid，请重新登录后再执行云盘匹配");
    }
    await this.apiClient.get("/cloud/match", { uid, sid: cloudId, asid: songId });
  }

  async getUnmatchedCloudSongs(forceRefresh = false): Promise<CloudSong[]> {
    const songs = await this.getCloudSongs(forceRefresh);
    return songs.filter((song) => !song.songId || song.songId <= 0);
  }

  async searchCloudSongs(keywords: string, limit = 10): Promise<SearchSong[]> {
    const trimmed = keywords.trim();
    if (!trimmed) return [];
    const response = await this.apiClient.get<CloudSearchResponse>("/cloudsearch", {
      keywords: trimmed,
      type: 1,
      limit: Math.max(1, limit),
      offset: 0
    });
    return (response.result?.songs || [])
      .filter((item) => Boolean(item?.id))
      .map((item) => ({
        songId: item.id,
        name: item.name || "",
        artist: item.ar?.[0]?.name || "",
        album: item.al?.name || "",
        durationMs: item.dt || 0
      }));
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

  private hashMd5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("md5");
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  private async readMediaMeta(filePath: string): Promise<{ song?: string; artist?: string; album?: string }> {
    try {
      const metadata = await parseFile(filePath);
      const song = metadata.common.title?.trim();
      const artist = metadata.common.artist?.trim();
      const album = metadata.common.album?.trim();
      return {
        song: song || undefined,
        artist: artist || undefined,
        album: album || undefined
      };
    } catch {
      return {};
    }
  }
}
