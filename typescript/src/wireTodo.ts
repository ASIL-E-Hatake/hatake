// 埋める仕事を「次の1往復で渡す形」にする（`wire --merge --todo`）。
//
// なぜ要るか: `wire --merge` が足した直後は**全部 TODO**（中身は業務か環境なので機械には
// 決められない）。足したことは標準エラーに1行出ていたが、それは「何をしたか」の報告で、
// **誰が何を埋めるのか**の一覧ではない。埋め忘れは動かして初めて分かるので、足した時点で
// 渡せる形にしておく（`fix --todo` と同じ立場）。
//
// 渡すのは**足した所だけではない**。同じ配線には
//   ・前に足して**まだ TODO のまま**の所（動かすと落ちる）
//   ・目印は消えているが**本体が空**の所（`hollow`＝落ちないので気づけない）
// が残っている。`refs --filled` はこれを数えているのに、渡す一覧は「足した所」だけだった
// ＝**数と一覧が違う**。埋める人はそうなると数のほうを信用しなくなるので、同じ一覧に
// 混ぜる（状態は分けて言う。混ぜるのは一覧で、区別は消さない）。
//
// 決めごと:
//   ・**書くものの言葉は、出したコードと同じ1か所から取る**（[WireKind.todo]）。別に
//     持つと、コードには「検証の中身」と書いてあるのに一覧には別のことが書いてある。
//   ・**状態の言葉も、数える側と同じ1か所から取る**（[STATE_LABEL] / [STATE_WHY]）。
//   ・**行番号を付ける**（足した所を人が探さなくていい）。ただし書き出していないときは
//     「まだ書いていない」と言う＝在りもしないファイルの行を指さない。
//   ・**埋めるまで何が起きるか**を1件ごとに書く。足した所は `UnimplementedError` で
//     落ちるが、**中身が空の所は落ちない**。そこが分からないと優先度が付けられない。

import { scanRegistrations } from "./registryScan.js";
import { WIRE_KINDS, WIRE_SINKS } from "./wireKinds.js";
import type { WireMergeResult } from "./wireMerge.js";
import { STATE_LABEL, STATE_WHY } from "./wiringFilled.js";

/** その1件が今どうなっているか。 */
export type WireTodoState =
  /** いま機械が足した（中身は TODO）。 */
  | "added"
  /** 前から TODO のまま（足したのは前回以前）。 */
  | "pending"
  /** 目印は無いが本体が空（落ちないので気づけない）。 */
  | "hollow";

/** 埋める仕事1件。 */
export interface WireTodoItem {
  /** Dart の引数名（`actions` / `formatters` …）。 */
  field: string;
  /** 登録の名前（sink は引数名そのもの）。 */
  name: string;
  /** 埋める人が書くもの（1行）。 */
  todo: string;
  /** いまの状態（足した／前から TODO ／中身が空）。 */
  state: WireTodoState;
  /** 配線の中の行（1 始まり）。書き出していなければ undefined。 */
  line?: number;
}

