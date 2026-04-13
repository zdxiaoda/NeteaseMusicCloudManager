import fs from "node:fs";
import stringSimilarity from "string-similarity";
import { CloudService } from "../cloud/cloud-service.js";
import { CacheRepo } from "../../infra/db/cache-repo.js";
import { DiffResult, LocalSong, CloudSong } from "../types.js";

export class DiffSyncService {
  constructor(
    private readonly cloudService: CloudService,
    private readonly cacheRepo: CacheRepo
  ) {}

  buildDiff(localSongs: LocalSong[], cloudSongs: CloudSong[]): DiffResult {
    const exactMap = new Map<string, CloudSong>();
    const cloudUnused = new Set(cloudSongs.map((x) => x.cloudId));
    for (const cloud of cloudSongs) {
      exactMap.set(this.exactKey(cloud), cloud);
    }

    const matchedExact: DiffResult["matchedExact"] = [];
    const matchedFuzzy: DiffResult["matchedFuzzy"] = [];
    const localOnly: LocalSong[] = [];

    for (const local of localSongs) {
      const exact = exactMap.get(this.exactKey(local));
      if (exact) {
        cloudUnused.delete(exact.cloudId);
        matchedExact.push({ local, cloud: exact });
        continue;
      }

      const fuzzyCandidate = this.findFuzzy(local, cloudSongs.filter((x) => cloudUnused.has(x.cloudId)));
      if (fuzzyCandidate && fuzzyCandidate.score >= 0.82) {
        cloudUnused.delete(fuzzyCandidate.cloud.cloudId);
        matchedFuzzy.push({ local, cloud: fuzzyCandidate.cloud, score: fuzzyCandidate.score });
      } else {
        localOnly.push(local);
      }
    }

    const cloudOnly = cloudSongs.filter((x) => cloudUnused.has(x.cloudId));
    return { localOnly, cloudOnly, matchedExact, matchedFuzzy };
  }

  async syncCloudSide(diff: DiffResult): Promise<void> {
    if (diff.cloudOnly.length) {
      await this.cloudService.deleteCloudSongs(diff.cloudOnly.map((x) => x.cloudId));
    }
    for (const local of diff.localOnly) {
      await this.cloudService.uploadSong(local.path);
    }
    await this.cloudService.getCloudSongs(true);
  }

  syncLocalSide(diff: DiffResult, deleteLocalOnly = false): { deletedLocal: number; cloudOnlyPending: number } {
    let deletedLocal = 0;
    if (deleteLocalOnly) {
      for (const local of diff.localOnly) {
        if (fs.existsSync(local.path)) {
          fs.unlinkSync(local.path);
          deletedLocal += 1;
        }
      }
    }
    this.cacheRepo.setMeta("cloud_only_pending_download", String(diff.cloudOnly.length));
    return { deletedLocal, cloudOnlyPending: diff.cloudOnly.length };
  }

  private findFuzzy(local: LocalSong, clouds: CloudSong[]): { cloud: CloudSong; score: number } | undefined {
    if (!clouds.length) return undefined;
    const source = `${this.normalize(local.title)} ${this.normalize(local.artist)}`;
    const candidates = clouds.map((cloud) => `${this.normalize(cloud.simpleSongName)} ${this.normalize(cloud.artist)}`);
    const best = stringSimilarity.findBestMatch(source, candidates).bestMatch;
    const index = candidates.indexOf(best.target);
    if (index < 0) return undefined;
    const cloud = clouds[index];
    if (!cloud) return undefined;
    return { cloud, score: best.rating };
  }

  private exactKey(song: LocalSong | CloudSong): string {
    if ("title" in song) {
      return `${this.normalize(song.title)}|${this.normalize(song.artist)}|${Math.round(song.durationMs / 1000)}|${song.md5 ?? ""}`;
    }
    return `${this.normalize(song.simpleSongName)}|${this.normalize(song.artist)}|${Math.round(song.durationMs / 1000)}|${song.md5 ?? ""}`;
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
  }
}
