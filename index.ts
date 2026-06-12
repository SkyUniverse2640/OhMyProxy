import { Config } from "./src/Config";
import { ProxyServer } from "./src/ProxyServer";
import { dirname } from "path";

// In compiled binary, import.meta.dir points to virtual Bun filesystem.
// Use process.execPath to get the real binary directory.
const isCompiled = import.meta.dir.includes("~BUN") || import.meta.dir.includes("/$bun") || !import.meta.dir.startsWith("/") && !import.meta.dir.match(/^[A-Z]:\\/i) && import.meta.dir.includes("~");
const baseDir = isCompiled ? dirname(process.execPath) : import.meta.dir;

const config = new Config(baseDir);
new ProxyServer(config).start();
