// 道具の版＝配っている `@hatake-fw/api` の版（package.json から読む）。
//
// CLI（`--version`・`doctor`）と MCP（`serverInfo`・`hatake_doctor`）が同じものを言う
// ための1か所。0.9.22 まで CLI は `0.0.1` と決め打ちで、MCP は 0.9.23 になっても
// `0.0.1` を名乗っていた（直したのが片方だけだった）。

import { createRequire } from "node:module";

export const TOOL_VERSION: string = (() => {
  try {
    return (createRequire(import.meta.url)("../package.json") as { version: string }).version;
  } catch {
    return "unknown";
  }
})();
