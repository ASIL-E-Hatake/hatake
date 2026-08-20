// git の2リビジョンから、比べる2つの定義を取り出す。
//
// `diff` と `explain --diff` は「変更前のファイル」を要求するが、**変更前は git が
// 持っている**。手で `git show HEAD~1:path > old.yaml` と書き出させている限り、この
// 2つは CI に置けない（＝変更のたびに説明が付く、が起きない）。
//
// git を呼ぶのは [GitRunner] 1つに絞ってある。ここが素の関数だと試験で git が要る
// ようになり、「git が入っている機械でしか通らない試験」になる。
//
// 書ける範囲は3つだけ。**リビジョンの指定を書くための言語にはしない**:
//   ・`A..B`  … A と B を比べる
//   ・`A...B` … 枝分かれした所（merge-base）と B を比べる＝PR の中身そのもの
//   ・`A`     … A と**いま手元にあるもの**を比べる

import { basename, dirname } from "node:path";

/** git を1回呼ぶ。標準出力をそのまま返し、失敗したら投げる。 */
export type GitRunner = (args: string[]) => string;

/** 範囲の指定を解いたもの。 */
export interface GitRange {
  /** 古い側のリビジョン。 */
  old: string;
  /** 新しい側（undefined = 作業中のファイル）。 */
  new?: string;
  /** true = 古い側は枝分かれした所（`...`）。 */
  mergeBase: boolean;
}

/** 範囲の指定を読む。 */
export function parseGitRange(spec: string): GitRange {
  const text = spec.trim();
  if (text === "") {
    throw new Error("--git には HEAD~1..HEAD のようにリビジョンを渡してください。");
  }
  for (const [separator, mergeBase] of [
    ["...", true],
    ["..", false],
  ] as const) {
    const at = text.indexOf(separator);
    if (at < 0) continue;
    const left = text.slice(0, at).trim();
    const right = text.slice(at + separator.length).trim();
    if (left === "") {
      throw new Error(`--git ${text} は左側が空です（HEAD~1..HEAD のように）。`);
    }
    // `A..` は「A と作業中」（git 自身の読み方と同じ）。
    return {
      old: left,
      ...(right === "" ? {} : { new: right }),
      mergeBase,
    };
  }
  return { old: text, mergeBase: false };
}

/** 人が読む形（出力に「何と何を比べたか」を書くため）。 */
export const describeGitRange = (range: GitRange): string =>
  `${range.mergeBase ? `${range.old}（枝分かれした所）` : range.old} → ${
    range.new ?? "作業中"
  }`;

/** 比べる2つの定義。 */
export interface GitPair {
  before: string;
  after: string;
  /** 「何と何を比べたか」の1行。 */
  label: string;
}

/**
 * [file] を2つのリビジョンで読む。
 *
 * `git -C <ファイルのある所> show <rev>:./<ファイル名>` の形で呼ぶので、リポジトリの
 * どこから実行しても・絶対パスを渡しても同じように動く（`rev:path` は**リポジトリの
 * 根から**の道なので、素直に渡すと外から実行したときだけ落ちる）。
 */
export function readGitPair(
  spec: string,
  file: string,
  git: GitRunner,
  readWorktree: (path: string) => string,
): GitPair {
  const range = parseGitRange(spec);
  const dir = dirname(file) || ".";
  const name = basename(file);
  const at = (rev: string): string => {
    try {
      return git(["-C", dir, "show", `${rev}:./${name}`]);
    } catch (error) {
      throw new Error(
        `${rev} の ${name} が読めません（そのリビジョンにそのファイルが無い＝` +
          `新しく足したファイルかもしれません）。` +
          `\n  git: ${error instanceof Error ? error.message.trim() : String(error)}`,
      );
    }
  };

  let old = range.old;
  if (range.mergeBase) {
    const other = range.new ?? "HEAD";
    try {
      old = git(["-C", dir, "merge-base", range.old, other]).trim();
    } catch (error) {
      throw new Error(
        `${range.old} と ${other} の枝分かれした所が分かりません。` +
          `\n  git: ${error instanceof Error ? error.message.trim() : String(error)}`,
      );
    }
  }
  return {
    before: at(old),
    after: range.new === undefined ? readWorktree(file) : at(range.new),
    label: `${describeGitRange(range)} の ${name}`,
  };
}
