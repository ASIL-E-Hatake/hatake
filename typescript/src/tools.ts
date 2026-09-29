// **道具の口**（`@hatake-fw/api/tools`）。
//
// ここから出ているものも**約束しません**（`internal` と同じ）。違いは1つだけで、
// **ここは Node でしか動きません**（`node:fs` / `node:child_process` を引く）。
//
// なぜ分けたか。以前はこの4本も `internal` に混ざっていました。`internal` は
// 枠組みの中身を使いたい人の道で、**Web の Renderer（`@hatake-fw/runtime` /
// `vue3` / `react19`）もここを通ります**。混ざっていると、画面を束ねたときに
// `node:path` を引くものまで一緒に引かれて、**案件のビルドが落ちます**
// （実際に落ちました。落ちるのは案件側なので、こちらの CI には出ません）。
//
// 分け方の線は「誰が呼ぶか」:
//
//   ・`index`    … 業務のコードが呼ぶ（約束する）
//   ・`internal` … 枠組みの中身。**ブラウザでも動く**（約束しない）
//   ・`tools`    … CLI・MCP・spec の置き場所・git。**Node 専用**（約束しない）
//
// この線が守れているかは `test/publicApi.test.ts` が見ています。

export * from "./specDir.js";
export * from "./mcpTools.js";
export * from "./mcpContract.js";
export * from "./gitRange.js";
