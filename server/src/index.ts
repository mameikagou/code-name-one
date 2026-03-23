/**
 * @file 应用入口
 *
 * Bun 的 HTTP 服务器入口，通过 default export 配置端口和 fetch handler。
 * 所有应用逻辑在 app.ts 中组装，这里只负责启动。
 */

import { createApp } from "./app";

const app = createApp();

export default {
  port: 3000,
  fetch: app.fetch,
};
