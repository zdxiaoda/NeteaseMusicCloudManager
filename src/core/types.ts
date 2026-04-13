export type LoginMethod = "phone" | "email" | "qr";

export interface SongFingerprint {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  size: number;
  md5?: string;
}

export interface CloudSong {
  cloudId: number;
  songId?: number;
  fileName: string;
  simpleSongName: string;
  artist: string;
  album: string;
  durationMs: number;
  addTime: number;
  fileSize: number;
  md5?: string;
}

export interface LocalSong {
  path: string;
  fileName: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  size: number;
  md5: string;
}

export interface DiffResult {
  localOnly: LocalSong[];
  cloudOnly: CloudSong[];
  matchedExact: Array<{ local: LocalSong; cloud: CloudSong }>;
  matchedFuzzy: Array<{ local: LocalSong; cloud: CloudSong; score: number }>;
}

export interface SessionState {
  cookie?: string;
  lastLoginAt?: number;
  loginMethod?: LoginMethod;
}
