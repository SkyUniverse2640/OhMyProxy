import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from "fs";
import { join, resolve, dirname, basename, relative } from "path";

const BASH_TIMEOUT_MS = 120_000; // 2 minutes

export class ToolExecutor {
  private readonly cwd: string;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  private resolvePath(p: string): string {
    if (!p || p === "" || p === ".") return this.cwd;
    if (p.match(/^[A-Za-z]:[\\\/]/) || p.startsWith("/")) return p;
    return resolve(this.cwd, p);
  }

  execute(name: string, args: any): any {
    try {
      switch (name) {
        case "bash":
        case "runCommand":       return this.bash(args);
        case "listDirectory":    return this.listDirectory(args);
        case "readFile":
        case "read":             return this.readFile(args);
        case "searchFiles":      return this.searchFiles(args);
        case "grep":             return this.grep(args);
        case "glob":             return this.glob(args);
        case "createFile":
        case "writeFile":
        case "write":            return this.writeFile(args);
        case "edit":
        case "editFile":         return this.edit(args);
        case "createDirectory":  return this.createDirectory(args);
        case "deleteFile":       return this.deleteFile(args);
        default:
          return { error: `Unknown tool: ${name}`, note: "Not implemented in proxy" };
      }
    } catch (e: any) {
      return { error: e.message, status: "ERROR" };
    }
  }

  // ─── Bash ──────────────────────────────────────────────────────────────

  private bash(args: any): any {
    const command = args.command ?? args.cmd ?? "";
    if (!command) return { error: "No command provided" };

    const workdir = args.workdir ?? args.cwd ?? this.cwd;
    const timeoutMs = args.timeout ?? BASH_TIMEOUT_MS;

    try {
      const proc = Bun.spawnSync({
        cmd: ["sh", "-c", command],
        cwd: workdir,
        stdout: "pipe",
        stderr: "pipe",
        timeout: timeoutMs,
      });

      const stdout = proc.stdout?.toString() ?? "";
      const stderr = proc.stderr?.toString() ?? "";
      const output = stderr ? (stdout ? `${stdout}\n${stderr}` : stderr) : stdout;

      return {
        stdout: output.slice(0, 100_000), // Truncate large output
        exitCode: proc.exitCode,
        status: proc.exitCode === 0 ? "SUCCESS" : "ERROR",
      };
    } catch (e: any) {
      return { error: e.message, status: "ERROR" };
    }
  }

  // ─── Grep ──────────────────────────────────────────────────────────────

  private grep(args: any): any {
    const pattern = args.pattern ?? args.query ?? "";
    if (!pattern) return { error: "No pattern provided" };

    const dir = this.resolvePath(args.path ?? args.directory ?? ".");
    const include = args.include ?? args.glob ?? "";
    const maxResults = args.maxResults ?? args.limit ?? 100;

    const results: Array<{ file: string; line: number; content: string }> = [];
    try {
      const regex = new RegExp(pattern, "gm");
      this.walkFiles(dir, include, (fp) => {
        if (results.length >= maxResults) return false;
        try {
          const content = readFileSync(fp, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (results.length >= maxResults) break;
            const line = lines[i] ?? "";
            if (regex.test(line)) {
              results.push({ file: relative(this.cwd, fp), line: i + 1, content: line.trim() });
              regex.lastIndex = 0;
            }
          }
        } catch { /* skip unreadable files */ }
        return true;
      });
    } catch { return { error: `Invalid pattern: ${pattern}` }; }

    return { results, total: results.length };
  }

  // ─── Glob ──────────────────────────────────────────────────────────────

  private glob(args: any): any {
    const pattern = args.pattern ?? args.glob ?? "**/*";
    const dir = this.resolvePath(args.path ?? args.directory ?? ".");
    const maxResults = args.maxResults ?? args.limit ?? 200;

    const results: string[] = [];
    this.walkFiles(dir, pattern, (fp) => {
      if (results.length >= maxResults) return false;
      results.push(relative(this.cwd, fp));
      return true;
    });

    return { results, total: results.length };
  }

  // ─── Edit ──────────────────────────────────────────────────────────────

