import Conf from "conf";
export class SessionStore {
    conf = new Conf({
        projectName: "ncm-cloud-manager",
        defaults: {
            session: {},
            cloudCacheUpdatedAt: 0,
            localScanPath: ""
        }
    });
    getSession() {
        return this.conf.get("session");
    }
    setSession(session) {
        this.conf.set("session", session);
    }
    clearSession() {
        this.conf.set("session", {});
    }
    getCloudCacheUpdatedAt() {
        return this.conf.get("cloudCacheUpdatedAt");
    }
    setCloudCacheUpdatedAt(ts) {
        this.conf.set("cloudCacheUpdatedAt", ts);
    }
    getLocalScanPath() {
        return this.conf.get("localScanPath");
    }
    setLocalScanPath(path) {
        this.conf.set("localScanPath", path);
    }
}
//# sourceMappingURL=session-store.js.map