export interface WireTodo {
  /** 足した数（**この回に機械が足した所**だけ）。 */
  added: number;
  /** 埋める仕事の数（足した所＋前から TODO ＋中身が空）。 */
  unfilled: number;
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

/** 走査が言う種類（`plugins`）を、配線の引数名（`actions`）に直す。 */
function fieldFor(kind: string, name: string): string | undefined {
  const found = WIRE_KINDS.find((one) => one.need === kind);
  if (found !== undefined) return found.field;
  // 出す口（sink）は名前がそのまま引数名。
  return WIRE_SINKS[name] === undefined ? undefined : name;
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
 * 埋める仕事に開く。
 *
 * [file] は書き出した先。渡さなければ行番号を付けない（標準出力に出しただけのコードの
 * 行を指すと、開く所が無い）。
 *
 * 足した所以外（前から TODO ／中身が空）は、**出したコードそのものを走査して**拾う
 * ＝渡された配線に何が残っているかは、`refs --filled` と同じ数え方で見る。
 */
export function wireTodo(result: WireMergeResult, file?: string): WireTodo {
  const items: WireTodoItem[] = [];
  const at = (field: string, name: string) =>
    file === undefined ? {} : { line: lineOf(result.code, field, name) };
  const seen = new Set<string>();
  const push = (field: string, name: string, state: WireTodoState) => {
    const key = `${field}/${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ field, name, todo: todoFor(field), state, ...at(field, name) });
  };

  for (const [field, names] of Object.entries(result.added)) {
    for (const name of names) push(field, name, "added");
  }
  for (const field of result.created) {
    // まるごと足した登録は、中の名前も `added` に入っている（sink だけが引数名そのもの）。
    if (WIRE_SINKS[field] === undefined) continue;
    push(field, field, "added");
  }
  // 足した所の**外**に残っている仕事（前から TODO ／中身が空）。
  const scan = scanRegistrations([{ path: file ?? "wiring", source: result.code }]);
  for (const site of scan.sites) {
    for (const [names, state] of [
      [site.pending, "pending"],
      [site.hollow, "hollow"],
    ] as [string[], WireTodoState][]) {
      for (const name of names) {
        const field = fieldFor(site.kind, name);
        if (field !== undefined) push(field, name, state);
      }
    }
  }

  return {
    added: items.filter((one) => one.state === "added").length,
    unfilled: items.length,
    items,
    ...(file === undefined ? {} : { file }),
    leftover: result.leftover,
    untouched: result.untouched,
  };
}

/** 状態1つぶんの言葉（数える側と同じ字＝[STATE_LABEL] / [STATE_WHY]）。 */
const SAYS: Record<WireTodoState, { label: string; why: string }> = {
  added: {
    label: "いま足した",
    why: "そこを通ると UnimplementedError で落ちます（黙って何もしない、にはなりません）",
  },
  pending: { label: STATE_LABEL.pending, why: STATE_WHY.pending },
  hollow: { label: STATE_LABEL.hollow, why: STATE_WHY.hollow },
};

/** 人が読む形（そのまま次の1往復に渡せる文章）。 */
export function renderWireTodo(todo: WireTodo): string {
  const out: string[] = [];
  const count = (state: WireTodoState): number =>
    todo.items.filter((one) => one.state === state).length;
  if (todo.unfilled === 0) {
    out.push(
      "埋める仕事はありません（足すものも、TODO のままの所も、中身が空の所も" +
        "ありませんでした）。",
    );
    out.push(
      "※ 「埋まっている」は**目印が残っていない**という意味です" +
        "（中身が業務として正しいかは見ていません）。",
    );
    return out.join("\n");
  }
  if (todo.added > 0) {
    out.push(
      `機械が ${todo.added} か所を足しました（**場所はもう探さなくていい**）。` +
        "残っているのは中身です。",
    );
  } else {
    out.push("足すものはありませんでした（1バイトも変えていません）。");
  }
  out.push(
    `埋める仕事は ${todo.unfilled} 件です` +
      `（いま足した ${todo.added}・TODO のまま ${count("pending")}・` +
      `中身が空 ${count("hollow")}）。` +
      "どれも**業務か環境**なので機械には決められません" +
      "（何をするかは業務、どう繋ぐかは環境）。",
  );
  todo.items.forEach((item, i) => {
    const where = item.line === undefined ? "" : `  ${todo.file}:${item.line}`;
    out.push("");
    out.push(`${i + 1}. ${item.field}/${item.name}   [${SAYS[item.state].label}]${where}`);
    out.push(`   書くもの: ${item.todo}`);
    out.push(`   埋めるまで: ${SAYS[item.state].why}`);
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
    `この ${todo.unfilled} 件だけを埋めてください。**ほかの所は触らないこと**` +
      "（手で埋めた中身は1バイトも変えていません）。" +
      "埋まったかどうかは hatake refs --filled --source <実装> で数えられます" +
      "（**この一覧と同じ数え方**です）。",
  );
  return out.join("\n");
}
