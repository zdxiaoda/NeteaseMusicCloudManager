import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CloudSong, LocalSong } from "../../core/types.js";

interface CacheState {
  cloudSongs: CloudSong[];
  localSongs: LocalSong[];
  meta: Record<string, string>;
}

export class CacheRepo {
  private readonly cacheFilePath: string;
  private state: CacheState;

  constructor() {
    const cacheDir = path.join(os.homedir(), ".ncm-cloud-manager");
    fs.mkdirSync(cacheDir, { recursive: true });
    this.cacheFilePath = path.join(cacheDir, "cache.json");
    this.state = this.loadState();
  }

  private loadState(): CacheState {
    if (!fs.existsSync(this.cacheFilePath)) {
      return { cloudSongs: [], localSongs: [], meta: {} };
    }
    try {
      const raw = fs.readFileSync(this.cacheFilePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<CacheState>;
      return {
        cloudSongs: Array.isArray(parsed.cloudSongs) ? parsed.cloudSongs : [],
        localSongs: Array.isArray(parsed.localSongs) ? parsed.localSongs : [],
        meta: parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {}
      };
    } catch {
      return { cloudSongs: [], localSongs: [], meta: {} };
    }
  }

  private saveState(): void {
    fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.state, null, 2), "utf-8");
  }

  replaceCloudSongs(songs: CloudSong[]): void {
    this.state.cloudSongs = [...songs];
    this.saveState();
  }

  getCloudSongs(): CloudSong[] {
    return [...this.state.cloudSongs];
  }

  replaceLocalSongs(songs: LocalSong[]): void {
    this.state.localSongs = [...songs];
    this.saveState();
  }

  getLocalSongs(): LocalSong[] {
    return [...this.state.localSongs];
  }

  setMeta(key: string, value: string): void {
    this.state.meta[key] = value;
    this.saveState();
  }

  getMeta(key: string): string | undefined {
    return this.state.meta[key];
  }
}
