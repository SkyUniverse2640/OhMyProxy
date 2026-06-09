import { Config } from "./src/Config";
import { ProxyServer } from "./src/ProxyServer";

const config = new Config(import.meta.dir);
new ProxyServer(config).start();
