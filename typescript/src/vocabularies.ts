// **アプリ全体の語彙**（`app.vocabularies`）を、書いてある所へ展開する。
//
// 業務のコード表（`shipped` → 出荷済）は、一覧・検索・詳細・帳票と**同じものが
// 何度も出てきます**。見本2本を数えたら、同じ並びを 3回・2回・3回 書いていました。
// 片方だけ直すと画面ごとに違う字が出て、しかも**直すまで誰も気づきません**。
//
// だから語彙は1か所に書いて、使う所は名前で指します:
//
//   app:
//     vocabularies:
//       - name: orderStatus
//         options:
//           - { value: draft,   label: 作成中 }
//           - { value: shipped, label: 出荷済 }
//     pages:
//       - table:
//           columns:
//             - { field: status, label: 受注状態, optionsOf: orderStatus }
//
// **解決は読み込み時**です。`optionsOf: X` を読んだ時点で実体の並びに置き換えるので、
// Renderer も CSV も紙も、この仕組みを知らないまま正しく動きます（1か所で解けば
// いいものを、使う側の数だけ実装しない）。
//
// 順番は1つだけ決めてあります: **その場に書いた `options` が勝つ**。
// 両方書いてあるのは書き間違いなので、検証が `vocabulary-shadowed` で言います。

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `optionsOf` を書ける所。**値を入れる所と、値を見せる所**。 */
export const OPTIONS_OF_NODES = ["field", "filter", "column"] as const;

/** 1つの語彙（名前と、その並び）。 */
export interface Vocabulary {
  name: string;
  options: unknown[];
}

/**
 * `app.vocabularies` を名前で引ける形にする。
 *
 * 同じ名前が2回書いてあれば**先に書いたほうが残る**（後勝ちにすると、
 * 遠くに足した1行で既にある画面の字が変わってしまう）。重なりは検証が言う。
 */
export function vocabulariesOf(document: Dict): Map<string, unknown[]> {
  const app = isDict(document.app) ? document.app : document;
  const raw = Array.isArray(app.vocabularies) ? app.vocabularies : [];
  const found = new Map<string, unknown[]>();
  for (const one of raw) {
    if (!isDict(one)) continue;
    const name = typeof one.name === "string" ? one.name : undefined;
    if (name === undefined || found.has(name)) continue;
    found.set(name, Array.isArray(one.options) ? one.options : []);
  }
  return found;
}

/**
 * `optionsOf` を実体の並びに置き換えた定義を返す（**元は変えない**）。
 *
 * 引けなかった名前は**そのまま残す**＝黙って空の並びを置かない。置いてしまうと
 * 「書いたのに効かない」が検証にも出なくなるので、名前を残して
 * `unknown-vocabulary` に拾わせる。
 */
export function expandVocabularies(document: Dict): Dict {
  const found = vocabulariesOf(document);
  if (found.size === 0) return document;
  return walk(document, found) as Dict;
}

function walk(node: unknown, found: Map<string, unknown[]>): unknown {
  if (Array.isArray(node)) return node.map((one) => walk(one, found));
  if (!isDict(node)) return node;

  const out: Dict = {};
  for (const [key, value] of Object.entries(node)) {
    out[key] = walk(value, found);
  }

  const name = typeof out.optionsOf === "string" ? out.optionsOf : undefined;
  if (name === undefined) return out;
  // その場に書いた並びが勝つ（両方書いてあるのは書き間違い）。
  if (Array.isArray(out.options)) return out;
  const options = found.get(name);
  if (options === undefined) return out;
  out.options = options;
  return out;
}
