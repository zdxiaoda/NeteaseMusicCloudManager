import fs from "node:fs";
import stringSimilarity from "string-similarity";
export class DiffSyncService {
    cloudService;
    cacheRepo;
    constructor(cloudService, cacheRepo) {
        this.cloudService = cloudService;
        this.cacheRepo = cacheRepo;
    }
    buildDiff(localSongs, cloudSongs) {
        const matchedExact = [];
        const matchedFuzzy = [];
        const matchedLocal = new Set();
        const matchedCloud = new Set();
        // Phase 1: parse "artist - title" from file name and match by parsed fields.
        const parsedMap = new Map();
        for (let ci = 0; ci < cloudSongs.length; ci += 1) {
            const cloud = cloudSongs[ci];
            if (!cloud)
                continue;
            const parsed = this.parseArtistTitleFromFileName(cloud.fileName);
            if (!parsed)
                continue;
            const key = `${this.normalizeArtist(parsed.artist)}|${this.normalizeTitle(parsed.title)}`;
            const arr = parsedMap.get(key) || [];
            arr.push(ci);
            parsedMap.set(key, arr);
        }
        for (let li = 0; li < localSongs.length; li += 1) {
            const local = localSongs[li];
            if (!local)
                continue;
            const parsed = this.parseArtistTitleFromFileName(local.fileName);
            if (!parsed)
                continue;
            const key = `${this.normalizeArtist(parsed.artist)}|${this.normalizeTitle(parsed.title)}`;
            const cands = parsedMap.get(key) || [];
            const ci = cands.find((idx) => !matchedCloud.has(idx));
            if (ci === undefined)
                continue;
            const cloud = cloudSongs[ci];
            if (!cloud)
                continue;
            matchedLocal.add(li);
            matchedCloud.add(ci);
            matchedExact.push({ local, cloud });
        }
        // Phase 2: normalized full file name exact
        const cloudByFileName = new Map();
        for (let ci = 0; ci < cloudSongs.length; ci += 1) {
            if (matchedCloud.has(ci))
                continue;
            const cloud = cloudSongs[ci];
            if (!cloud)
                continue;
            const key = this.normalizeFileName(cloud.fileName);
            if (!key)
                continue;
            const arr = cloudByFileName.get(key) || [];
            arr.push(ci);
            cloudByFileName.set(key, arr);
        }
        for (let li = 0; li < localSongs.length; li += 1) {
            if (matchedLocal.has(li))
                continue;
            const local = localSongs[li];
            if (!local)
                continue;
            const key = this.normalizeFileName(local.fileName);
            if (!key)
                continue;
            const cands = cloudByFileName.get(key) || [];
            const ci = cands.find((idx) => !matchedCloud.has(idx));
            if (ci === undefined)
                continue;
            const cloud = cloudSongs[ci];
            if (!cloud)
                continue;
            matchedLocal.add(li);
            matchedCloud.add(ci);
            matchedExact.push({ local, cloud });
        }
        // Phase 3: music tag match (title + artist + duration)
        const keyMap = new Map();
        for (let ci = 0; ci < cloudSongs.length; ci += 1) {
            if (matchedCloud.has(ci))
                continue;
            const cloud = cloudSongs[ci];
            if (!cloud)
                continue;
            const key = this.exactKey(cloud);
            const arr = keyMap.get(key) || [];
            arr.push(ci);
            keyMap.set(key, arr);
        }
        for (let li = 0; li < localSongs.length; li += 1) {
            if (matchedLocal.has(li))
                continue;
            const local = localSongs[li];
            if (!local)
                continue;
            const key = this.exactKey(local);
            const cands = keyMap.get(key) || [];
            const ci = cands.find((idx) => !matchedCloud.has(idx));
            if (ci === undefined)
                continue;
            const cloud = cloudSongs[ci];
            if (!cloud)
                continue;
            matchedLocal.add(li);
            matchedCloud.add(ci);
            matchedExact.push({ local, cloud });
        }
        // Phase 4: title + duration(+-2s) tag fallback
        const titleDurationMap = new Map();
        for (let ci = 0; ci < cloudSongs.length; ci += 1) {
            if (matchedCloud.has(ci))
                continue;
            const cloud = cloudSongs[ci];
            if (!cloud)
                continue;
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
            if (matchedLocal.has(li))
                continue;
            const local = localSongs[li];
            if (!local)
                continue;
            const key = `${this.normalizeTitle(local.title)}|${Math.round(local.durationMs / 1000)}`;
            const cands = titleDurationMap.get(key) || [];
            const ci = cands.find((idx) => !matchedCloud.has(idx));
            if (ci === undefined)
                continue;
            const cloud = cloudSongs[ci];
            if (!cloud)
                continue;
            matchedLocal.add(li);
            matchedCloud.add(ci);
            matchedExact.push({ local, cloud });
        }
        // Phase 5: fuzzy global pairing as last resort
        const candidates = [];
        for (let li = 0; li < localSongs.length; li += 1) {
            if (matchedLocal.has(li))
                continue;
            const local = localSongs[li];
            if (!local)
                continue;
            for (let ci = 0; ci < cloudSongs.length; ci += 1) {
                if (matchedCloud.has(ci))
                    continue;
                const cloud = cloudSongs[ci];
                if (!cloud)
                    continue;
                const score = this.computeMatchScore(local, cloud);
                if (score >= 0.72) {
                    candidates.push({ li, ci, score });
                }
            }
        }
        candidates.sort((a, b) => b.score - a.score);
        for (const cand of candidates) {
            if (matchedLocal.has(cand.li) || matchedCloud.has(cand.ci))
                continue;
            const local = localSongs[cand.li];
            const cloud = cloudSongs[cand.ci];
            if (!local || !cloud)
                continue;
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
    async syncCloudSide(diff) {
        if (diff.cloudOnly.length) {
            await this.cloudService.deleteCloudSongs(diff.cloudOnly.map((x) => x.cloudId));
        }
        for (const local of diff.localOnly) {
            await this.cloudService.uploadSong(local.path);
        }
        await this.cloudService.getCloudSongs(true);
    }
    async syncCloudSideWithReport(diff, onProgress) {
        const deleted = await this.runBatch("delete-cloud-only", diff.cloudOnly, async (cloud) => this.cloudService.deleteCloudSongs([cloud.cloudId]), 2, onProgress);
        const uploaded = await this.runBatch("upload-local-only", diff.localOnly, async (local) => this.cloudService.uploadSong(local.path), 2, onProgress);
        await this.cloudService.getCloudSongs(true);
        return this.mergeSummary(deleted, uploaded);
    }
    async syncLocalSide(diff, options = {}, onProgress) {
        const deleteLocalOnly = Boolean(options.deleteLocalOnly);
        const downloadCloudOnly = Boolean(options.downloadCloudOnly);
        let deletedLocal = 0;
        const failures = [];
        if (deleteLocalOnly) {
            const deletedSummary = await this.runBatch("delete-local-only", diff.localOnly, async (local) => {
                if (fs.existsSync(local.path))
                    fs.unlinkSync(local.path);
            }, 2, onProgress);
            deletedLocal = deletedSummary.success;
            failures.push(...deletedSummary.failures);
        }
        let downloadSummary;
        if (downloadCloudOnly) {
            const downloadDir = options.downloadDir || process.cwd();
            downloadSummary = await this.runBatch("download-cloud-only", diff.cloudOnly, async (cloud) => {
                await this.cloudService.downloadCloudSong(cloud, downloadDir);
            }, 3, onProgress);
            failures.push(...downloadSummary.failures);
        }
        this.cacheRepo.setMeta("cloud_only_pending_download", String(diff.cloudOnly.length));
        this.cacheRepo.setMeta("last_sync_local_failures", JSON.stringify(failures));
        return { deletedLocal, cloudOnlyPending: diff.cloudOnly.length, downloadSummary };
    }
    exactKey(song) {
        if ("title" in song) {
            return `${this.normalizeTitle(song.title)}|${this.normalizeArtist(song.artist)}|${Math.round(song.durationMs / 1000)}`;
        }
        return `${this.normalizeTitle(song.simpleSongName)}|${this.normalizeArtist(song.artist)}|${Math.round(song.durationMs / 1000)}`;
    }
    computeMatchScore(local, cloud) {
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
        if (durationDiff > 10000)
            return 0;
        const durationScore = Math.max(0, 1 - durationDiff / 10000);
        const weightArtist = hasGenericArtist ? 0.05 : 0.20;
        const score = titleScore * 0.75 + artistScore * weightArtist + durationScore * (1 - 0.75 - weightArtist);
        return Number(score.toFixed(4));
    }
    normalizeTitle(value) {
        return this.normalizeCommon(value)
            .replace(/\(([^)]*(feat|ft|cover|ver|version|mix|live)[^)]*)\)/gi, " ")
            .replace(/\[([^\]]*(feat|ft|cover|ver|version|mix|live)[^\]]*)\]/gi, " ")
            .replace(/\b(feat|ft)\.?\b.*$/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
    }
    normalizeArtist(value) {
        return this.normalizeCommon(value)
            .replace(/\b(feat|ft)\.?\b/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }
    normalizeFileName(value) {
        const noExt = value.replace(/\.[a-z0-9]{1,6}$/i, "");
        return this.normalizeCommon(noExt)
            .replace(/\b(feat|ft)\.?\b/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }
    parseArtistTitleFromFileName(fileName) {
        const raw = fileName.replace(/\.[a-z0-9]{1,6}$/i, "").trim();
        // common separators: " - ", " – ", " — ", "_-_"
        const parts = raw.split(/\s[-–—]\s|_-_/);
        if (parts.length < 2)
            return undefined;
        const artist = parts[0]?.trim() || "";
        const title = parts.slice(1).join(" - ").trim();
        if (!artist || !title)
            return undefined;
        return { artist, title };
    }
    normalizeCommon(value) {
        return value
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[;；/&、,，+]+/g, " ")
            .replace(/['"`~!@#$%^*_=|\\:<>?，。！？【】「」『』（）()［］\[\]\-]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }
    async runBatch(phase, items, worker, maxAttempts, onProgress) {
        const summary = {
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
                }
                catch (error) {
                    if (attempts < maxAttempts) {
                        onProgress?.(phase, summary, `${this.itemName(item)} 重试 (${attempts}/${maxAttempts})`);
                        await this.sleep(500 * attempts);
                        continue;
                    }
                    const reason = error.message;
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
    mergeSummary(a, b) {
        return {
            total: a.total + b.total,
            success: a.success + b.success,
            failed: a.failed + b.failed,
            failures: [...a.failures, ...b.failures]
        };
    }
    itemName(item) {
        return "title" in item ? item.fileName : item.fileName;
    }
    itemId(item) {
        return "title" in item ? item.path : String(item.cloudId);
    }
    async sleep(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
//# sourceMappingURL=diff-sync-service.js.map