// 動いているアプリ／サーバが申告した「登録済みのもの」を読む（`registry --from-app`）。
//
// 静的な走査（`hatake registry <ソース>`）は、登録している所に**その場で書いてある文字列**
// しか読めない。変数や関数から組み立てている登録は原理的に読めないので、そこは「読めな
// かった」として残る＝一覧が不完全になる。動いているアプリに聞けば全部分かるので、その
// 口が `registrySnapshot`（Dart）/ `RegistrySnapshot`（Java）。書き出すのは試験の1行。
//
// この道具の役目は**受け取る側**で、いちばん大事なのは「手で書いた一覧を受け取らない」
// こと。手書きの一覧は「登録していない」と「書き忘れた」の区別が付かないので、それを
// 申告として扱うと、**無い種類について道具が断定する**ようになる（`sink-not-declared`）。
// だから印（`$source`）の無い紙は落とす。
//
// 言えないことも決めてある: **印の中身が本当かは見ない**（書けば名乗れる）。言えるのは
// 「名乗っていない紙は受けない」までで、そう出力にも書く。

import type { RefKind } from "./refs.js";

/**
 * 動いているアプリが**申告できる**種類。
 *
 * 申告は**空の種類を書かない**ので、受け取った側が「出ていない＝1つも登録していない」と
 * 読めるのはここに在る種類だけ。画面の外で決まるもの（ページ・列の型・アクションの型・
 * グラフの種類）はアプリが登録するものではないので、出ていないことに意味が無い。
 *
 * 正は `spec/conformance/registry_snapshot.json` の `runtimeKinds`（Dart 側の
 * `registrySnapshot` が出す種類と同じもの）。ここに写しているのは、判断する側が実行時に
 * spec を読みに行かないため＝**食い違わないことは試験が見る**。
 */
export const RUNTIME_KINDS: RefKind[] = [
  "repositories",
  "plugins",
  "sinks",
  "validators",
  "formatters",
  "converters",
  "computedOps",
  "aggregates",
  "fieldTypes",
  "dashboardItemTypes",
  "roles",
];

/** 申告を名乗れるもの（3版で決めた字。`spec/conformance/registry_snapshot.json`）。 */
export const SNAPSHOT_SOURCES = ["registrySnapshot", "RegistrySnapshot"] as const;

export type SnapshotSource = (typeof SNAPSHOT_SOURCES)[number];

/** 申告1枚。 */
export interface AppSnapshot {
  /** 誰が書いたか（画面側か、サーバ側か）。 */
  source: SnapshotSource;
  /** 種類 → 名前（`$` で始まるキーは落としてある）。 */
  registry: Record<string, string[]>;
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 印の付いた紙か（`--registry` に渡された一覧が申告かどうかの判定）。 */
export const isAppSnapshot = (value: unknown): boolean =>
  isDict(value) &&
  typeof value.$source === "string" &&
  (SNAPSHOT_SOURCES as readonly string[]).includes(value.$source);

/**
 * 申告を読む。印が無ければ落とす（手で書いた一覧を申告として扱わない）。
 */
export function parseAppSnapshot(value: unknown): AppSnapshot {
  if (!isDict(value)) {
    throw new SnapshotError("申告は map（{ ... }）で書かれた JSON です。");
  }
  const source = value.$source;
  if (typeof source !== "string") {
    throw new SnapshotError(
      "この紙には $source がありません＝**動いているアプリの申告ではありません**。" +
        "registrySnapshot（Dart）/ RegistrySnapshot（Java）が書いたものを渡してください" +
        "（手で書いた一覧は、登録していないのか書き忘れたのかを道具が区別できません）。",
    );
  }
  if (!(SNAPSHOT_SOURCES as readonly string[]).includes(source)) {
    throw new SnapshotError(
      `$source が "${source}" です（知っているのは ` +
        `${SNAPSHOT_SOURCES.join(" / ")}）。`,
    );
  }
  const registry: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key.startsWith("$")) continue;
    if (!Array.isArray(raw) || raw.some((one) => typeof one !== "string")) {
      throw new SnapshotError(`${key} は文字の配列で書かれているはずです（申告の形）。`);
    }
    registry[key] = [...(raw as string[])].sort();
  }
  return { source: source as SnapshotSource, registry };
}

/** `hatake-registry.json` としてそのまま置ける形（印は残す＝次に読む道具が見る）。 */
export const snapshotDocument = (
  snapshot: AppSnapshot,
): Record<string, unknown> => ({
  $comment:
    "動いているアプリ／サーバが申告した「登録済みのもの」の一覧（hatake registry " +
    "--from-app が写したもの）。手で直さない＝直すとこの紙は申告ではなくなります。",
  $source: snapshot.source,
  ...snapshot.registry,
});

/** 人が読む形。**空の種類が何を意味するか**を毎回書く。 */
export function snapshotLines(snapshot: AppSnapshot): string[] {
  const kinds = Object.entries(snapshot.registry);
  const out = [
    `${snapshot.source} の申告を読みました（種類 ${kinds.length}・` +
      `名前 ${kinds.reduce((sum, [, names]) => sum + names.length, 0)}）。`,
    "",
  ];
  for (const [kind, names] of kinds) {
    out.push(`${kind}:`);
    for (const name of names) out.push(`  ${name}`);
  }
  if (kinds.length === 0) out.push("申告に名前はありませんでした（何も足していない）。");
  out.push("");
  out.push(SNAPSHOT_NOTE);
  return out;
}

/** この道具に言えないことを毎回書く。 */
export const SNAPSHOT_NOTE =
  "※ 申告は**足したものだけ**です（組み込みは突き合わせる側が知っています）。" +
  "出ていない種類は「何も足していない」＝走査（hatake registry <ソース>）の" +
  "「読めなかった」とは違います。**印（$source）が本当かは見ていません**" +
  "（書けば名乗れます）。言えるのは「名乗っていない紙は受けない」までです。";
