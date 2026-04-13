import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CloudSong, LocalSong } from "../../core/types.js";

export class CacheRepo {
  private readonly db: Database.Database;

  constructor() {
    const dbDir = path.join(os.homedir(), ".ncm-cloud-manager");
    fs.mkdirSync(dbDir, { recursive: true });
    this.db = new Database(path.join(dbDir, "cache.db"));
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  private initialize(): void {
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

  replaceCloudSongs(songs: CloudSong[]): void {
    const clear = this.db.prepare("DELETE FROM cloud_songs");
    const insert = this.db.prepare(`
      INSERT INTO cloud_songs (
        cloud_id, song_id, file_name, simple_song_name, artist, album, duration_ms, add_time, file_size, md5
      ) VALUES (
        @cloudId, @songId, @fileName, @simpleSongName, @artist, @album, @durationMs, @addTime, @fileSize, @md5
      )
    `);
    const tx = this.db.transaction((rows: CloudSong[]) => {
      clear.run();
      for (const row of rows) {
        insert.run(row);
      }
    });
    tx(songs);
  }

  getCloudSongs(): CloudSong[] {
    return this.db.prepare("SELECT * FROM cloud_songs").all() as CloudSong[];
  }

  replaceLocalSongs(songs: LocalSong[]): void {
    const clear = this.db.prepare("DELETE FROM local_songs");
    const insert = this.db.prepare(`
      INSERT INTO local_songs (
        path, file_name, title, artist, album, duration_ms, size, md5
      ) VALUES (
        @path, @fileName, @title, @artist, @album, @durationMs, @size, @md5
      )
    `);
    const tx = this.db.transaction((rows: LocalSong[]) => {
      clear.run();
      for (const row of rows) {
        insert.run(row);
      }
    });
    tx(songs);
  }

  getLocalSongs(): LocalSong[] {
    return this.db.prepare("SELECT * FROM local_songs").all() as LocalSong[];
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  getMeta(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  }
}
