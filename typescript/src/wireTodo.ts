// 足した登録を「次の1往復で渡す形」にする（`wire --merge --todo`）。
//
// なぜ要るか: `wire --merge` が足した直後は**全部 TODO**（中身は業務か環境なので機械には
// 決められない）。足したことは標準エラーに1行出ていたが、それは「何をしたか」の報告で、
// **誰が何を埋めるのか**の一覧ではない。埋め忘れは動かして初めて分かるので、足した時点で
// 渡せる形にしておく（`fix --todo` と同じ立場）。
//
// 決めごと:
//   ・**書くものの言葉は、出したコードと同じ1か所から取る**（[WireKind.todo]）。別に
//     持つと、コードには「検証の中身」と書いてあるのに一覧には別のことが書いてある。
//   ・**行番号を付ける**（足した所を人が探さなくていい）。ただし書き出していないときは
//     「まだ書いていない」と言う＝在りもしないファイルの行を指さない。
//   ・**埋めるまで何が起きるか**を1件ごとに書く。TODO は `UnimplementedError` なので
//     「黙って何もしない」ではなく落ちる。そこが分からないと優先度が付けられない。

import { WIRE_KINDS, WIRE_SINKS } from "./wireKinds.js";
import type { WireMergeResult } from "./wireMerge.js";

/** 埋める仕事1件。 */
export interface WireTodoItem {
  /** Dart の引数名（`actions` / `formatters` …）。 */
  field: string;
  /** 登録の名前（sink は引数名そのもの）。 */
  name: string;
  /** 埋める人が書くもの（1行）。 */
  todo: string;
  /** 足したコードの中の行（1 始まり）。書き出していなければ undefined。 */
  line?: number;
}

export interface WireTodo {
  /** 足した数（＝残っている仕事の数）。 */
  added: number;
  items: WireTodoItem[];
  /** 書き出した先（渡す相手が開くファイル）。 */
  file?: string;
  /** 定義が要求していないのに書いてあるもの。**消していない**（言うだけ）。 */
  leftover: Record<string, string[]>;
  /** 触らなかった所と理由。 */
  untouched: string[];
}

/** その引数名で埋める人が書くもの（見つからなければ「中身」）。 */
function todoFor(field: string): string {
  const kind = WIRE_KINDS.find((one) => one.field === field);
  if (kind !== undefined) return kind.todo;
  return WIRE_SINKS[field]?.todo ?? "中身";
}

/** 足した行の位置（`'name': …` の行、sink は `field:` の行）。 */
function lineOf(code: string, field: string, name: string): number | undefined {
  const needle = field === name ? `${name}:` : `'${name}':`;
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith(needle)) return i + 1;
  }
  return undefined;
}

/**
 * 足したものを、埋める人に渡す形に開く。
 *
 * [file] は書き出した先。渡さなければ行番号を付けない（標準出力に出しただけのコードの
 * 行を指すと、開く所が無い）。
 */
export function wireTodo(result: WireMergeResult, file?: string): WireTodo {
  const items: WireTodoItem[] = [];
  for (const [field, names] of Object.entries(result.added)) {
    for (const name of names) {
      items.push({
        field,
        name,
        todo: todoFor(field),
        ...(file === undefined
          ? {}
          : { line: lineOf(result.code, field, name) }),
      });
    }
  }
  for (const field of result.created) {
    // まるごと足した登録は、中の名前も `added` に入っている（sink だけが引数名そのもの）。
    if (WIRE_SINKS[field] === undefined) continue;
    items.push({
      field,
      name: field,
      todo: todoFor(field),
      ...(file === undefined ? {} : { line: lineOf(result.code, field, field) }),
    });
  }
  return {
    added: items.length,
    items,
    ...(file === undefined ? {} : { file }),
    leftover: result.leftover,
    untouched: result.untouched,
  };
}

/** 人が読む形（そのまま次の1往復に渡せる文章）。 */
export function renderWireTodo(todo: WireTodo): string {
  const out: string[] = [];
  if (todo.added === 0) {
    out.push("足すものはありませんでした（1バイトも変えていません）。");
    out.push(
      "いま TODO のまま残っているものは hatake refs --filled で数えられます" +
        "（足した所と、前に足して埋めていない所は別の話）。",
    );
    return out.join("\n");
  }
  out.push(
    `機械が ${todo.added} か所を足しました（**場所はもう探さなくていい**）。` +
      "残っているのは中身です。",
  );
  out.push(
    `${todo.added} 件、どれも**業務か環境**なので機械には決められません` +
      "（何をするかは業務、どう繋ぐかは環境）。",
  );
  todo.items.forEach((item, i) => {
    const where =
      item.line === undefined
        ? ""
        : `  ${todo.file}:${item.line}`;
    out.push("");
    out.push(`${i + 1}. ${item.field}/${item.name}${where}`);
    out.push(`   書くもの: ${item.todo}`);
    out.push(
      "   埋めるまで: そこを通ると UnimplementedError で落ちます" +
        "（黙って何もしない、にはなりません）",
    );
  });
  if (todo.file === undefined) {
    out.push("");
    out.push(
      "※ 足したコードは書き出していません（--write で上書き、--out で別の場所へ）。" +
        "行番号もそのときに付きます。",
    );
  }
  const leftover = Object.entries(todo.leftover);
  if (leftover.length > 0) {
    out.push("");
    out.push("定義が要求していないのに書いてあるもの（**消していません**）:");
    for (const [field, names] of leftover) {
      out.push(`  ${field}: ${names.join(" / ")}`);
    }
  }
  out.push("");
  out.push(
    `この ${todo.added} 件だけを埋めてください。**ほかの所は触らないこと**` +
      "（手で埋めた中身は1バイトも変えていません）。" +
      "埋まったかどうかは hatake refs --filled --source <実装> で数えられます。",
  );
  return out.join("\n");
}
