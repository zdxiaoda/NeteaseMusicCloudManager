import fs from "node:fs";
import stringSimilarity from "string-similarity";
import { CloudService } from "../cloud/cloud-service.js";
import { CacheRepo } from "../../infra/db/cache-repo.js";
import { DiffResult, LocalSong, CloudSong, BatchTaskSummary, BatchTaskFailure } from "../types.js";

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

  async syncCloudSideWithReport(
    diff: DiffResult,
    onProgress?: (phase: string, summary: BatchTaskSummary, message?: string) => void
  ): Promise<BatchTaskSummary> {
    const deleted = await this.runBatch(
      "delete-cloud-only",
      diff.cloudOnly,
      async (cloud) => this.cloudService.deleteCloudSongs([cloud.cloudId]),
      2,
      onProgress
    );
    const uploaded = await this.runBatch(
      "upload-local-only",
      diff.localOnly,
      async (local) => this.cloudService.uploadSong(local.path),
      2,
      onProgress
    );
    await this.cloudService.getCloudSongs(true);
    return this.mergeSummary(deleted, uploaded);
  }

  async syncLocalSide(
    diff: DiffResult,
    options: { deleteLocalOnly?: boolean; downloadCloudOnly?: boolean; downloadDir?: string } = {},
    onProgress?: (phase: string, summary: BatchTaskSummary, message?: string) => void
  ): Promise<{ deletedLocal: number; cloudOnlyPending: number; downloadSummary?: BatchTaskSummary }> {
    const deleteLocalOnly = Boolean(options.deleteLocalOnly);
    const downloadCloudOnly = Boolean(options.downloadCloudOnly);
    let deletedLocal = 0;
    const failures: BatchTaskFailure[] = [];
    if (deleteLocalOnly) {
      const deletedSummary = await this.runBatch(
        "delete-local-only",
        diff.localOnly,
        async (local) => {
          if (fs.existsSync(local.path)) fs.unlinkSync(local.path);
        },
        2,
        onProgress
      );
      deletedLocal = deletedSummary.success;
      failures.push(...deletedSummary.failures);
    }

    let downloadSummary: BatchTaskSummary | undefined;
    if (downloadCloudOnly) {
      const downloadDir = options.downloadDir || process.cwd();
      downloadSummary = await this.runBatch(
        "download-cloud-only",
        diff.cloudOnly,
        async (cloud) => {
          await this.cloudService.downloadCloudSong(cloud, downloadDir);
        },
        3,
        onProgress
      );
      failures.push(...downloadSummary.failures);
    }

    this.cacheRepo.setMeta("cloud_only_pending_download", String(diff.cloudOnly.length));
    this.cacheRepo.setMeta("last_sync_local_failures", JSON.stringify(failures));
    return { deletedLocal, cloudOnlyPending: diff.cloudOnly.length, downloadSummary };
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

  private async runBatch<T extends LocalSong | CloudSong>(
    phase: string,
    items: T[],
    worker: (item: T) => Promise<void>,
    maxAttempts: number,
    onProgress?: (phase: string, summary: BatchTaskSummary, message?: string) => void
  ): Promise<BatchTaskSummary> {
    const summary: BatchTaskSummary = {
      total: items.length,
      success: 0,
      failed: 0,
      failures: []
    };
    for (const item of items) {
      let success = false;
      let attempts = 0;
      while (!success && attempts < maxAttempts) {
        attempts += 1;
        try {
          await worker(item);
          success = true;
          summary.success += 1;
          onProgress?.(phase, summary, `${this.itemName(item)} 成功 (${attempts}/${maxAttempts})`);
        } catch (error) {
          if (attempts < maxAttempts) {
            onProgress?.(phase, summary, `${this.itemName(item)} 重试 (${attempts}/${maxAttempts})`);
            await this.sleep(500 * attempts);
            continue;
          }
          const reason = (error as Error).message;
          summary.failed += 1;
          summary.failures.push({
            id: this.itemId(item),
            name: this.itemName(item),
            reason,
            attempts
          });
          onProgress?.(phase, summary, `${this.itemName(item)} 失败: ${reason}`);
        }
      }
    }
    return summary;
  }

  private mergeSummary(a: BatchTaskSummary, b: BatchTaskSummary): BatchTaskSummary {
    return {
      total: a.total + b.total,
      success: a.success + b.success,
      failed: a.failed + b.failed,
      failures: [...a.failures, ...b.failures]
    };
  }

  private itemName(item: LocalSong | CloudSong): string {
    return "title" in item ? item.fileName : item.fileName;
  }

  private itemId(item: LocalSong | CloudSong): string {
    return "title" in item ? item.path : String(item.cloudId);
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
