import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default {
  port: 3000,
  fetch: app.fetch,
};
