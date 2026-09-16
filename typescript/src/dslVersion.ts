// DSL の版（`dsl_version`）の受け取り方。**3版で同じ**（spec/conformance/dsl_version.json が正）。
//
// ここは**公開すると直せなくなる**決めごとなので、公開の前に決める。いちばん怖いのは
// 「知らない版を黙って今の版として読む」ことで、将来 2.0 を出したとき、世に出た 1.x の
// 道具が 2.0 の定義を**画面は出るのに意味が違う**形で読む。しかも読めてしまうので、
// 誰も気づけない。だから知らない major は**落とす**（警告にしない＝警告は読まれない）。
//
// 決めごと4つ:
//   ・**知らない major は落とす。** 通すと黙って別の意味で読む
//   ・**同じ major の新しい minor は読んで警告する。** minor は「足すだけ」と決めて
//     いるので、読める所までは読める。読めないキーは strict の担当（二重に言わない）
//   ・**形が違うものは推し量らない。** `1` を `1.0` と読むと、次に `1` の意味を
//     決められなくなる。前後の空白も削らない（黙って削ると、削ったことを誰も知らない）
//   ・**書いていないのは通す。** 既定は現在の版。ここを落とすと、既にある定義が
//     全部落ちて誰も上げられない

import { kDslVersion } from "./definition.js";

/** 判定の印。文面は版ごとの言葉でよいが、**印は3版で一致する**。 */
export type DslVersionKind =
  | "default"
  | "same"
  | "older-minor"
  | "newer-minor"
  | "unknown-major"
  | "malformed";

/** 判定1つ。 */
export interface DslVersionVerdict {
  /** 読んだ結果の版（落とすときも、書いてあった字をそのまま持つ）。 */
  version: string;
  kind: DslVersionKind;
  /** 解析を落とすか。 */
  fatal: boolean;
  /** 通すが1件言うか（`dsl-version-newer`）。 */
  warn: boolean;
}

const FORM = /^[0-9]+\.[0-9]+$/;

const parts = (v: string): [number, number] => {
  const [major, minor] = v.split(".");
  return [Number(major), Number(minor)];
};

/** この実装が読める版。 */
export const [kDslMajor, kDslMinor] = parts(kDslVersion);

/**
 * `dsl_version` に書いてあった字（無ければ `undefined`）を判定する。
 *
 * **落とすかどうかは呼び出し側が決める**（解析は例外、検証は警告、という形が違うだけで
 * 判定は1つ）。
 */
export function checkDslVersion(raw: string | undefined): DslVersionVerdict {
  if (raw === undefined) {
    return { version: kDslVersion, kind: "default", fatal: false, warn: false };
  }
  if (!FORM.test(raw)) {
    return { version: raw, kind: "malformed", fatal: true, warn: false };
  }
  const [major, minor] = parts(raw);
  if (major !== kDslMajor) {
    return { version: raw, kind: "unknown-major", fatal: true, warn: false };
  }
  if (minor > kDslMinor) {
    return { version: raw, kind: "newer-minor", fatal: false, warn: true };
  }
  return {
    version: raw,
    kind: minor === kDslMinor ? "same" : "older-minor",
    fatal: false,
    warn: false,
  };
}

/** 落とすときの文（解析のエラーに乗せる。3版で同じことを言う）。 */
export function dslVersionMessage(verdict: DslVersionVerdict): string {
  if (verdict.kind === "unknown-major") {
    return (
      `dsl_version "${verdict.version}" はこの版では読めません` +
      `（読めるのは ${kDslMajor}.x）。` +
      "別の版の定義を今の版として読むと、画面は出るのに意味が変わります。"
    );
  }
  return (
    `dsl_version "${verdict.version}" の書き方が違います` +
    `（"${kDslMajor}.${kDslMinor}" のように <major>.<minor> で書いてください）。`
  );
}
