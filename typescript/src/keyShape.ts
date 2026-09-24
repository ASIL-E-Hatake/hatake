// **形が違う値**を言う（`key-wrong-shape`）。
//
// 綴りが合っている知らないキーは strict が落とす。けれど**綴りが合っているキーに、
// 形の違う値を書いた**ときは、解析器が「読める形か」を見て黙って捨てる＝
// **書いたのに一度も効かない**。`{ type: pattern, value: ... }` と同じ事故で、
// こちらのほうが見つけにくい（キー名は正しいので、目で読んでも気づけない）。
//
// 実際に踏んだのはこれ:
//
//   optionsFrom:            # ← 親の項目名（文字列）を書く所
//     repository: departmentRepository
//     value: departmentCode
//     label: departmentName
//
// 正しくは `optionsSource`。**検証は exit 0**、画面は出て、選択肢だけが空になる。
//
// 見るのは**形が一意に決まるキーだけ**。`value`（検証は数値・カードは object）のように
// 場所で形が変わるキーは見ない＝当てにいって外すくらいなら言わない。

/** 期待する形。 */
type Shape = "string" | "list" | "map" | "number-or-map" | "string-or-list";

interface Expected {
  shape: Shape;
  /** 何を書く所か（人の言葉で）。 */
  what: string;
  /** 形を間違えたときに、たいてい書きたかったもの。 */
  instead?: string;
  /** そう書きたくなる理由が分かっているときの、一言。 */
  note?: string;
}

/**
 * 形が一意に決まるキー。
 *
 * **ここに足すときの線引き**: 定義のどこに出てきても形が同じキーだけ。入れなかった例:
 *
 *   ・`columns` … `layout.columns`（数）と `table.columns`（並び）で形が違う
 *   ・`filters` … `search.filters`（並び）とダッシュボードのカードの
 *     `filters: { status: 未出荷 }`（入れ子）で形が違う
 *   ・`value` … 検証の `value`（数や文字）とカードの `value`（入れ子）で形が違う
 *
 * 当てにいって外すくらいなら言わない＝**言われたら必ず直す所**にしておく。
 */
const EXPECTED: Record<string, Expected> = {
  key: {
    shape: "string-or-list",
    what: "1件を指す項目の名前（複合キーなら並び）",
    // 0.9.7 から並びも取る。入れ子を書く人は `{ fields: [...] }` のつもりでいる。
    note:
      "複合キーは**項目名を並べて**書きます（`key: [orderNo, lineNo]`）。" +
      "並べた順は URL の道の順になるので、並べ替えると別の1件を指します。",
  },
  optionsFrom: {
    shape: "string",
    what: "連動する親の項目名",
    instead: "optionsSource",
  },
  optionsSource: { shape: "map", what: "選択肢の出どころ（Repository と項目）" },
  optionsOf: { shape: "string", what: "アプリに書いた語彙の名前" },
  of: {
    shape: "string",
    what: "行のどの値を畳むか（項目名ひとつ）",
    // 並びを書く人は、まず間違いなく「同じレコードの複数項目を足す」つもりでいる。
    note:
      "**同じレコードの項目をまとめて足す**なら `of` ではなく `fields` です"
      + "（`of` は明細の行を畳むときに、行のどの値を見るかを言う所）。",
  },
  vocabularies: { shape: "list", what: "アプリ全体の語彙の並び" },
  options: { shape: "list", what: "選択肢の並び" },
  roles: { shape: "list", what: "見てよい役割の並び" },
  validators: { shape: "list", what: "検証の並び" },
  normalize: { shape: "list", what: "入力の整え方の並び" },
  rowActions: { shape: "list", what: "行のボタン id の並び" },
  actions: { shape: "list", what: "ボタンの並び" },
  sections: { shape: "list", what: "入力枠の並び" },
  steps: { shape: "list", what: "ステップの並び" },
  pages: { shape: "list", what: "画面の並び" },
  menu: { shape: "list", what: "メニューの並び" },
  totals: { shape: "list", what: "帳票の合計の並び" },
  groupBy: { shape: "list", what: "帳票のグループの並び" },
  search: { shape: "map", what: "検索エリア" },
  table: { shape: "map", what: "一覧" },
  form: { shape: "map", what: "入力" },
  report: { shape: "map", what: "帳票の紙の作り" },
  paper: { shape: "map", what: "用紙" },
  layout: { shape: "map", what: "並べ方" },
  pagination: { shape: "map", what: "ページ送り" },
  computed: { shape: "map", what: "計算のしかた" },
  confirm: { shape: "map", what: "押す前の確認" },
  onSuccess: { shape: "map", what: "終わったときの知らせ" },
  onError: { shape: "map", what: "失敗したときの知らせ" },
  params: { shape: "map", what: "渡す値" },
  chart: { shape: "map", what: "グラフの作り" },
  visibleWhen: { shape: "map", what: "出す条件" },
  enabledWhen: { shape: "map", what: "触れる条件" },
  readOnlyWhen: { shape: "map", what: "読み取りにする条件" },
  requiredWhen: { shape: "map", what: "必須にする条件" },
  byRole: { shape: "map", what: "役割ごとの上限" },
  maxRows: { shape: "number-or-map", what: "1回で動かせる行数" },
};

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 書いてある値の形（人に見せる言い方）。 */
function shapeOf(value: unknown): string {
  if (Array.isArray(value)) return "並び";
  if (isDict(value)) return "入れ子";
  if (typeof value === "number") return "数";
  if (typeof value === "boolean") return "真偽";
  return "文字";
}

function fits(value: unknown, shape: Shape): boolean {
  switch (shape) {
    case "string":
      return typeof value === "string";
    case "list":
      return Array.isArray(value);
    case "map":
      return isDict(value);
    case "number-or-map":
      return typeof value === "number" || isDict(value);
    case "string-or-list":
      return typeof value === "string" || Array.isArray(value);
  }
}

const WANTED: Record<Shape, string> = {
  string: "文字",
  list: "並び",
  map: "入れ子",
  "number-or-map": "数か入れ子",
  "string-or-list": "文字か並び",
};

/** 見つけた1件。`warnings.ts` がこれを警告に変える。 */
export interface WrongShape {
  path: string;
  key: string;
  what: string;
  wanted: string;
  wrote: string;
  instead?: string;
  note?: string;
}

/**
 * 定義を端から端まで歩いて、形の違う値を集める。
 *
 * 解析済みのモデルではなく**素の定義**を見る（解析器はもう捨てたあとなので、
 * モデルを見ても「書いてあったのに消えた」は分からない）。
 */
export function findWrongShapes(document: Dict): WrongShape[] {
  const found: WrongShape[] = [];
  walk(document, "", found);
  return found;
}

function walk(node: unknown, path: string, found: WrongShape[]): void {
  if (Array.isArray(node)) {
    node.forEach((one, index) => walk(one, `${path}[${index}]`, found));
    return;
  }
  if (!isDict(node)) return;
  for (const [key, value] of Object.entries(node)) {
    const here = path === "" ? key : `${path}.${key}`;
    const expected = EXPECTED[key];
    if (expected !== undefined && value !== null && value !== undefined
      && !fits(value, expected.shape)) {
      found.push({
        path: here,
        key,
        what: expected.what,
        wanted: WANTED[expected.shape],
        wrote: shapeOf(value),
        ...(expected.instead === undefined ? {} : { instead: expected.instead }),
        ...(expected.note === undefined ? {} : { note: expected.note }),
      });
      // 中は見ない（形が違う時点で、この枝は解析器に届いていない）。
      continue;
    }
    walk(value, here, found);
  }
}
