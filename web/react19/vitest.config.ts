import { defineConfig } from "vitest/config";

// 画面を実際に描いて見る（DOM が要る）。**配るものの依存は増やさない** ——
// happy-dom も testing-library も devDependencies なので利用者には降りない。
export default defineConfig({
  test: { environment: "happy-dom" },
  esbuild: { jsx: "automatic" },
});