  private edit(args: any): any {
    const fp = this.resolvePath(args.filePath ?? args.path ?? "");
    if (!existsSync(fp)) return { error: `File not found: ${fp}` };

    const oldStr = args.oldString ?? args.old_string ?? args.search ?? "";
    const newStr = args.newString ?? args.new_string ?? args.replace ?? "";
    const replaceAll = args.replaceAll ?? args.replace_all ?? false;

    const content = readFileSync(fp, "utf-8");

    if (!content.includes(oldStr)) {
      return { error: "old_string not found in file", status: "ERROR" };
    }

    const occurrences = content.split(oldStr).length - 1;
    if (occurrences > 1 && !replaceAll) {
      return {
        error: `old_string matches ${occurrences} times but replace_all is not set`,
        status: "ERROR",
      };
    }

    const newContent = replaceAll
      ? content.split(oldStr).join(newStr)
      : content.replace(oldStr, newStr);

    writeFileSync(fp, newContent, "utf-8");
    const filePath = relative(this.cwd, fp) || basename(fp);
    return {
      status: "SUCCESS",
      message: `Edited file: ${filePath}`,
      filePath,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private walkFiles(dir: string, pattern: string, fn: (fp: string) => boolean): void {
    if (!existsSync(dir)) return;
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fp = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") continue;
          this.walkFiles(fp, pattern, fn);
        } else if (entry.isFile()) {
          if (!pattern || pattern === "**/*" || entry.name.includes(pattern)) {
            if (!fn(fp)) break;
          }
        }
      }
    } catch { /* skip inaccessible dirs */ }
  }

  // ─── Tool Implementations ──────────────────────────────────────────────

  private listDirectory(args: any): any {
    const dir = this.resolvePath(args.relativePath ?? args.path ?? "");
    if (!existsSync(dir)) return { error: `Directory not found: ${dir}` };
    const entries = readdirSync(dir, { withFileTypes: true }).map(e => ({
      name: e.name,
      type: e.isDirectory() ? "directory" : "file",
      path: join(dir, e.name),
    }));
    return { path: dir, entries };
  }

  private readFile(args: any): any {
    const fp = this.resolvePath(args.relativePath ?? args.path ?? "");
    if (!existsSync(fp)) return { error: `File not found: ${fp}` };
    return { path: fp, content: readFileSync(fp, "utf-8") };
  }

  private searchFiles(args: any): any {
    const dir = this.resolvePath(args.relativePath ?? args.path ?? "");
    const pattern = args.pattern ?? args.query ?? "";
    const results: string[] = [];
    const walk = (d: string) => {
      if (!existsSync(d)) return;
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const fp = join(d, e.name);
        if (e.isDirectory()) walk(fp);
        else if (e.name.includes(pattern)) results.push(fp);
      }
    };
    walk(dir);
    return { results };
  }

  private writeFile(args: any): any {
    const rawPath = args.path ?? args.filePath ?? args.relativePath ?? "";
    const fp = this.resolvePath(rawPath);
    const content = args.content ?? args.fileContent ?? "";
    const dir = dirname(fp);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fp, content, "utf-8");
    const filePath = rawPath || relative(this.cwd, fp) || basename(fp);
    return {
      status: "SUCCESS",
      message: `Created file: ${filePath}`,
      filePath,
      contentLength: Buffer.byteLength(content, "utf-8"),
      platform: "desktop",
    };
  }

  private createDirectory(args: any): any {
    const fp = this.resolvePath(args.relativePath ?? args.path ?? "");
    mkdirSync(fp, { recursive: true });
    return { status: "SUCCESS", path: fp };
  }

  private deleteFile(args: any): any {
    const fp = this.resolvePath(args.relativePath ?? args.path ?? "");
    if (existsSync(fp)) unlinkSync(fp);
    const filePath = args.path ?? args.relativePath ?? basename(fp);
    return { status: "SUCCESS", message: `Deleted file: ${filePath}`, platform: "desktop" };
  }

  // ─── Summary ───────────────────────────────────────────────────────────

  static summarize(name: string, args: any, result: any): string {
    if (result?.error) return `Error: ${String(result.error).slice(0, 60)}`;
    const fileName = basename(args.path ?? args.filePath ?? args.relativePath ?? "") || "";
    const cmd = args.command ?? args.cmd ?? "";
    const summaries: Record<string, string> = {
      bash:             `Bash: ${cmd.slice(0, 50)}`,
      runCommand:       `Bash: ${cmd.slice(0, 50)}`,
      createFile:       `Created ${fileName || "file"}`,
      writeFile:        `Created ${fileName || "file"}`,
      write:            `Created ${fileName || "file"}`,
      readFile:         `Read ${fileName || "file"}`,
      read:             `Read ${fileName || "file"}`,
      edit:             `Edited ${fileName || "file"}`,
      editFile:         `Edited ${fileName || "file"}`,
      deleteFile:       `Deleted ${fileName || "file"}`,
      createDirectory:  `Created directory ${fileName}`,
      listDirectory:    `Listed ${fileName || "directory"}`,
      searchFiles:      `Search: ${args.pattern ?? args.query ?? ""}`,
      grep:             `Grep: ${args.pattern ?? ""}`,
      glob:             `Glob: ${args.pattern ?? ""}`,
    };
    return summaries[name] ?? `${name} completed`;
  }
}
