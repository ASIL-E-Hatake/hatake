// 名前を変えた先も辿る（`hatake ask <定義> --impact <前>:<後>`）。
//
// 「その項目を触るとどこが壊れるか」は辿れるようになった（[impactOf]）。そのあと必ず
// 来るのが**「じゃあ直して」**で、そこは今も人が10箇所を手で書き換えている。列・絞り
// 込み・入力欄・計算の元・条件・遷移のパラメータ・帳票の合計と、同じ名前が定義の中に
// 散っているので、1つ忘れると**画面は出るのにそこだけ空になる**（しかも落ちない）。
//
// 辿る材料は定義に全部ある＝書き換えも機械の仕事。ただし**当てない**:
//
//   ・出すのは**下書き**（既定は標準出力、`--write` で上書き）。`fix` と同じ立場。
//   ・**定義の外は触らない**（サーバがその名前で返している項目・試験・アプリ側の
//     ハンドラ）。見えないものを直したふりをするのが一番まずいので、毎回そう言う。
//   ・**文言の中の同じ言葉は触らない**（ラベル「単価」や確認の文は業務の言葉で、
//     項目名とは別物）。差し込み（`$row.<項目名>`）だけは項目名なので直す。
//   ・**新しい名前が既に使われていたら止める**（衝突を黙って作ると、2つの項目が
//     1つに潰れて、どちらの値が出るか定義から読めなくなる）。
//
// 書き換える場所は [Impact.at]（**構造の道**）から取り、`yamlSpans` に渡す＝道の文字を
// 読み解かない。切り貼りは元の文字列に対してだけ行うので、コメントも折り返しも空白も
// そのまま残る（差分が読める）。

import { parseDocument } from "yaml";
import { type Impact, impactOf, nameExists } from "./questionImpact.js";
import { type Path } from "./shrink.js";
import { applySpans, itemSpanAt, type Span, valueSpanAt } from "./yamlSpans.js";

type Dict = Record<string, unknown>;

/** 書き換えた1か所。 */
export interface RenameChange {
  /** どの画面か。 */
  page?: string;
  /** 定義の道（人が開く所）。 */
  path: string;
  kind: Impact["kind"];
  /** そこに入れた字（差し込みは `$row.<新しい名前>`）。 */
  text: string;
}

/** 書き換えられなかった1か所（**黙って飛ばさない**）。 */
export interface RenameMiss {
  path: string;
  why: string;
}

export interface RenameResult {
  before: string;
  after: string;
  /** 書き換えた下書き（`--write` で上書きする中身）。 */
  source: string;
  changes: RenameChange[];
  /** 場所を指せなかった所（在れば、下書きは**不完全**）。 */
  missed: RenameMiss[];
}

export class RenameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenameError";
  }
}

/**
 * 名前を変えた下書きを作る。
 *
 * [document] は素の map（`impactOf` と同じもの）。[source] はその元の文字列で、
 * 書き換えるのはこちら（解析後のモデルから書き戻すと、全体が整形されて差分が読めない）。
 */
export function renameDraft(
  source: string,
  document: Dict,
  before: string,
  after: string,
): RenameResult {
  if (before === after) {
    throw new RenameError("前と後が同じ名前です（書き換える所がありません）。");
  }
  if (!/^[A-Za-z_][\w]*$/.test(after)) {
    throw new RenameError(
      `"${after}" は項目名に使えません（英字か _ で始まる英数字＝定義の命名に合わせて` +
        "ください）。`hatake project` に案件の決めごとが在れば、そこに従います。",
    );
  }
  const found = impactOf(document, before);
  if (found.length === 0) {
    throw new RenameError(
      `"${before}" は定義のどこにも出てきません（**影響が無い、ではありません**＝` +
        "名前が違うのかもしれません)。`hatake explain <定義>` で項目名を確かめてください。",
    );
  }
  // 衝突を黙って作らない。2つの項目が1つに潰れると、どちらの値が出るかは定義から
  // 読めなくなる（画面は出るので、気づくのは動かしたあと）。
  if (nameExists(document, after)) {
    throw new RenameError(
      `"${after}" はこの定義でもう使われています（衝突を黙って作りません）。` +
        `別の名前にするか、先に "${after}" の側を整理してください` +
        `（\`hatake ask <定義> --impact ${after}\` でその名前の在り所が出ます）。`,
    );
  }

  const parsed = parseDocument(source);
  const edits: { at: Span; text: string }[] = [];
  const changes: RenameChange[] = [];
  const missed: RenameMiss[] = [];
  for (const one of found) {
    const text = one.kind === "param" ? `$row.${after}` : after;
    const span = spanOf(parsed, one.at);
    if (span === null) {
      missed.push({
        path: one.path,
        why: "その場所を元の文字列の中で指せませんでした（**手で直してください**）",
      });
      continue;
    }
    edits.push({ at: span, text });
    changes.push({
      ...(one.page === undefined ? {} : { page: one.page }),
      path: one.path,
      kind: one.kind,
      text,
    });
  }
  return { before, after, source: applySpans(source, edits), changes, missed };
}

/**
 * その道が指す**書き換える範囲**。
 *
 * 道の最後が数値なら配列の要素そのもの（`groupBy[0]` / `computed.fields[1]`）、
 * 文字列ならキーの値（`field: price` の `price`）。**この判断は構造でできる**ので、
 * 道の文字を割らない。
 */
function spanOf(
  parsed: ReturnType<typeof parseDocument>,
  at: Path,
): Span | null {
  const last = at[at.length - 1];
  return typeof last === "number" ? itemSpanAt(parsed, at) : valueSpanAt(parsed, at);
}

/** 人が読む形。 */
export function renameLines(result: RenameResult): string[] {
  const out = [
    `"${result.before}" → "${result.after}" の下書きを作りました` +
      `（${result.changes.length} か所）。`,
  ];
  for (const one of result.changes) {
    out.push(
      `  ${one.page === undefined ? "" : `${one.page}: `}${one.path}` +
        ` … ${one.text}`,
    );
  }
  if (result.missed.length > 0) {
    out.push("");
    out.push("**書き換えられなかった所**（この下書きは不完全です）:");
    for (const one of result.missed) out.push(`  ${one.path} … ${one.why}`);
  }
  out.push("");
  out.push(RENAME_NOTE);
  return out;
}

/** この下書きに言えないことを毎回書く。 */
export const RENAME_NOTE =
  "※ これは**下書き**です（`--write` で上書き、`--out` で別の場所へ）。" +
  "書き換えたのは**この定義の中で項目名として書いてある所**だけです＝" +
  "ラベル・確認の文・エラーの文言に同じ言葉が出てきても触っていません" +
  "（あちらは業務の言葉で、項目名とは別物）。差し込み（$row.<項目名>）は直します。" +
  "**定義の外は直していません**＝サーバがその名前で返している項目・アプリ側の" +
  "ハンドラ・試験は見えないので、そちらは人が一緒に直してください。";
