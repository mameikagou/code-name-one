/**
 * @file 应用入口
 *
 * Bun 的 HTTP 服务器入口，通过 default export 配置端口和 fetch handler。
 * 所有应用逻辑在 app.ts 中组装，这里只负责启动和打印 banner。
 */

import { env } from "./config/env";
import { createApp } from "./app";

const app = createApp();

// 启动 banner
console.log(`
╔═══════════════════════════════════════╗
║        Code-Name-One Server           ║
╠═══════════════════════════════════════╣
║  Port:        ${String(env.PORT).padEnd(23)}║
║  Environment: ${env.NODE_ENV.padEnd(23)}║
║  Log Level:   ${env.LOG_LEVEL.padEnd(23)}║
║  Started:     ${new Date().toLocaleTimeString().padEnd(23)}║
╚═══════════════════════════════════════╝
`);

export default {
  port: env.PORT,
  fetch: app.fetch,
};
