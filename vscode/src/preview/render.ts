// 画面を描く部品（「YAML の横のプレビュー」と、ツリーから開く画面の「画面」タブが共有する）。
//
// 描くのは Vue 版の Renderer（新しい Renderer は作らない）。データは拡張機能が定義から作った
// 作り物（previewData.ts）。**書き間違えたら白い画面にしない**＝理由をそのまま出す。

import { parseAppPagesYaml, parseAppYaml, parsePageYaml } from "@hatake-fw/api";
import { FakeRepository, RepositoryRegistry } from "@hatake-fw/runtime";
import { HatakeApp, HatakePage, HatakeScope } from "@hatake-fw/vue3";
import { createApp, h } from "vue";

import "@hatake-fw/runtime/hatake.css";

export interface ScreenModel {
  kind: "app" | "page";
  repositories: Record<string, { keyFields: string[]; rows: Record<string, unknown>[]; from: string }>;
  roles: string[];
}

export interface ScreenOptions {
  source: string;
  model: ScreenModel;
  /** 見ている人の役割（空なら指定なし）。 */
  role: string;
  /** app のうち1枚だけ描く（無ければ app ぜんぶ＝メニューつき）。 */
  page?: string;
}

/** 読めない定義の理由を出す（白い画面にしない）。 */
export function showError(box: HTMLElement, error: unknown): void {
  box.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = "定義を読めませんでした";
  const line = document.createElement("pre");
  line.className = "hatake-preview-error";
  line.setAttribute("role", "alert");
  line.setAttribute("data-hatake", "boot-error");
  line.textContent = error instanceof Error ? error.message : String(error);
  box.append(title, line);
}

/** 画面を描く。描き直すときは返した関数で外してから呼ぶ。 */
export function mountScreen(box: HTMLElement, options: ScreenOptions): () => void {
  box.replaceChildren();
  try {
    const repositories = new RepositoryRegistry(
      Object.fromEntries(
        Object.entries(options.model.repositories).map(([name, one]) => [name, new FakeRepository(one.rows, one.keyFields)]),
      ),
    );
    const roles = options.role === "" ? [] : [options.role];
    let view: () => ReturnType<typeof h>;
    if (options.model.kind === "page") {
      const definition = parsePageYaml(options.source, { strict: true });
      view = () => h(HatakePage, { definition, roles });
    } else if (options.page !== undefined) {
      const definition = parseAppPagesYaml(options.source, { strict: true })[options.page];
      if (definition === undefined) throw new Error(`画面 ${options.page} が定義にありません。`);
      view = () => h(HatakePage, { definition, roles });
    } else {
      const app = parseAppYaml(options.source, { strict: true });
      const pages = parseAppPagesYaml(options.source, { strict: true });
      view = () => h(HatakeApp, { app, pages, roles });
    }
    const mounted = createApp({ render: () => h(HatakeScope, { registries: { repositories } }, view) });
    mounted.config.errorHandler = (error) => showError(box, error);
    mounted.mount(box);
    return () => mounted.unmount();
  } catch (error) {
    showError(box, error);
    return () => undefined;
  }
}
