import Conf from "conf";
import { SessionState } from "../../core/types.js";

interface AppConfig {
  session: SessionState;
  cloudCacheUpdatedAt: number;
  localScanPath: string;
}

export class SessionStore {
  private readonly conf = new Conf<AppConfig>({
    projectName: "ncm-cloud-manager",
    defaults: {
      session: {},
      cloudCacheUpdatedAt: 0,
      localScanPath: ""
    }
  });

  getSession(): SessionState {
    return this.conf.get("session");
  }

  setSession(session: SessionState): void {
    this.conf.set("session", session);
  }

  clearSession(): void {
    this.conf.set("session", {});
  }

  getCloudCacheUpdatedAt(): number {
    return this.conf.get("cloudCacheUpdatedAt");
  }

  setCloudCacheUpdatedAt(ts: number): void {
    this.conf.set("cloudCacheUpdatedAt", ts);
  }

  getLocalScanPath(): string {
    return this.conf.get("localScanPath");
  }

  setLocalScanPath(path: string): void {
    this.conf.set("localScanPath", path);
  }
}
