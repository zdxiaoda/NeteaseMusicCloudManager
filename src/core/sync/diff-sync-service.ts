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
    const matchedExact: DiffResult["matchedExact"] = [];
    const matchedFuzzy: DiffResult["matchedFuzzy"] = [];
    const matchedLocal = new Set<number>();
    const matchedCloud = new Set<number>();

    // Phase 1: parse "artist - title" from file name and match by parsed fields.
    const parsedMap = new Map<string, number[]>();
    for (let ci = 0; ci < cloudSongs.length; ci += 1) {
      const cloud = cloudSongs[ci];
      if (!cloud) continue;
      const parsed = this.parseArtistTitleFromFileName(cloud.fileName);
      if (!parsed) continue;
      const key = `${this.normalizeArtist(parsed.artist)}|${this.normalizeTitle(parsed.title)}`;
      const arr = parsedMap.get(key) || [];
      arr.push(ci);
      parsedMap.set(key, arr);
    }
    for (let li = 0; li < localSongs.length; li += 1) {
      const local = localSongs[li];
      if (!local) continue;
      const parsed = this.parseArtistTitleFromFileName(local.fileName);
      if (!parsed) continue;
      const key = `${this.normalizeArtist(parsed.artist)}|${this.normalizeTitle(parsed.title)}`;
      const cands = parsedMap.get(key) || [];
      const ci = cands.find((idx) => !matchedCloud.has(idx));
      if (ci === undefined) continue;
      const cloud = cloudSongs[ci];
      if (!cloud) continue;
      matchedLocal.add(li);
      matchedCloud.add(ci);
      matchedExact.push({ local, cloud });
    }

    // Phase 2: normalized full file name exact
    const cloudByFileName = new Map<string, number[]>();
    for (let ci = 0; ci < cloudSongs.length; ci += 1) {
      if (matchedCloud.has(ci)) continue;
      const cloud = cloudSongs[ci];
      if (!cloud) continue;
      const key = this.normalizeFileName(cloud.fileName);
      if (!key) continue;
      const arr = cloudByFileName.get(key) || [];
      arr.push(ci);
      cloudByFileName.set(key, arr);
    }
    for (let li = 0; li < localSongs.length; li += 1) {
      if (matchedLocal.has(li)) continue;
      const local = localSongs[li];
      if (!local) continue;
      const key = this.normalizeFileName(local.fileName);
      if (!key) continue;
      const cands = cloudByFileName.get(key) || [];
      const ci = cands.find((idx) => !matchedCloud.has(idx));
      if (ci === undefined) continue;
      const cloud = cloudSongs[ci];
      if (!cloud) continue;
      matchedLocal.add(li);
      matchedCloud.add(ci);
      matchedExact.push({ local, cloud });
    }

    // Phase 3: music tag match (title + artist + duration)
    const keyMap = new Map<string, number[]>();
    for (let ci = 0; ci < cloudSongs.length; ci += 1) {
      if (matchedCloud.has(ci)) continue;
      const cloud = cloudSongs[ci];
      if (!cloud) continue;
      const key = this.exactKey(cloud);
      const arr = keyMap.get(key) || [];
      arr.push(ci);
      keyMap.set(key, arr);
    }
    for (let li = 0; li < localSongs.length; li += 1) {
      if (matchedLocal.has(li)) continue;
      const local = localSongs[li];
      if (!local) continue;
      const key = this.exactKey(local);
      const cands = keyMap.get(key) || [];
      const ci = cands.find((idx) => !matchedCloud.has(idx));
      if (ci === undefined) continue;
      const cloud = cloudSongs[ci];
      if (!cloud) continue;
      matchedLocal.add(li);
      matchedCloud.add(ci);
      matchedExact.push({ local, cloud });
    }

    // Phase 4: title + duration(+-2s) tag fallback
    const titleDurationMap = new Map<string, number[]>();
    for (let ci = 0; ci < cloudSongs.length; ci += 1) {
      if (matchedCloud.has(ci)) continue;
      const cloud = cloudSongs[ci];
      if (!cloud) continue;
      const title = this.normalizeTitle(cloud.simpleSongName);
      const sec = Math.round(cloud.durationMs / 1000);
      for (let delta = -2; delta <= 2; delta += 1) {
        const key = `${title}|${sec + delta}`;
        const arr = titleDurationMap.get(key) || [];
        arr.push(ci);
        titleDurationMap.set(key, arr);
      }
    }
    for (let li = 0; li < localSongs.length; li += 1) {
      if (matchedLocal.has(li)) continue;
      const local = localSongs[li];
      if (!local) continue;
      const key = `${this.normalizeTitle(local.title)}|${Math.round(local.durationMs / 1000)}`;
      const cands = titleDurationMap.get(key) || [];
      const ci = cands.find((idx) => !matchedCloud.has(idx));
      if (ci === undefined) continue;
      const cloud = cloudSongs[ci];
      if (!cloud) continue;
      matchedLocal.add(li);
      matchedCloud.add(ci);
      matchedExact.push({ local, cloud });
    }

    // Phase 5: fuzzy global pairing as last resort
    const candidates: Array<{ li: number; ci: number; score: number }> = [];
    for (let li = 0; li < localSongs.length; li += 1) {
      if (matchedLocal.has(li)) continue;
      const local = localSongs[li];
      if (!local) continue;
      for (let ci = 0; ci < cloudSongs.length; ci += 1) {
        if (matchedCloud.has(ci)) continue;
        const cloud = cloudSongs[ci];
        if (!cloud) continue;
        const score = this.computeMatchScore(local, cloud);
        if (score >= 0.72) {
          candidates.push({ li, ci, score });
        }
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const cand of candidates) {
      if (matchedLocal.has(cand.li) || matchedCloud.has(cand.ci)) continue;
      const local = localSongs[cand.li];
      const cloud = cloudSongs[cand.ci];
      if (!local || !cloud) continue;
      matchedLocal.add(cand.li);
      matchedCloud.add(cand.ci);
      const durationDiff = Math.abs(local.durationMs - cloud.durationMs);
      const shouldUpgradeToExact = cand.score >= 0.97 && durationDiff <= 2000;
      if (shouldUpgradeToExact) {
        matchedExact.push({ local, cloud });
        continue;
      }
      matchedFuzzy.push({
        local,
        cloud,
        score: cand.score
      });
    }

    const localOnly = localSongs.filter((_, idx) => !matchedLocal.has(idx));
    const cloudOnly = cloudSongs.filter((_, idx) => !matchedCloud.has(idx));
    return { localOnly, cloudOnly, matchedExact, matchedFuzzy };
  }

  async syncCloudSide(diff: DiffResult): Promise<void> {
    if (diff.cloudOnly.length) {
      const deleteSongIds = diff.cloudOnly.map((x) => x.songId).filter((id): id is number => Boolean(id));
      await this.cloudService.deleteCloudSongs(deleteSongIds);
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
    const deleted: BatchTaskSummary = {
      total: 0,
      success: 0,
      failed: 0,
      failures: []
    };
    if (diff.cloudOnly.length) {
      for (const cloud of diff.cloudOnly) {
        deleted.total += 1;
        if (cloud.songId) continue;
        deleted.failed += 1;
        deleted.failures.push({
          id: String(cloud.cloudId),
          name: cloud.fileName,
          reason: "缺少 songId，无法调用 /user/cloud/del",
          attempts: 0
        });
      }
      const deleteIds = diff.cloudOnly.map((x) => x.songId).filter((id): id is number => Boolean(id));
      if (deleteIds.length) {
        await this.cloudService.deleteCloudSongs(deleteIds);
        const afterDelete = await this.cloudService.getCloudSongs(true);
        const stillExists = new Set(
          afterDelete
            .map((x) => x.songId)
            .filter((id): id is number => Boolean(id))
            .filter((id) => deleteIds.includes(id))
        );
        for (const cloud of diff.cloudOnly) {
          const songId = cloud.songId;
          if (!songId || !stillExists.has(songId)) continue;
          deleted.failures.push({
            id: String(songId),
            name: cloud.fileName,
            reason: "删除后复核仍存在",
            attempts: 1
          });
        }
      }
      deleted.failed = deleted.failures.length;
      deleted.success = deleted.total - deleted.failed;
      onProgress?.("delete-cloud-only", deleted, `删除完成，成功 ${deleted.success}，失败 ${deleted.failed}`);
    }

    const uploaded = await this.uploadLocalOnlyOnceWithVerification(diff.localOnly, onProgress);
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

  private exactKey(song: LocalSong | CloudSong): string {
    if ("title" in song) {
      return `${this.normalizeTitle(song.title)}|${this.normalizeArtist(song.artist)}|${Math.round(song.durationMs / 1000)}`;
    }
    return `${this.normalizeTitle(song.simpleSongName)}|${this.normalizeArtist(song.artist)}|${Math.round(song.durationMs / 1000)}`;
  }

  private computeMatchScore(local: LocalSong, cloud: CloudSong): number {
    const localTitle = this.normalizeTitle(local.title);
    const cloudTitle = this.normalizeTitle(cloud.simpleSongName);
    const titleScore = stringSimilarity.compareTwoStrings(localTitle, cloudTitle);

    const localArtist = this.normalizeArtist(local.artist);
    const cloudArtist = this.normalizeArtist(cloud.artist);
    const hasGenericArtist = cloudArtist.includes("variousartists") || localArtist.length === 0 || cloudArtist.length === 0;
    const artistScore = hasGenericArtist ? 0.65 : stringSimilarity.compareTwoStrings(localArtist, cloudArtist);

    // Prevent false positive for same-title but very different artists.
    if (!hasGenericArtist && titleScore >= 0.78 && artistScore < 0.32) {
      return 0;
    }

    const durationDiff = Math.abs(local.durationMs - cloud.durationMs);
    if (durationDiff > 10000) return 0;
    const durationScore = Math.max(0, 1 - durationDiff / 10000);

    const weightArtist = hasGenericArtist ? 0.05 : 0.20;
    const score = titleScore * 0.75 + artistScore * weightArtist + durationScore * (1 - 0.75 - weightArtist);
    return Number(score.toFixed(4));
  }

  private normalizeTitle(value: string): string {
    return this.normalizeCommon(value)
      .replace(/\(([^)]*(feat|ft|cover|ver|version|mix|live)[^)]*)\)/gi, " ")
      .replace(/\[([^\]]*(feat|ft|cover|ver|version|mix|live)[^\]]*)\]/gi, " ")
      .replace(/\b(feat|ft)\.?\b.*$/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeArtist(value: string): string {
    return this.normalizeCommon(value)
      .replace(/\b(feat|ft)\.?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeFileName(value: string): string {
    const noExt = value.replace(/\.[a-z0-9]{1,6}$/i, "");
    return this.normalizeCommon(noExt)
      .replace(/\b(feat|ft)\.?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private parseArtistTitleFromFileName(fileName: string): { artist: string; title: string } | undefined {
    const raw = fileName.replace(/\.[a-z0-9]{1,6}$/i, "").trim();
    // common separators: " - ", " – ", " — ", "_-_"
    const parts = raw.split(/\s[-–—]\s|_-_/);
    if (parts.length < 2) return undefined;
    const artist = parts[0]?.trim() || "";
    const title = parts.slice(1).join(" - ").trim();
    if (!artist || !title) return undefined;
    return { artist, title };
  }

  private normalizeCommon(value: string): string {
    return value
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[;；/&、,，+]+/g, " ")
      .replace(/['"`~!@#$%^*_=|\\:<>?，。！？【】「」『』（）()［］\[\]\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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

  private async uploadLocalOnlyOnceWithVerification(
    items: LocalSong[],
    onProgress?: (phase: string, summary: BatchTaskSummary, message?: string) => void
  ): Promise<BatchTaskSummary> {
    const summary: BatchTaskSummary = {
      total: items.length,
      success: 0,
      failed: 0,
      failures: []
    };
    const attemptErrors = new Map<string, string>();

    for (const local of items) {
      try {
        await this.cloudService.uploadSong(local.path);
      } catch (error) {
        attemptErrors.set(local.md5, (error as Error).message);
      }
      onProgress?.("upload-local-only", summary, `${local.fileName} 已提交上传`);
    }

    const cloudAfterUpload = await this.cloudService.getCloudSongs(true);
    const uploadedMd5 = new Set(cloudAfterUpload.map((x) => x.md5).filter((md5): md5 is string => Boolean(md5)));
    for (const local of items) {
      if (uploadedMd5.has(local.md5)) {
        summary.success += 1;
        continue;
      }
      summary.failed += 1;
      summary.failures.push({
        id: local.path,
        name: local.fileName,
        reason: attemptErrors.get(local.md5) || "上传后云端复核未找到该文件",
        attempts: 1
      });
    }
    onProgress?.("upload-local-only", summary, `上传完成，成功 ${summary.success}，失败 ${summary.failed}`);
    return summary;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
