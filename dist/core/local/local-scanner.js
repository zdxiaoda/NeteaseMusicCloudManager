import fg from "fast-glob";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { parseFile } from "music-metadata";
const MUSIC_EXTENSIONS = ["mp3", "flac", "wav", "m4a", "ogg", "aac"];
export class LocalScanner {
    cacheRepo;
    constructor(cacheRepo) {
        this.cacheRepo = cacheRepo;
    }
    async scan(folder) {
        const patterns = MUSIC_EXTENSIONS.map((ext) => `**/*.${ext}`);
        const files = await fg(patterns, {
            cwd: folder,
            onlyFiles: true,
            absolute: true,
            caseSensitiveMatch: false
        });
        const songs = [];
        for (const filePath of files) {
            const stat = fs.statSync(filePath);
            const metadata = await parseFile(filePath).catch(() => undefined);
            songs.push({
                path: filePath,
                fileName: path.basename(filePath),
                title: metadata?.common.title || path.parse(filePath).name,
                artist: metadata?.common.artist || "未知歌手",
                album: metadata?.common.album || "未知专辑",
                durationMs: Math.round((metadata?.format.duration || 0) * 1000),
                size: stat.size,
                md5: await this.hashMd5(filePath)
            });
        }
        this.cacheRepo.replaceLocalSongs(songs);
        return songs;
    }
    hashMd5(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash("md5");
            const stream = fs.createReadStream(filePath);
            stream.on("data", (chunk) => hash.update(chunk));
            stream.on("end", () => resolve(hash.digest("hex")));
            stream.on("error", reject);
        });
    }
}
//# sourceMappingURL=local-scanner.js.map