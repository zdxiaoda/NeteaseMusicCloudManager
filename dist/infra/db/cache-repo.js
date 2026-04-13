import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
export class CacheRepo {
    db;
    constructor() {
        const dbDir = path.join(os.homedir(), ".ncm-cloud-manager");
        fs.mkdirSync(dbDir, { recursive: true });
        this.db = new Database(path.join(dbDir, "cache.db"));
        this.db.pragma("journal_mode = WAL");
        this.initialize();
    }
    initialize() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS cloud_songs (
        cloud_id INTEGER PRIMARY KEY,
        song_id INTEGER,
        file_name TEXT NOT NULL,
        simple_song_name TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        add_time INTEGER NOT NULL,
        file_size INTEGER NOT NULL,
        md5 TEXT
      );
      CREATE TABLE IF NOT EXISTS local_songs (
        path TEXT PRIMARY KEY,
        file_name TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        size INTEGER NOT NULL,
        md5 TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    }
    replaceCloudSongs(songs) {
        const clear = this.db.prepare("DELETE FROM cloud_songs");
        const insert = this.db.prepare(`
      INSERT INTO cloud_songs (
        cloud_id, song_id, file_name, simple_song_name, artist, album, duration_ms, add_time, file_size, md5
      ) VALUES (
        @cloudId, @songId, @fileName, @simpleSongName, @artist, @album, @durationMs, @addTime, @fileSize, @md5
      )
    `);
        const tx = this.db.transaction((rows) => {
            clear.run();
            for (const row of rows) {
                insert.run(row);
            }
        });
        tx(songs);
    }
    getCloudSongs() {
        return this.db
            .prepare(`
        SELECT
          cloud_id AS cloudId,
          song_id AS songId,
          file_name AS fileName,
          simple_song_name AS simpleSongName,
          artist,
          album,
          duration_ms AS durationMs,
          add_time AS addTime,
          file_size AS fileSize,
          md5
        FROM cloud_songs
      `)
            .all();
    }
    replaceLocalSongs(songs) {
        const clear = this.db.prepare("DELETE FROM local_songs");
        const insert = this.db.prepare(`
      INSERT INTO local_songs (
        path, file_name, title, artist, album, duration_ms, size, md5
      ) VALUES (
        @path, @fileName, @title, @artist, @album, @durationMs, @size, @md5
      )
    `);
        const tx = this.db.transaction((rows) => {
            clear.run();
            for (const row of rows) {
                insert.run(row);
            }
        });
        tx(songs);
    }
    getLocalSongs() {
        return this.db
            .prepare(`
        SELECT
          path,
          file_name AS fileName,
          title,
          artist,
          album,
          duration_ms AS durationMs,
          size,
          md5
        FROM local_songs
      `)
            .all();
    }
    setMeta(key, value) {
        this.db
            .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .run(key, value);
    }
    getMeta(key) {
        const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
        return row?.value;
    }
}
//# sourceMappingURL=cache-repo.js.map