// CLI が触る外界（読む・書く・言う・git を呼ぶ）。
//
// 1枚に分けてあるのは、**入口を差し替えられる形を1か所で決める**ため。試験は偽の
// 外界を渡して回すので、ここが小さいほど「本物と偽物の差」が読める。

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/** CLI が触る外界。テストから差し替えられるようにまとめてある。 */
export interface CliIo {
  out(text: string): void;
  err(text: string): void;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  /**
   * ディレクトリの中のファイルを再帰的に並べる（`registry` がソースを集めるため）。
   * ディレクトリでなければ null。
   */
  listFiles(path: string): string[] | null;
  /**
   * 環境変数（`--login` の中の `${…}` を埋めるため）。
   *
   * 渡さなければ**空**として扱う（試験から本物の環境が混ざらないように）。秘密を
   * ファイルに書かせないための口なので、無い変数は落とす側に倒している。
   */
  env?: Record<string, string | undefined>;
  /**
   * git を1回呼ぶ（`--git`）。標準出力を返し、失敗したら投げる。
   *
   * 任意なのは、git が無い所でも CLI を動かすため（試験・生成された環境）。無ければ
   * `--git` だけが使えないと言う。
   */
  git?(args: string[]): string;
}

export const nodeIo: CliIo = {
  env: process.env,
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  readFile: (path) => readFileSync(path, "utf8"),
  writeFile: (path, content) => {
    const dir = dirname(path);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, content, "utf8");
  },
  git: (args) =>
    execFileSync("git", args, {
      encoding: "utf8",
      // 定義1つぶんなので小さいが、既定の 1MB は大きい定義で足りない。
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  listFiles: (path) => {
    if (!existsSync(path) || !statSync(path).isDirectory()) return null;
    const found: string[] = [];
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) found.push(...(nodeIo.listFiles(child) ?? []));
      else found.push(child);
    }
    return found;
  },
};
