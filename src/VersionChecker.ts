export interface VersionInfo {
  current: string;
  latest: string | null;
  hasUpdate: boolean;
  releaseUrl: string | null;
  releaseDate: string | null;
  releaseNotes: string | null;
  checkedAt: number;
}

export class VersionChecker {
  private readonly repo: string;
  private cache: VersionInfo | null = null;
  private cacheTtl = 3600_000; // 1 hour

  constructor(repo: string) {
    this.repo = repo;
  }

  async check(): Promise<VersionInfo> {
    // Return cached if fresh
    if (this.cache && Date.now() - this.cache.checkedAt < this.cacheTtl) {
      return this.cache;
    }

    const current = this.getCurrentVersion();
    let latest: string | null = null;
    let releaseUrl: string | null = null;
    let releaseDate: string | null = null;
    let releaseNotes: string | null = null;
    let hasUpdate = false;

    try {
      const resp = await fetch(`https://api.github.com/repos/${this.repo}/releases/latest`, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "OhMyProxy-VersionChecker",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (resp.ok) {
        const release = await resp.json() as any;
        latest = (release.tag_name || "").replace(/^v/, "");
        releaseUrl = release.html_url || null;
        releaseDate = release.published_at || null;
        releaseNotes = release.body?.slice(0, 500) || null;

        if (latest && this.compareVersions(latest, current) > 0) {
          hasUpdate = true;
        }
      }
    } catch {
      // Offline or rate-limited — leave latest as null
    }

    this.cache = {
      current,
      latest,
      hasUpdate,
      releaseUrl,
      releaseDate,
      releaseNotes,
      checkedAt: Date.now(),
    };

    return this.cache;
  }

  getCached(): VersionInfo | null {
    return this.cache;
  }

  private getCurrentVersion(): string {
    try {
      const { VERSION } = require("./version");
      return VERSION || "0.0.0";
    } catch {
      return "0.0.0";
    }
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
      if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
    }
    return 0;
  }
}
