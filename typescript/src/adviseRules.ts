// 助言の物差し（どこまでを「書き足したほうがいい」と言うか）を外から渡す。
//
// 助言は**好み**なので、会社と案件で変わる。固定の表しか持たないと「うちの決めごとと合わない
// から使わない」で終わる。そこで3つだけ外から渡せるようにした:
//
//   1. 切る … 合わない規則を止める（`off`）
//   2. 目盛りを変える … 組み込みの規則が持っているつまみだけ（`options`）
//   3. 足す … 案件の決めごとを「この場所には必ずこのキーを書く」の形で（`require`）
//
// 3 は**規則を書くための言語にしない**。条件式を書けるようにすると、そこから先は
// 「助言の設定ファイル」ではなく小さなプログラムになり、読める人が減る。書けるのは
// 「どの場所の・どのキーが・書かれているか」だけ。
//
// 知らないキー・知らない規則名は**エラーにする**（DSL の strict と同じ考え方）。設定は
// 黙って効かないのが一番まずい＝止めたつもりの規則が動き続け、足したつもりの決めごとは
// 誰も見ていない、が起きる。

/** 組み込みの規則と、その規則が持っているつまみ。ここが規則名の正。 */
export const BUILTIN_RULES: Record<string, Record<string, "number" | "strings">> = {
  // 並べ替えできる列が1つも無い。minColumns = 何本以上あるときに言うか。
  "no-sortable-column": { minColumns: "number" },
  // 絞り込みが1つも無い。minColumns = 一覧が何本以上のときに言うか。
  "no-search-filter": { minColumns: "number" },
  // 1件を指すキーが一覧に出ていない。
  "key-not-in-table": {},
  // 入力できるのに必須が1つも無い。
  "no-required-field": {},
  // 消せる・持ち出せるのに roles が無い。types = 危ないと見なすアクション種別。
  // 「選んだ行にまとめて実行する」ボタン（scope: selection）は型に関わらず危ない側。
  "open-dangerous-action": { types: "strings" },
  // まとめて実行するのに、押す前の確認が無い（`prompt` を書いてあれば聞いている側）。
  "bulk-without-confirm": {},
  // 確認は出すのに、何件動くのかを言っていない（`{count}` は一括で埋まる）。
  "bulk-confirm-without-count": {},
  // 一括なのに、失敗したときの言い方が無い（一括は途中まで進んで終わる）。
  "bulk-without-error-message": {},
  // 消す側の一括なのに、確認の OK が赤くない。words = 戻せないと見なす語。
  "bulk-destructive-without-danger": {"words": "strings"},
  // 一括があるのに、1回で動く件数が決まっていない（または多い）。maxRows = 上限。
  "bulk-on-many-rows": {"maxRows": "number"},
  // 待たせるのに区切り（batchSize）が無い。rows = 何件動くなら言うか。
  "bulk-without-batchsize": {"rows": "number"},
  // 金額らしい名前なのに見せ方が無い。words = 金額らしいと見なす語。
  "money-without-format": { words: "strings" },
  // 明細を別テーブルに持つのに親を指すキーが無い。
  "subtable-without-parent-key": {},
  // 帳票なのに合計が無い。
  "report-without-totals": {},
  // 「開始 ≤ 終了」の組が居るのに、向きを縛っていない。
  // startWords / endWords = 対になっていると見なす語。
  "dates-without-compare": { startWords: "strings", endWords: "strings" },
  // 合計を手で入れられるのに、明細の和と突き合わせていない。words = 合計らしい語。
  "total-without-compare": { words: "strings" },
};

/** 「この場所には必ずこのキーを書く」＝案件ごとの決めごと1つ。 */
export interface RequireRule {
  /** 規則名（報告に出る。組み込みと同じ名前は付けられない）。 */
  rule: string;
  /** どの場所を見るか。 */
  node: RequireNode;
  /** そこに書かれていてほしいキー。 */
  key: string;
  /** そのページ種別だけを見る（省略すると全部）。 */
  pages?: string[];
  /** その場所の値で絞る（`{ type: delete }` で削除ボタンだけ）。 */
  when?: Record<string, string | number | boolean>;
  /** true = その場所の全部に要る / false（既定）= 1つでもあればよい。 */
  every?: boolean;
  /** 何が不便か（省略すると決めごとであることだけを言う）。 */
  says?: string;
  /** 何を書き足すか。 */
  add?: string;
}

/** `require` が見られる場所。増やすときは [nodesOf] も足す。 */
export type RequireNode = "page" | "column" | "filter" | "field" | "action";

const REQUIRE_NODES: RequireNode[] = ["page", "column", "filter", "field", "action"];

/** 物差し1式。 */
export interface AdviceRules {
  /** 止める規則名（組み込み・`require` のどちらも）。 */
  off: string[];
  /** 組み込みの規則のつまみ。 */
  options: Record<string, Record<string, unknown>>;
  /** 案件ごとの決めごと。 */
  require: RequireRule[];
}

/** 何も渡さなかったときの物差し（組み込みの規則を既定のつまみで全部使う）。 */
export const DEFAULT_RULES: AdviceRules = { off: [], options: {}, require: [] };

const isDict = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

class RulesError extends Error {}

/**
 * 物差しの読み方を間違えたときは、直し方まで言って落ちる。
 *
 * 変数に型を書いてあるのは、これを呼んだ先で「もう通らない」と TypeScript に伝えるため
 * （注釈が無いと never が効かず、この下で null の可能性が残る）。
 */
