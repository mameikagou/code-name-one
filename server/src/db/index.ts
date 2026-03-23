/**
 * @file 数据库层 barrel 导出
 *
 * 上层代码统一从 "@/db" 导入，无需关心 schema 和 client 分文件的细节。
 */

export { db, sqlite } from "./client";
export * from "./schema";
