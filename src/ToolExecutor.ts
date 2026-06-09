import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from "fs";
import { join, resolve, dirname, basename, relative } from "path";

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
        case "listDirectory":   return this.listDirectory(args);
        case "readFile":        return this.readFile(args);
        case "searchFiles":     return this.searchFiles(args);
        case "createFile":
        case "writeFile":       return this.writeFile(args);
        case "createDirectory": return this.createDirectory(args);
        case "deleteFile":      return this.deleteFile(args);
        default:
          return { error: `Unknown tool: ${name}`, note: "Not implemented in proxy" };
      }
    } catch (e: any) {
      return { error: e.message, status: "ERROR" };
    }
  }

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

  static summarize(name: string, args: any, result: any): string {
    if (result?.error) return `Error: ${String(result.error).slice(0, 60)}`;
    const fileName = basename(args.path ?? args.filePath ?? args.relativePath ?? "") || "";
    const summaries: Record<string, string> = {
      createFile:      `Created ${fileName || "file"}`,
      writeFile:       `Created ${fileName || "file"}`,
      readFile:        `Read ${fileName || "file"}`,
      deleteFile:      `Deleted ${fileName || "file"}`,
      createDirectory: `Created directory ${fileName}`,
      listDirectory:   `Listed ${fileName || "directory"}`,
      searchFiles:     `Search: ${args.pattern ?? args.query ?? ""}`,
    };
    return summaries[name] ?? `${name} completed`;
  }
}