const bad: (message: string) => never = (message) => {
  throw new RulesError(`助言の物差しが読めません: ${message}`);
};

/** 上の階層で書けるキー（ここに無いキーは綴り違いとして落とす）。 */
const TOP_KEYS = new Set(["$comment", "off", "options", "require"]);

const REQUIRE_KEYS = new Set([
  "rule",
  "node",
  "key",
  "pages",
  "when",
  "every",
  "says",
  "add",
]);

/**
 * 物差しを読む（JSON を [AdviceRules] にする）。
 *
 * 通らないものは全部エラー。`off` に知らない規則名を書いてあるのも、`options` に知らない
 * つまみを書いてあるのもエラーにする＝**設定したのに効かない**を作らない。
 */
export function parseAdviceRules(value: unknown): AdviceRules {
  if (!isDict(value)) bad("上は map（{ ... }）で書いてください。");
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!TOP_KEYS.has(key)) {
      bad(`知らないキー "${key}"（書けるのは ${[...TOP_KEYS].join(" / ")}）。`);
    }
  }

  const require = requireRules(raw.require);
  const names = new Set([...Object.keys(BUILTIN_RULES), ...require.map((r) => r.rule)]);

  const off = strings(raw.off, "off");
  for (const name of off) {
    if (!names.has(name)) {
      bad(`off の "${name}" は規則名ではありません（規則: ${[...names].join(" / ")}）。`);
    }
  }

  const options: Record<string, Record<string, unknown>> = {};
  if (raw.options !== undefined) {
    if (!isDict(raw.options)) bad("options は map で書いてください。");
    for (const [name, tuning] of Object.entries(raw.options)) {
      const knobs = BUILTIN_RULES[name];
      if (knobs === undefined) {
        bad(
          `options の "${name}" は組み込みの規則ではありません` +
            `（つまみがあるのは ${Object.entries(BUILTIN_RULES)
              .filter(([, one]) => Object.keys(one).length > 0)
              .map(([one]) => one)
              .join(" / ")}）。`,
        );
      }
      if (!isDict(tuning)) bad(`options.${name} は map で書いてください。`);
      const checked: Record<string, unknown> = {};
      for (const [knob, given] of Object.entries(tuning as Record<string, unknown>)) {
        const type = knobs[knob];
        if (type === undefined) {
          bad(
            `options.${name} に知らないつまみ "${knob}"` +
              `（${name} のつまみ: ${Object.keys(knobs).join(" / ") || "無し"}）。`,
          );
        }
        checked[knob] =
          type === "number"
            ? number(given, `options.${name}.${knob}`)
            : strings(given, `options.${name}.${knob}`);
      }
      options[name] = checked;
    }
  }

  return { off, options, require };
}

function requireRules(value: unknown): RequireRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) bad("require は配列で書いてください。");
  const seen = new Set<string>();
  return (value as unknown[]).map((one, index) => {
    const where = `require[${index}]`;
    if (!isDict(one)) return bad(`${where} は map で書いてください。`);
    for (const key of Object.keys(one)) {
      if (!REQUIRE_KEYS.has(key)) {
        bad(`${where} に知らないキー "${key}"（書けるのは ${[...REQUIRE_KEYS].join(" / ")}）。`);
      }
    }
    const rule = text(one.rule, `${where}.rule`);
    if (BUILTIN_RULES[rule] !== undefined) {
      bad(`${where}.rule "${rule}" は組み込みの規則名です（別の名前を付けてください）。`);
    }
    if (seen.has(rule)) bad(`${where}.rule "${rule}" が2回出てきます。`);
    seen.add(rule);
    const node = text(one.node, `${where}.node`) as RequireNode;
    if (!REQUIRE_NODES.includes(node)) {
      bad(`${where}.node "${node}" は見られる場所ではありません（${REQUIRE_NODES.join(" / ")}）。`);
    }
    if (one.when !== undefined && !isDict(one.when)) {
      bad(`${where}.when は map（{ type: delete } のような値の指定）で書いてください。`);
    }
    if (one.every !== undefined && typeof one.every !== "boolean") {
      bad(`${where}.every は true か false で書いてください。`);
    }
    return {
      rule,
      node,
      key: text(one.key, `${where}.key`),
      ...(one.pages === undefined ? {} : { pages: strings(one.pages, `${where}.pages`) }),
      ...(one.when === undefined
        ? {}
        : { when: one.when as Record<string, string | number | boolean> }),
      ...(one.every === undefined ? {} : { every: one.every as boolean }),
      ...(one.says === undefined ? {} : { says: text(one.says, `${where}.says`) }),
      ...(one.add === undefined ? {} : { add: text(one.add, `${where}.add`) }),
    };
  });
}

const text = (value: unknown, where: string): string =>
  typeof value === "string" && value !== "" ? value : bad(`${where} は文字で書いてください。`);

const number = (value: unknown, where: string): number =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : bad(`${where} は数で書いてください。`);

function strings(value: unknown, where: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((one) => typeof one !== "string")) {
    bad(`${where} は文字の配列で書いてください。`);
  }
  return value as string[];
}

/** つまみを引く（渡っていなければ既定値）。 */
export function knob<T>(rules: AdviceRules, rule: string, name: string, fallback: T): T {
  const given = rules.options[rule]?.[name];
  return given === undefined ? fallback : (given as T);
}

/** その規則を使うか。 */
export const enabled = (rules: AdviceRules, rule: string): boolean =>
  !rules.off.includes(rule);
