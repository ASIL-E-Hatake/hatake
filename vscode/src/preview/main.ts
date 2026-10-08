// プレビュー（YAML の横に出す。Webview の中で動く側）。描くのは render.ts（「画面」タブと共有）。
//
// 拡張機能（extension.ts）から `render` を受け取って描き直す。
// 拡張機能の外（試験の puppeteer）でも同じ口で動く: window に `render` を postMessage すれば描く。

import { mountScreen, type ScreenModel } from "./render";

import "./preview.css";

interface RenderMessage {
  type: "render";
  file: string;
  source: string;
  model: ScreenModel;
}

declare function acquireVsCodeApi(): { postMessage(message: unknown): void; getState(): unknown; setState(state: unknown): void };
const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;

let unmount: () => void = () => undefined;
let last: RenderMessage | undefined;
let role = (vscode?.getState() as { role?: string } | undefined)?.role ?? "";

const byId = (id: string): HTMLElement => {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`#${id} がありません`);
  return found;
};

function bar(message: RenderMessage): void {
  byId("file").textContent = message.file;
  const froms = [...new Set(Object.values(message.model.repositories).map((one) => one.from))];
  byId("data").textContent = froms.length === 0 ? "データ: なし" : `データ: ${froms.join("・")}`;
  const select = byId("role") as HTMLSelectElement;
  const roles = message.model.roles;
  if (role !== "" && !roles.includes(role)) role = "";
  select.replaceChildren(
    new Option("役割: 指定なし", ""),
    ...roles.map((one) => new Option(`役割: ${one}`, one, false, one === role)),
  );
  select.value = role;
  byId("roles").hidden = roles.length === 0;
}

function render(message: RenderMessage): void {
  last = message;
  bar(message);
  unmount();
  unmount = mountScreen(byId("app"), { source: message.source, model: message.model, role });
}

byId("role").addEventListener("change", (event) => {
  role = (event.target as HTMLSelectElement).value;
  vscode?.setState({ role });
  if (last !== undefined) render(last);
});

window.addEventListener("message", (event: MessageEvent) => {
  const data = event.data as RenderMessage | undefined;
  if (data?.type === "render") render(data);
});

vscode?.postMessage({ type: "ready" });
