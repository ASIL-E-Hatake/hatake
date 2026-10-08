import { defineConfig } from "vitest/config";

// 単体の試験だけ（test/*.e2e.mjs は puppeteer の部屋で別に回す）。
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
