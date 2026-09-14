import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isAppSnapshot,
  parseAppSnapshot,
  SNAPSHOT_SOURCES,
  SnapshotError,
  snapshotDocument,
  snapshotLines,
} from "../src/index.js";
import { runCli, type CliIo } from "../src/cli.js";

/**
 * 動いているアプリ／サーバの申告を読む（`hatake registry --from-app`）。
 *
 * この道具でいちばんまずいのは**手で書いた一覧を申告として受け取る**こと。手書きの一覧は
 * 「登録していない」と「書き忘れた」の区別が付かないので、申告として扱うと道具が
 * **無い種類について断定する**ようになる（「出す口が1つも無い」など）。だから印を見る。
 */
const fixture = JSON.parse(
  readFileSync("../spec/conformance/registry_snapshot.json", "utf8"),
) as { sources: { app: string; server: string } };

const SNAPSHOT = {
  $comment: "動いているアプリが申告した一覧",
  $source: "registrySnapshot",
  repositories: ["orderRepository", "customerRepository"],
  sinks: ["exportSink"],
};

describe("申告の印", () => {
  it("**3版で決めた字と一致する**（食い違うと、書いた紙を読めなくなる）", () => {
    expect([...SNAPSHOT_SOURCES].sort()).toEqual(
      [fixture.sources.app, fixture.sources.server].sort(),
    );
  });

  it("印の無い紙は受け取らない（手で書いた一覧を申告にしない）", () => {
    expect(() => parseAppSnapshot({ repositories: ["orderRepository"] })).toThrow(
      SnapshotError,
    );
    expect(() => parseAppSnapshot({ repositories: ["x"] })).toThrow(/申告ではありません/);
    expect(isAppSnapshot({ repositories: ["x"] })).toBe(false);
  });

  it("知らない印も受け取らない", () => {
    expect(() => parseAppSnapshot({ $source: "手で書いた" })).toThrow(/知っているのは/);
  });

  it("画面側もサーバ側も受け取る", () => {
    for (const source of SNAPSHOT_SOURCES) {
      expect(isAppSnapshot({ $source: source })).toBe(true);
    }
  });
});

describe("申告を読む", () => {
  const snapshot = parseAppSnapshot(SNAPSHOT);

  it("名前は名前順にそろえる（申告の順で差分が揺れない）", () => {
    expect(snapshot.registry.repositories).toEqual([
      "customerRepository",
      "orderRepository",
    ]);
  });

  it("`$` で始まるキーは一覧に混ぜない", () => {
    expect(Object.keys(snapshot.registry)).toEqual(["repositories", "sinks"]);
  });

  it("そのまま置ける形にすると、印は残る（次に読む道具が見る）", () => {
    const document = snapshotDocument(snapshot);
    expect(document.$source).toBe("registrySnapshot");
    expect(isAppSnapshot(document)).toBe(true);
  });

  it("空の種類が何を意味するかを毎回書く", () => {
    const text = snapshotLines(snapshot).join("\n");
    expect(text).toContain("足したものだけ");
    expect(text).toContain("印（$source）が本当かは見ていません");
  });

  it("配列でない値は落とす（申告の形ではない）", () => {
    expect(() =>
      parseAppSnapshot({ $source: "registrySnapshot", repositories: "orderRepository" }),
    ).toThrow(/文字の配列/);
  });
});

const fakeIo = (files: Record<string, string>) => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIo & { stdout: string[]; stderr: string[] } = {
    stdout,
    stderr,
    out: (text) => stdout.push(text),
    err: (text) => stderr.push(text),
    readFile: (path) => files[path] ?? readFileSync(path, "utf8"),
    writeFile: () => {},
    listFiles: () => null,
  };
  return io;
};

const DEFINITION = `page:
  type: search
  id: order_search
  title: 受注照会
  repository: orderRepository
  table:
    columns: [{ field: orderNo, label: 受注番号 }]
  actions:
    - { id: csv, type: export, label: CSV出力, scope: selection }
`;

describe("hatake registry --from-app", () => {
  it("申告を読んで、そのまま置ける形にする", () => {
    const io = fakeIo({ "snap.json": JSON.stringify(SNAPSHOT) });
    expect(runCli(["registry", "--from-app", "snap.json", "--json"], io)).toBe(0);
    const document = JSON.parse(io.stdout.join(String.fromCharCode(10)));
    expect(document.$source).toBe("registrySnapshot");
    expect(document.repositories).toContain("orderRepository");
  });

  it("印の無い紙は落ちる", () => {
    const io = fakeIo({ "hand.json": JSON.stringify({ repositories: ["x"] }) });
    expect(runCli(["registry", "--from-app", "hand.json"], io)).toBe(1);
    expect(io.stderr.join(String.fromCharCode(10))).toContain("申告ではありません");
  });

  it("**申告を --registry に渡すと、出す口が無いことまで言える**", () => {
    const io = fakeIo({
      "def.yaml": DEFINITION,
      "snap.json": JSON.stringify({
        $source: "registrySnapshot",
        repositories: ["orderRepository"],
      }),
    });
    runCli(["validate", "def.yaml", "--registry", "snap.json", "--json"], io);
    expect(io.stdout.join(String.fromCharCode(10))).toContain("sink-not-declared");
  });

  it("手で書いた一覧では、そこまでは言わない", () => {
    const io = fakeIo({
      "def.yaml": DEFINITION,
      "hand.json": JSON.stringify({ repositories: ["orderRepository"] }),
    });
    runCli(["validate", "def.yaml", "--registry", "hand.json", "--json"], io);
    expect(io.stdout.join(String.fromCharCode(10))).not.toContain("sink-not-declared");
  });
});
