// 構造の間違いの静的検出。
//
// strict パースは「知らないキー」を弾く。スキーマは「型と必須」を見る。どちらも
// 通るのに**意図どおり動かない**定義がまだ書ける:
//   ・`rowActions: [approve]` … その id のアクションが無いので、ボタンが黙って出ない
//   ・`navigate` の行き先ページが無い … 押しても何も起きない
//   ・`groupBy` に `sort` が無い … グループが分裂して小計が何度も出る
//   ・条件で `between` … 条件は理解しないので、その項目が永久に出てこない
//   ・`sum` に `field` が無い … 集計が null になる
//   ・入口の権限が食い違っている … その画面を**開ける人が誰も居ない**
//   ・項目間の検証で相手の項目名を間違えた … その検証は**黙って通る**
// どれも**エラーにならず、画面を見ても気づきにくい**。だから警告として言う。
//
// 見るのは素の document（strict と同じ）。解析後のモデルでは、落とされた情報や
// 既定値で埋まった情報が見えなくなるものがあるので。

import { appAccess, describeAudience, nobodyCanOpen } from "./appAccess.js";
import { ConditionOperators } from "./conditionEvaluator.js";
import {
  ActionScopes,
  ActionTypes,
  AggregateOps,
  FieldTypes,
  ValidatorTypes,
} from "./definition.js";
import {
  builtInNames,
  collectRefs,
  type DefinitionRegistry,
  type RefKind,
} from "./refs.js";
import { paperName, paperSize } from "./papers.js";
import { closestKey } from "./strictKeys.js";
import { COMPARE_OPERATORS } from "./validators.js";

/** 構造の間違い1つ。`pitfall` があれば対照表（spec/pitfalls.json）を引ける。 */
export interface DefinitionWarning {
  /** 規則名。安定した識別子（機械で抑制・集計するため）。 */
  rule: string;
  /** 場所（`app.pages[2].table.rowActions[0]` のような道）。 */
  path: string;
  /** 何が起きるか。 */
  message: string;
  /** どう直すか。 */
  fix: string;
  /** 対応する対照表の id。 */
  pitfall?: string;
}

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

/** 組み込みの行アクション。宣言しなくても効く。 */
const BUILT_IN_ROW_ACTIONS = new Set(["edit", "delete"]);

/**
 * document の中の「通るけれど意図どおりに動かない」書き方を全部返す。
 * 並びは見つけた順（上から下）。
 */
export interface WarningOptions {
  /**
   * アプリ側で登録済みのものの一覧（Repository / プラグイン / 独自の型…）。
   * **渡したカテゴリだけ**が突き合わせの対象になる。渡さなければ「外との辻褄」は
   * 見ない＝定義の中だけで閉じた検査になる（今までと同じ）。
   */
  registry?: DefinitionRegistry;
}

export function findWarnings(
  document: Dict,
  options: WarningOptions = {},
): DefinitionWarning[] {
  const found: DefinitionWarning[] = [];
  const app = isDict(document.app) ? document.app : undefined;
  const page = isDict(document.page) ? document.page : undefined;
  // このアプリに出てくる役割名（`roles` に書いてあるものの全部）。役割名の綴り違いは
  // 「誰にも当てはまらない」形で静かに効かなくなるので、突き合わせる相手が要る。
  const appRoles = collectRoles(document);

  if (app !== undefined) {
    const pages = list(app.pages).filter(isDict);
    const pageIds = new Set(
      pages.map((p) => str(p.id)).filter((id): id is string => id !== undefined),
    );
    checkApp(app, pages, pageIds, found);
    checkAccess(document, pages, found);
    pages.forEach((p, i) =>
      checkPage(p, `app.pages[${i}]`, pageIds, found, appRoles),
    );
  }
  if (page !== undefined) {
    // 単票の定義では他のページを知らないので、遷移先の存在は確かめられない。
    checkPage(page, "page", null, found, appRoles);
  }
  if (options.registry !== undefined) {
    checkRegistry(document, options.registry, found);
  }
  return found;
}

/**
 * 定義のどこかに書いてある役割名を全部集める。
 *
 * `roles` は画面・ボタン・項目・列・メニューに書けるので、1つのノードだけ見ても
 * 役割の一覧にはならない。素の document を丸ごと歩く。
 */
function collectRoles(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const one of value) collectRoles(one, into);
    return into;
  }
  if (!isDict(value)) return into;
  for (const [key, child] of Object.entries(value)) {
    if (key === "roles") {
      for (const role of list(child)) if (typeof role === "string") into.add(role);
      continue;
    }
    collectRoles(child, into);
  }
  return into;
}

/** 参照の種類ごとの言い方（何が起きるかを、その種類の言葉で言う）。 */
const REF_KINDS: Record<
  RefKind,
  { rule: string; what: string; happens: string; fix: string }
> = {
  repositories: {
    rule: "unknown-repository",
    what: "Repository",
    happens: "画面は出ますがデータが来ません（実行時に引き先が見つからない）。",
    fix: "アプリ側の `RepositoryRegistry` に同じ名前で登録するか、定義の名前を直してください。",
  },
  sinks: {
    rule: "unregistered-sink",
    what: "出力先",
    happens: "ボタンは出ますが、押すと「出力先が未登録です」と言われます。",
    fix: "`HatakeScope` に登録してください（CSV は `exportSink`、印刷は `printSink`）。"
      + "Framework は文書までを作り、ファイルを書く・刷るのはアプリの担当です。",
  },
  plugins: {
    rule: "unknown-plugin",
    what: "プラグイン",
    happens: "ボタンは出ますが、押しても何も起きません。",
    fix: "アプリ側のアクション登録に同じ名前で足すか、定義の名前を直してください。",
  },
  pages: {
    rule: "unknown-page-ref",
    what: "ページ",
    happens: "遷移しても開けません。",
    fix: "そのページを `app.pages` に足すか、id を直してください。",
  },
  fieldTypes: {
    rule: "unknown-field-type",
    what: "項目の型",
    happens: "組み込みでも登録済みでもないので、ただのテキスト入力になります。",
    fix: "`fieldBuilders` に登録するか、組み込みの型を使ってください。",
  },
  columnTypes: {
    rule: "unknown-column-type",
    what: "列の型",
    happens: "組み込みでも登録済みでもないので、素の文字列として出ます。",
    fix: "組み込みの列型を使うか、登録済み一覧に足してください。",
  },
  actionTypes: {
    rule: "unknown-action-type",
    what: "アクションの型",
    happens: "押しても何も起きません。",
    fix: "組み込みの型か `type: plugin`（＋`plugin:`）を使ってください。",
  },
  validators: {
    rule: "unknown-validator",
    what: "バリデータ",
    happens: "その検証は**黙って行われません**（今まで弾いていた値が通ります）。",
    fix: "`ValidatorRegistry` に登録するか、組み込みの型を使ってください。",
  },
  formatters: {
    rule: "unknown-formatter",
    what: "フォーマッタ",
    happens: "整形されず、素の値がそのまま出ます。",
    fix: "`FormatterRegistry` に登録するか、組み込みの名前を使ってください。",
  },
  converters: {
    rule: "unknown-converter",
    what: "コンバータ",
    happens: "その正規化は**黙って行われません**（全角のまま保存されます）。",
    fix: "`ConverterRegistry` に登録するか、組み込みの名前を使ってください。",
  },
  computedOps: {
    rule: "unknown-computed-op",
    what: "計算の op",
    happens: "計算されず、その項目が空になります。",
    fix: "`ComputedRegistry` に登録するか、組み込みの op を使ってください。",
  },
  aggregates: {
    rule: "unknown-aggregate",
    what: "集約",
    happens: "集計されず、値が空になります。",
    fix: "`AggregateRegistry` に登録するか、組み込みの集約を使ってください。",
  },
  dashboardItemTypes: {
    rule: "unknown-dashboard-item-type",
    what: "カードの型",
    happens: "そのカードは出ません。",
    fix: "`dashboardItemBuilders` に登録するか、組み込みの型を使ってください。",
  },
  chartKinds: {
    rule: "unknown-chart-kind",
    what: "グラフの種類",
    happens: "グラフが描かれません。",
    fix: "組み込みの種類を使うか、登録済み一覧に足してください。",
  },
};

/**
 * 画面の外との辻褄。定義が要求している名前が、**渡された登録済み一覧に在るか**。
 *
 * strict もスキーマもここは見られない（登録済みの一覧を知らないので）。逆に言うと
 * 一覧が無ければ判断できないので、**渡されたカテゴリだけ**を見る。組み込みの名前は
 * 自動で足すので、渡すのは自分で登録したものだけでよい。
 */
function checkRegistry(
  document: Dict,
  registry: DefinitionRegistry,
  found: DefinitionWarning[],
): void {
  const refs = collectRefs(document);
  // 同じ名前は何箇所から参照されていても**1件**にする（言うことは同じで、直す所も
  // 1つ＝登録する側なので）。件数だけ添えて、どれだけ効いているかは分かるように。
  const seen = new Set<string>();
  for (const ref of refs) {
    const registered = registry[ref.kind];
    if (registered === undefined) continue; // 一覧を渡されていない種類は見ない
    const known = [...builtInNames[ref.kind], ...registered];
    if (known.includes(ref.name)) continue;
    const id = `${ref.kind}/${ref.name}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const others = refs.filter(
      (r) => r.kind === ref.kind && r.name === ref.name,
    ).length - 1;
    const kind = REF_KINDS[ref.kind];
    const near = closestKey(ref.name, known);
    warn(
      found,
      kind.rule,
      ref.path,
      `${kind.what} "${ref.name}" は登録されていません。${kind.happens}` +
        (others > 0 ? `（他 ${others} 箇所から参照）` : ""),
      near === null ? kind.fix : `もしかして "${near}" ですか。${kind.fix}`,
    );
  }
}

function warn(
  found: DefinitionWarning[],
  rule: string,
  path: string,
  message: string,
  fix: string,
  pitfall?: string,
): void {
  found.push({ rule, path, message, fix, ...(pitfall ? { pitfall } : {}) });
}

/**
 * 開ける人が居ない画面。
 *
 * ページに `roles` は書けないので、「この画面は誰に見えるか」は**入口から辿って**しか出せない
 * （[appAccess]）。入口を書いたのに権限が食い違っていると、**定義は通るのに誰も開けない**
 * 画面ができる。1枚ずつ読んでも出ないし、画面を見ても気づけないので、機械に言わせる。
 *
 * **入口がまったく無い画面は言わない。** メニューにも遷移先にも無いのは、アプリ側のコードから
 * 開くつもりで置いてあることがある（意図の話なので、言うなら助言＝`hatake advise` の担当）。
 * ここで言うのは「入口を書いたのに、その入口を通れる人が居ない」という**事実**だけ。
 */
function checkAccess(document: Dict, pages: Dict[], found: DefinitionWarning[]): void {
  const access = appAccess(document);
  pages.forEach((page, index) => {
    const id = str(page.id);
    if (id === undefined) return;
    const audience = access.audience.get(id);
    const entries = access.entries.get(id) ?? [];
    if (audience === undefined || entries.length === 0) return;
    if (!nobodyCanOpen(audience)) return;
    warn(
      found,
      "page-nobody-can-open",
      `app.pages[${index}]`,
      `画面 "${id}" を開ける人が居ません。入口はありますが、権限が食い違っています` +
        `（${entries.map((one) => describeEntry(one, access)).join(" / ")}）。`,
      "入口の roles を見直してください（入口側を広げるか、その手前の画面を開ける人に合わせる）。",
    );
  });
}

/** 入口1つの言い方（「顧客マスタ の「単価」= manager。顧客マスタ は admin だけ」）。 */
function describeEntry(
  entry: { from: string; label: string; roles: string[] },
  access: ReturnType<typeof appAccess>,
): string {
  const gate = entry.roles.length === 0 ? "誰でも" : entry.roles.join(" / ");
  if (entry.from === "menu") return `メニュー「${entry.label}」= ${gate}`;
  const source = access.audience.get(entry.from);
  const who =
    source === undefined ? "" : `。${entry.from} を開けるのは「${describeAudience(source)}」`;
  return `${entry.from} の「${entry.label}」= ${gate}${who}`;
}

/** アプリ全体で辻褄が合っているか（ページの重複・初期ルート・メニューの行き先）。 */
function checkApp(
  app: Dict,
  pages: Dict[],
  pageIds: Set<string>,
  found: DefinitionWarning[],
): void {
  const seen = new Set<string>();
  pages.forEach((page, i) => {
    const id = str(page.id);
    if (id === undefined) return;
    if (seen.has(id)) {
      warn(
        found,
        "duplicate-page-id",
        `app.pages[${i}].id`,
        `ページ id "${id}" が重複しています。id でページを引くので、後ろの1枚は開けません。`,
        "どちらかの id を変えてください。",
      );
    }
    seen.add(id);
  });

  const home = str(app.home);
  if (home !== undefined) {
    const menuIds = new Set<string>();
    collectMenu(list(app.menu), menuIds);
    if (!menuIds.has(home) && !pageIds.has(home)) {
      warn(
        found,
        "unknown-home",
        "app.home",
        `初期ルート "${home}" に当たるメニュー項目もページもありません。先頭のページが開きます。`,
        "menu の id か pages の id を書いてください。",
      );
    }
  }

  walkMenu(list(app.menu), "app.menu", pageIds, found);
}

function collectMenu(items: unknown[], into: Set<string>): void {
  for (const item of items) {
    if (!isDict(item)) continue;
    const id = str(item.id);
    if (id !== undefined) into.add(id);
    collectMenu(list(item.items), into);
  }
}

function walkMenu(
  items: unknown[],
  path: string,
  pageIds: Set<string>,
  found: DefinitionWarning[],
): void {
  items.forEach((item, i) => {
    if (!isDict(item)) return;
    const at = `${path}[${i}]`;
    const page = str(item.page);
    if (page !== undefined && !pageIds.has(page)) {
      warn(
        found,
        "unknown-page",
        `${at}.page`,
        `メニューが開こうとしているページ "${page}" が pages にありません。選んでも何も出ません。`,
        "pages に定義するか、既にある id に直してください。",
      );
    }
    walkMenu(list(item.items), `${at}.items`, pageIds, found);
  });
}

/** 1ページの中の辻褄。[pageIds] が null なら遷移先の検査だけ飛ばす。 */
function checkPage(
  page: Dict,
  path: string,
  pageIds: Set<string> | null,
  found: DefinitionWarning[],
  appRoles: Set<string> = new Set(),
): void {
  const actions = list(page.actions).filter(isDict);
  const actionIds = new Set(
    actions.map((a) => str(a.id)).filter((id): id is string => id !== undefined),
  );

  checkActions(actions, `${path}.actions`, pageIds, found);
  checkPrint(page, actions, path, found);
  checkSelection(page, actions, path, found, appRoles);
  checkPlaceholders(actions, `${path}.actions`, found);
  checkPrompt(actions, `${path}.actions`, found);
  checkCreateAction(page, actions, `${path}.actions`, found);
  checkTable(page, actionIds, path, found);
  checkSearch(page, path, found);
  checkForm(page, path, found);
  checkDashboard(page, actionIds, path, found);
  checkReport(page, path, found);
}

function checkActions(
  actions: Dict[],
  path: string,
  pageIds: Set<string> | null,
  found: DefinitionWarning[],
): void {
  const seen = new Set<string>();
  actions.forEach((action, i) => {
    const at = `${path}[${i}]`;
    const id = str(action.id);
    if (id !== undefined) {
      if (seen.has(id)) {
        warn(
          found,
          "duplicate-action-id",
          `${at}.id`,
          `アクション id "${id}" が重複しています。id で引くので、後ろの1つは使われません。`,
          "どちらかの id を変えてください。",
        );
      }
      seen.add(id);
    }
    // navigate の行き先と、onSuccess の遷移先。
    checkTarget(str(action.page), `${at}.page`, pageIds, found);
    const onSuccess = isDict(action.onSuccess) ? action.onSuccess : undefined;
    if (onSuccess !== undefined) {
      checkTarget(str(onSuccess.page), `${at}.onSuccess.page`, pageIds, found);
    }
  });
}

/**
 * 選んだ行に対して実行するボタン（`scope: selection`）の置き場所。
 *
 * 選ぶのは**表の行**なので、表が無い画面（フォーム・ウィザード・ダッシュボード）に
 * 置くと選ぶ手段が無い＝**押せないボタン**が出たままになる。
 *
 * 実行できるのは `type: plugin` だけ。一括の中身は業務（承認・締め・出荷確定）で、
 * Framework は業務を持たない。**消すのを複数まとめる口は用意していない**
 * （取り消せない操作は、事故が件数ぶん大きくなる）。
 */
function checkSelection(
  page: Dict,
  actions: Dict[],
  path: string,
  found: DefinitionWarning[],
  appRoles: Set<string> = new Set(),
): void {
  const hasTable = isDict(page.table);
  actions.forEach((action, i) => {
    if (str(action.scope) !== ActionScopes.selection) return;
    const label = str(action.label) ?? str(action.id) ?? "ボタン";
    if (!hasTable) {
      warn(
        found,
        "selection-without-table",
        `${path}.actions[${i}].scope`,
        `「${label}」は選んだ行に対して実行するボタンですが、この画面には表が` +
          `ありません。選ぶ手段が無いので、押せないままになります。`,
        "一覧のある画面（`search` / `crud` / `master`）に置くか、`scope` を外して" +
          "画面全体に対する操作にしてください。",
      );
      return;
    }
    const type = str(action.type) ?? "";
    if (type !== ActionTypes.plugin) {
      warn(
        found,
        "selection-unsupported-type",
        `${path}.actions[${i}].type`,
        `「${label}」は選んだ行に対して実行できません（\`${type}\` は画面全体の操作です）。` +
          `押しても実行されません。`,
        "一括の中身は業務なので `type: plugin`（＋`plugin:`）で書き、" +
          "選んだ行はハンドラが受け取ってください。",
        "bulk-delete",
      );
    }
  });
  checkMaxRows(page, actions, path, found, appRoles);
}

/**
 * 1回で動かせる件数の上限（`maxRows`）の辻褄。
 *
 * 上限は**選んだ行に対して実行するボタン**の話。ほかのボタンに書いても Renderer は
 * 見ないので、書いた人は「上限を決めた」と思ったまま何も効いていない。
 *
 * 効かないもう1つの形が「1ページの件数より大きい上限」。選べるのは**画面に出ている行**
 * だけなので、1ページ 50 件の表に `maxRows: 200` と書いても、200 件は選べない＝上限は
 * 一度も効かない（ページ送りを切っている表は全件出るので、この話にならない）。
 */
function checkMaxRows(
  page: Dict,
  actions: Dict[],
  path: string,
  found: DefinitionWarning[],
  appRoles: Set<string>,
): void {
  const table = isDict(page.table) ? page.table : undefined;
  const pagination = isDict(table?.pagination) ? table?.pagination : undefined;
  const paging = pagination?.enabled !== false;
  const pageSize =
    typeof pagination?.pageSize === "number" ? pagination.pageSize : DEFAULT_PAGE_SIZE;
  actions.forEach((action, i) => {
    const raw = action.maxRows;
    if (raw === undefined || raw === null) return;
    const at = `${path}.actions[${i}].maxRows`;
    const label = str(action.label) ?? str(action.id) ?? "ボタン";
    if (str(action.scope) !== ActionScopes.selection) {
      warn(
        found,
        "maxrows-without-selection",
        at,
        `「${label}」に1回の上限（\`maxRows\`）が書いてありますが、このボタンは` +
          `**選んだ行に対して実行するボタンではありません**（\`scope: selection\` が` +
          `ありません）。数える対象が無いので、上限は効きません。`,
        "選んだ行にまとめて実行するなら `scope: selection` を足してください。" +
          "画面全体に対する操作なら `maxRows` を消してください（件数の概念がありません）。",
      );
      return;
    }

    // 「効かない上限」は、書いた数のどれについても言える（既定でも役割ごとでも）。
    const overPageSize = (rows: number, where: string, who: string): void => {
      if (table === undefined || !paging || rows <= pageSize) return;
      warn(
        found,
        "maxrows-above-page-size",
        where,
        `「${label}」の上限${who}は ${rows} 件ですが、この表は1ページ ${pageSize} 件です。` +
          `選べるのは**画面に出ている行**だけなので、${rows} 件は選べません＝この上限は` +
          `一度も効きません。`,
        `上限を ${pageSize} 件以下にするか、\`table.pagination.pageSize\` を上げて` +
          "ください（1回で動く件数を増やすことになるので、上限の意味を先に決めてください）。",
      );
    };

    if (typeof raw === "number") {
      overPageSize(raw, at, "");
      return;
    }
    if (!isDict(raw)) return;
    if (typeof raw.default === "number") overPageSize(raw.default, `${at}.default`, "");
    if (!isDict(raw.byRole)) return;

    // 役割ごとの上限は、その役割が**このボタンを押せる**ときだけ効く。
    // 押せない役割に上限を書いても何も起きない（しかも定義は通る）。
    const allowed = list(action.roles).map(String);
    for (const [role, value] of Object.entries(raw.byRole)) {
      const where = `${at}.byRole.${role}`;
      if (typeof value === "number") overPageSize(value, where, `（${role}）`);
      if (allowed.length > 0 && !allowed.includes(role)) {
        warn(
          found,
          "maxrows-unknown-role",
          where,
          `「${label}」は ${allowed.join(" / ")} だけに出るボタンですが、上限を ` +
            `${role} について書いています。${role} はこのボタンを押せないので、` +
            `この上限は効きません。`,
          `${role} にも押させるなら \`roles\` に足してください。` +
            "そうでなければこの行を消してください。",
        );
        continue;
      }
      if (appRoles.size > 0 && !appRoles.has(role)) {
        const near = closestKey(role, [...appRoles]);
        warn(
          found,
          "maxrows-unknown-role",
          where,
          `上限を書いてある役割 "${role}" は、このアプリのどこにも出てきません。` +
            `誰にも当てはまらないので、この上限は効きません（みんな既定の上限になります）。`,
          near === null
            ? "`roles` に書いてある役割名で書いてください。"
            : `${near} の間違いではないですか？`,
        );
      }
    }
  });
}

/**
 * 実行前に聞く（`prompt`）けれど、聞いたものを受け取る先が無いアクション。
 *
 * 入力を受け取れるのは `type: plugin`（`ActionContext.input`）だけ。ほかの型は
 * 聞いた値の行き先が無いので、**聞くだけ聞いて捨てる**ことになる。定義としては
 * 通るので、押して初めて気づく。
 */
function checkPrompt(
  actions: Dict[],
  path: string,
  found: DefinitionWarning[],
): void {
  actions.forEach((action, i) => {
    if (!isDict(action.prompt)) return;
    const type = str(action.type) ?? "";
    if (type === ActionTypes.plugin) return;
    const label = str(action.label) ?? str(action.id) ?? "ボタン";
    warn(
      found,
      "prompt-unsupported-type",
      `${path}[${i}].prompt`,
      `「${label}」は実行前に入力を聞きますが、\`${type}\` は聞いた値を` +
        `受け取れません。入力は捨てられます。`,
      "入力を使うなら `type: plugin`（＋`plugin:`）にしてください" +
        "（ハンドラが `ActionContext.input` で受け取ります）。" +
        "聞く必要が無いなら `confirm` です。",
    );
  });
}

/** `type: create` が効く画面（一覧＋フォームを両方持つ種別）。 */
const CREATE_PAGE_KINDS = ["crud", "master"];

/**
 * 押しても何も起きない `type: create`。
 *
 * `create` がやることは**一覧から新規入力の枠を開く**ことなので、一覧とフォームを
 * 両方持つ画面（`crud` / `master`）にしか置けない。`form` の画面には保存ボタンが
 * 最初から出ているので、置く必要も無い。
 *
 * 定義としては通り、ボタンも出る。**押すと「このページでは使えません」と言われる**
 * ＝押すまで気づけない。1画面ぶんの情報で判定できるので、機械が先に言える。
 */
function checkCreateAction(
  page: Dict,
  actions: Dict[],
  path: string,
  found: DefinitionWarning[],
): void {
  const kind = str(page.type) ?? "";
  if (CREATE_PAGE_KINDS.includes(kind)) return;
  actions.forEach((action, i) => {
    if (str(action.type) !== ActionTypes.create) return;
    const label = str(action.label) ?? str(action.id) ?? "ボタン";
    warn(
      found,
      "create-action-unusable",
      `${path}[${i}].type`,
      `「${label}」は押しても何も起きません（\`type: create\` が開くのは` +
        `**一覧からの新規入力**なので、置けるのは ${CREATE_PAGE_KINDS.join(" / ")} です）。`,
      kind === "form" || kind === "wizard"
        ? "この画面には保存ボタンが最初から出ています（新規登録のボタンは要りません）。" +
          "保存のときに独自の処理が要るなら `type: plugin` で書いてください。"
        : "新規入力は一覧のある画面（`crud` / `master`）に置くか、" +
          "`type: navigate` で入力画面へ移ってください。",
    );
  });
}

/**
 * 1ページの既定の件数（`table.pagination.pageSize` を書かなかったとき）。
 *
 * スキーマの既定・3エディションの解析の既定と同じ値。ここだけ違うと「効かない上限」の
 * 判定が嘘になる。
 */
const DEFAULT_PAGE_SIZE = 50;

/** 件数の差し込み（一括のときだけ埋まる）。 */
const COUNT_PLACEHOLDERS = ["{count}", "{failed}", "{total}"];

/**
 * 文言に書ける差し込みの**全部**。ここに無いものは埋まらない。
 *
 * 閉じた集合なので機械が言える。開いていると思われがちなのが問題で、`{orderNo}` の
 * ように**項目名を書くと、そのまま文字として出る**（レコードの値は渡っていない）。
 */
const KNOWN_PLACEHOLDERS = [...COUNT_PLACEHOLDERS, "{error}"];

/**
 * 埋まらない差し込みを書いた文言。
 *
 * `onSuccess.message` / `onError.message` には差し込みが書ける。ただし埋まる条件が
 * あって、**条件を満たしていなければ差し込みは文字のまま出る**（`{count} 件を承認
 * しました`）。定義は通り、画面も出るので、**実際に押すまで気づけない**。
 *
 * 件数（`{count}` / `{failed}` / `{total}`）が埋まるのは `scope: selection` の
 * ボタンだけ。`{error}` が埋まるのは失敗したときだけ＝`onSuccess` には無い。
 *
 * **押す前**（`confirm` と `prompt` の文言）は、分かっているのが「選んだ行の数」だけ
 * なので `{count}` しか埋まらない。まだ1件も動いていないので `{failed}` / `{total}` /
 * `{error}` は文字のまま出る。
 */
function checkPlaceholders(
  actions: Dict[],
  path: string,
  found: DefinitionWarning[],
): void {
  actions.forEach((action, i) => {
    const bulk = str(action.scope) === ActionScopes.selection;
    const label = str(action.label) ?? str(action.id) ?? "ボタン";
    const success = isDict(action.onSuccess) ? action.onSuccess : undefined;
    const error = isDict(action.onError) ? action.onError : undefined;

    for (const [node, message] of [
      ["onSuccess", str(success?.message)],
      ["onError", str(error?.message)],
    ] as const) {
      if (message === undefined) continue;
      const used = COUNT_PLACEHOLDERS.filter((p) => message.includes(p));
      if (used.length > 0 && !bulk) {
        warn(
          found,
          "placeholder-not-filled",
          `${path}[${i}].${node}.message`,
          `「${label}」の文言にある ${used.join(" / ")} は埋まりません` +
            `（件数が決まるのは \`scope: selection\` のボタンだけ）。` +
            `そのまま文字として出ます。`,
          "件数を言うなら `scope: selection` のボタンに書いてください。" +
            "1件の操作なら差し込みを外します。",
        );
      }
      // 知らない差し込み（`{orderNo}` のような項目名）。埋める口が無いので文字で出る。
      const unknown = [...message.matchAll(/\{[^{}]*\}/g)]
        .map((one) => one[0])
        .filter((one) => !KNOWN_PLACEHOLDERS.includes(one));
      if (unknown.length > 0) {
        warn(
          found,
          "placeholder-not-filled",
          `${path}[${i}].${node}.message`,
          `「${label}」の文言にある ${[...new Set(unknown)].join(" / ")} は埋まりません` +
            `（書けるのは ${KNOWN_PLACEHOLDERS.join(" / ")} だけ）。そのまま文字として出ます。`,
          "レコードの値（受注番号など）は文言に差し込めません。" +
            "値を見せたい操作は `type: plugin` で書いて、アプリ側から出してください。",
        );
      }
      if (node === "onSuccess" && message.includes("{error}")) {
        warn(
          found,
          "placeholder-not-filled",
          `${path}[${i}].onSuccess.message`,
          `「${label}」の成功時の文言に {error} がありますが、成功に失敗の理由は` +
            `ありません。そのまま文字として出ます。`,
          "失敗したときの文言は `onError.message` に書いてください。",
        );
      }
    }

    // 押す前の文言（確認と、聞く形の見出し）。ここで分かっているのは**件数だけ**。
    const confirm = isDict(action.confirm) ? action.confirm : undefined;
    const prompt = isDict(action.prompt) ? action.prompt : undefined;
    for (const [node, message] of [
      ["confirm.message", str(confirm?.message)],
      ["confirm.title", str(confirm?.title)],
      ["prompt.title", str(prompt?.title)],
    ] as const) {
      if (message === undefined) continue;
      if (message.includes("{count}") && !bulk) {
        warn(
          found,
          "placeholder-not-filled",
          `${path}[${i}].${node}`,
          `「${label}」の押す前の文言にある {count} は埋まりません` +
            `（件数が決まるのは \`scope: selection\` のボタンだけ）。` +
            `そのまま文字として出ます。`,
          "件数を言うなら `scope: selection` のボタンに書いてください。" +
            "1件の操作なら差し込みを外します。",
        );
      }
      // 走る前なので、失敗の数も理由もまだ無い。
      const early = [...message.matchAll(/\{[^{}]*\}/g)]
        .map((one) => one[0])
        .filter((one) => one !== "{count}");
      if (early.length > 0) {
        warn(
          found,
          "placeholder-not-filled",
          `${path}[${i}].${node}`,
          `「${label}」の押す前の文言にある ${[...new Set(early)].join(" / ")} は` +
            `埋まりません（まだ実行していないので、失敗の数も理由もありません）。` +
            `そのまま文字として出ます。`,
          "押す前に書けるのは {count}（選んだ行の数）だけです。" +
            "結果を言う文言は `onSuccess` / `onError` に書いてください。",
        );
      }
    }
  });
}

/**
 * 紙の無い画面に置いた印刷ボタン。
 *
 * `type: print` が刷るのは**帳票**。紙の形（用紙・1枚の行数・グループ・小計）は
 * `report` が決めているので、`report` が無い画面には刷るものが無い。定義としては
 * 通る（アクションの型は開いた文字列＝プラグインで足せる）ので、**ボタンは出て、
 * 押すと「このページでは刷れません」と言われる**。押すまで分からないのは遅い。
 *
 * 一覧を持ち出したいだけなら `type: export`（CSV）で、そちらはどのページでも動く。
 */
function checkPrint(
  page: Dict,
  actions: Dict[],
  path: string,
  found: DefinitionWarning[],
): void {
  if (isDict(page.report)) return;
  actions.forEach((action, i) => {
    if (str(action.type) !== ActionTypes.print) return;
    const label = str(action.label) ?? str(action.id) ?? "印刷";
    warn(
      found,
      "print-without-report",
      `${path}.actions[${i}].type`,
      `「${label}」は紙に刷るボタンですが、この画面には report がありません。` +
        `刷る紙が無いので、押しても何も出ません。`,
      "帳票の画面（`type: report` ＋ `report:`）に置いてください。" +
        "一覧をファイルに持ち出すだけなら `type: export`（CSV）です。",
      "print-without-report",
    );
  });
}

function checkTarget(
  page: string | undefined,
  path: string,
  pageIds: Set<string> | null,
  found: DefinitionWarning[],
): void {
  if (page === undefined || pageIds === null) return;
  if (pageIds.has(page)) return;
  warn(
    found,
    "unknown-page",
    path,
    `遷移先のページ "${page}" が pages にありません。押しても何も起きません。`,
    "pages に定義するか、既にある id に直してください。",
  );
}

function checkTable(
  page: Dict,
  actionIds: Set<string>,
  path: string,
  found: DefinitionWarning[],
): void {
  const table = isDict(page.table) ? page.table : undefined;
  if (table === undefined) return;
  list(table.rowActions).forEach((raw, i) => {
    const at = `${path}.table.rowActions[${i}]`;
    const id = str(raw);
    if (id === undefined) {
      warn(
        found,
        "rowactions-as-objects",
        at,
        "rowActions の要素が文字列ではありません。行アクションとして扱われません。",
        "アクション id の文字列を並べてください（実体は actions に書く）。",
        "rowactions-as-objects",
      );
      return;
    }
    if (!BUILT_IN_ROW_ACTIONS.has(id) && !actionIds.has(id)) {
      warn(
        found,
        "rowaction-not-declared",
        at,
        `行アクション "${id}" に対応する actions の定義がありません。ボタンが出ません。`,
        `actions に { id: ${id}, type: …, label: … } を足してください`
          + "（組み込みは edit / delete のみ）。",
      );
    }
  });
}

/** 検索欄の条件を見る（選択肢の連動は入力項目と同じ規則）。 */
function checkSearch(page: Dict, path: string, found: DefinitionWarning[]): void {
  const search = isDict(page.search) ? page.search : undefined;
  if (search === undefined) return;
  const filters = list(search.filters).filter(isDict);
  // 親は自分より後ろに書かれていることもあるので、先に全部の名前を集める。
  const names = new Set(
    filters
      .map((f) => str(f.field))
      .filter((name): name is string => name !== undefined),
  );
  filters.forEach((filter, i) => {
    checkOptions(filter, `${path}.search.filters[${i}]`, found, names, "検索欄");
  });
}

/** フォーム（と wizard のステップ）の中の項目を見る。 */
function checkForm(page: Dict, path: string, found: DefinitionWarning[]): void {
  const groups: { fields: unknown[]; path: string }[] = [];
  const form = isDict(page.form) ? page.form : undefined;
  if (form !== undefined) {
    list(form.sections).forEach((section, i) => {
      if (isDict(section)) {
        if (isDict(section.visibleWhen)) {
          checkCondition(
            section.visibleWhen,
            `${path}.form.sections[${i}].visibleWhen`,
            found,
          );
        }
        groups.push({
          fields: list(section.fields),
          path: `${path}.form.sections[${i}].fields`,
        });
      }
    });
  }
  list(page.steps).forEach((step, i) => {
    if (isDict(step)) {
      groups.push({ fields: list(step.fields), path: `${path}.steps[${i}].fields` });
    }
  });

  // フォーム全体の項目名。`optionsFrom` の指す先があるかを見るために先に集める
  // （親が子より後ろに書かれていることもある）。**定義そのもの**も持つ: 計算項目が
  // 指す先が「明細か」「ページ送りか」「行にその項目があるか」は、名前だけでは分からない。
  const names = new Set<string>();
  const defs = new Map<string, Dict>();
  for (const group of groups) {
    for (const raw of group.fields) {
      if (!isDict(raw)) continue;
      const name = str(raw.field);
      if (name !== undefined) {
        names.add(name);
        if (!defs.has(name)) defs.set(name, raw);
      }
    }
  }

  // 同じ項目名が2回あると、後ろが前を上書きして片方は無かったことになる。
  const seen = new Map<string, string>();
  for (const group of groups) {
    group.fields.forEach((raw, i) => {
      if (!isDict(raw)) return;
      const at = `${group.path}[${i}]`;
      const name = str(raw.field);
      if (name !== undefined) {
        const first = seen.get(name);
        if (first !== undefined) {
          warn(
            found,
            "duplicate-field",
            `${at}.field`,
            `項目 "${name}" が2回書かれています（${first} と同じ）。同じ値を2箇所で編集することになります。`,
            "片方を消すか、別の項目名にしてください。",
          );
        } else {
          seen.set(name, at);
        }
      }
      checkFieldEntry(raw, at, found, names, defs);
    });
  }
}

function checkFieldEntry(
  field: Dict,
  path: string,
  found: DefinitionWarning[],
  siblings: Set<string> = new Set(),
  siblingDefs: Map<string, Dict> = new Map(),
): void {
  checkOptions(field, path, found, siblings);
  checkCompare(field, path, found, siblings, siblingDefs);
  checkComputed(field, path, found, siblingDefs);
  list(field.validators).forEach((raw, i) => {
    if (isDict(raw)) return;
    warn(
      found,
      "required-as-validator-only",
      `${path}.validators[${i}]`,
      "validators の要素がオブジェクトではありません。検証は足されません。",
      "`- { type: email }` の形で書いてください。",
      "required-as-validator-only",
    );
  });
  for (const key of ["visibleWhen", "enabledWhen", "requiredWhen", "readOnlyWhen"]) {
    const condition = field[key];
    if (isDict(condition)) checkCondition(condition, `${path}.${key}`, found);
  }
  // 常に効く指定と条件付きの指定を両方書くと、条件の方が意味を持たない。
  if (field.required === true && isDict(field.requiredWhen)) {
    warn(
      found,
      "requiredwhen-with-required",
      `${path}.requiredWhen`,
      "`required: true` があるので常に必須です。`requiredWhen` は効きません。",
      "条件付きにしたいなら `required: true` を消してください（両方なら常に必須）。",
    );
  }
  if (field.readOnly === true && isDict(field.readOnlyWhen)) {
    warn(
      found,
      "readonlywhen-with-readonly",
      `${path}.readOnlyWhen`,
      "`readOnly: true` があるので常に読み取り専用です。`readOnlyWhen` は効きません。",
      "条件付きにしたいなら `readOnly: true` を消してください。",
    );
  }
  // 明細（subTable）の行の項目も同じ規則で見る（親子は行の中で閉じている）。
  const rowFields = new Set(
    list(field.fields)
      .filter(isDict)
      .map((raw) => str(raw.field))
      .filter((name): name is string => name !== undefined),
  );
  const rowDefs = new Map<string, Dict>();
  for (const raw of list(field.fields).filter(isDict)) {
    const name = str(raw.field);
    if (name !== undefined && !rowDefs.has(name)) rowDefs.set(name, raw);
  }
  list(field.fields).forEach((raw, i) => {
    if (isDict(raw)) {
      checkFieldEntry(raw, `${path}.fields[${i}]`, found, rowFields, rowDefs);
    }
  });
}

/**
 * 明細の行を畳める op。集約の語彙（ダッシュボードのカードと同じもの）＋ `join`。
 *
 * `join` は数ではなく文字を作る（行を並べて1行にする）ので集約ではないが、
 * 「`field` の行を `of` で見る」書き方は同じ＝ここの検査は全部そのまま当てはまる。
 */
const ROW_FOLD_OPS: string[] = [
  AggregateOps.count,
  AggregateOps.sum,
  AggregateOps.avg,
  AggregateOps.min,
  AggregateOps.max,
  "join",
];

/** 同じレコードの項目を畳む op（`fields` を取るもの）。 */
const SAME_RECORD_OPS = ["concat", "sum", "subtract", "product"];

/**
 * 計算項目（`computed`）の辻褄。
 *
 * `computed` は**開いたノード**（独自の op が自由なパラメータを取れるように）なので、
 * strict でも中身の書き間違いは弾けない。しかも間違えたときの結果は null か 0 で、
 * 画面には**空欄や 0 円**として出る＝転んだことに気づけない。だから機械に言わせる。
 *
 * ただし**組み込みの op のときだけ**。`field` は独自の op のパラメータ名としても普通に
 * 使う（`{ op: consumptionTax, field: subtotal }`＝「どの項目から計算するか」）ので、
 * 知らない op の中身に口を出すと、正しい定義に嘘の警告を出すことになる。
 */
function checkComputed(
  field: Dict,
  path: string,
  found: DefinitionWarning[],
  siblingDefs: Map<string, Dict>,
): void {
  const computed = isDict(field.computed) ? field.computed : undefined;
  if (computed === undefined) return;
  const at = `${path}.computed`;
  const op = str(computed.op) ?? "";
  const target = str(computed.field);
  const of = str(computed.of);
  const where = isDict(computed.where) ? computed.where : undefined;
  const label = str(field.label) ?? str(field.field) ?? "項目";
  // 「畳む」のは数にする op、`join` は「並べる」。同じ言葉で言うと読めない。
  const folding = op === "join" ? "並べる" : "畳む";

  // 独自の op（登録して足したもの）は、パラメータの意味を知らないので何も言わない。
  if (!ROW_FOLD_OPS.includes(op) && !SAME_RECORD_OPS.includes(op)) return;

  // 行を畳む op なのに、畳む相手（`field`）が無い。
  if (target === undefined) {
    if (ROW_FOLD_OPS.includes(op) && !SAME_RECORD_OPS.includes(op)) {
      warn(
        found,
        "computed-rows-unsupported-op",
        `${at}.op`,
        `${op} は**明細の行をまとめる**計算なので、まとめる相手が要ります。` +
          `このままでは「${label}」は空欄になります。`,
        "`field: <明細の項目名>` を足してください" +
          "（同じレコードの項目を畳むなら sum / subtract / product / concat です）。",
      );
      return;
    }
    // `where` は**行を絞る**指定。畳む行が無いここでは、書いても何も起きない。
    if (where !== undefined) {
      warn(
        found,
        "computed-where-ignored",
        `${at}.where`,
        "`where` は**明細の行を絞る**指定ですが、この計算は同じレコードの項目を" +
          `畳んでいます（\`fields\`）。「${label}」は絞られずに計算されます。`,
        "行を絞りたいなら `field: <明細の項目名>` で明細を畳む形にしてください。" +
          "レコードの状態で計算を変えたいなら、それは計算ではなく `visibleWhen` の話です。",
      );
    }
    checkComputedOrder(field, computed, at, found, siblingDefs);
    return;
  }

  if (list(computed.fields).length > 0) {
    warn(
      found,
      "computed-field-and-fields",
      `${at}.fields`,
      "`field`（明細の行をまとめる）と `fields`（同じレコードの項目を畳む）の両方が" +
        "書かれています。**`field` が勝つ**ので `fields` は効きません。",
      "行をまとめるなら `fields` を消してください。同じレコードの項目を畳むなら " +
        "`field` と `of` を消してください。",
    );
  }

  if (!ROW_FOLD_OPS.includes(op)) {
    warn(
      found,
      "computed-rows-unsupported-op",
      `${at}.op`,
      `${op} では明細の行をまとめられません（行をまとめられるのは ` +
        `${ROW_FOLD_OPS.join(" / ")} だけ）。「${label}」は計算されません。`,
      "合計なら `op: sum` です。並べて1行にしたいなら `op: join` です。",
    );
  } else if (op !== AggregateOps.count && of === undefined) {
    warn(
      found,
      "computed-aggregate-without-of",
      `${at}.of`,
      `${op} で${folding}項目（\`of\`）がありません。「${label}」は空欄になります。`,
      "`of: <行の項目名>` を書いてください（`count` だけは要りません）。",
    );
  }

  // `where` の条件そのものの辻褄（知らない演算子は常に false＝1件も残らない）。
  if (where !== undefined) {
    checkCondition(where, `${at}.where`, found);
    checkWhereMode(where, `${at}.where`, found, label, "computed");
  }

  const def = siblingDefs.get(target);
  if (def === undefined) {
    if (siblingDefs.size === 0) return;
    const near = closestKey(target, [...siblingDefs.keys()]);
    warn(
      found,
      "computed-of-unknown-field",
      `${at}.field`,
      `まとめる相手 "${target}" が同じフォームにありません。` +
        `「${label}」は空欄か 0 になります。`,
      near === null
        ? "同じフォームの明細（`type: subTable`）の項目名を書いてください。"
        : `${near} の間違いではないですか？`,
    );
    return;
  }
  if (str(def.type) !== FieldTypes.subTable) {
    warn(
      found,
      "computed-of-unknown-field",
      `${at}.field`,
      `"${target}" は明細ではありません（\`type: ${str(def.type) ?? "text"}\`）。` +
        `まとめられる行が無いので、「${label}」は空欄か 0 になります。`,
      "まとめたいのは `type: subTable` の項目です。同じレコードの項目を足すなら " +
        "`fields: [...]` を使ってください。",
    );
    return;
  }
  if (isDict(def.source)) {
    warn(
      found,
      "computed-of-paged-subtable",
      `${at}.field`,
      `"${target}" は別のテーブルに持つ明細（\`source\` つき）です。行は**ページ送りで** ` +
        `別に取るので、ここには揃っていません。「${label}」は 0 になります。`,
      "全部を足した数が要るなら、サーバ側で計算して1つの項目として返してください" +
        "（画面に出ている行だけを足しても、業務の合計にはなりません）。",
    );
    return;
  }
  const rowNames = rowFieldNames(def);
  if (rowNames.size === 0) return;
  if (of !== undefined && !rowNames.has(of)) {
    const near = closestKey(of, [...rowNames]);
    warn(
      found,
      "computed-of-unknown-field",
      `${at}.of`,
      `明細 "${target}" の行に "${of}" がありません。${folding}値が取れないので、` +
        `「${label}」は空欄か 0 になります。`,
      near === null
        ? "行の項目名（`fields` に書いた `field`）を書いてください。"
        : `${near} の間違いではないですか？`,
    );
  }
  if (where !== undefined) {
    checkWhereFields(where, `${at}.where`, found, rowNames, label, "computed");
  }
}

/** 明細の行に書いてある項目名（編集欄と列の両方）。 */
function rowFieldNames(def: Dict): Set<string> {
  return new Set(
    [...list(def.fields), ...list(def.columns)]
      .filter(isDict)
      .map((raw) => str(raw.field))
      .filter((name): name is string => name !== undefined),
  );
}

/**
 * `where` に `{ mode: … }` を書いてしまった。
 *
 * 行にはフォームの状態が無いので常に false＝**1件も残らない**。計算（`computed`）でも
 * 突き合わせ（`compare`）でも同じことが起きるので、言うことも同じにする。
 */
function checkWhereMode(
  where: Dict,
  path: string,
  found: DefinitionWarning[],
  label: string,
  owner: "computed" | "compare",
): void {
  if (!hasModeLeaf(where)) return;
  warn(
    found,
    `${owner}-where-mode`,
    path,
    "`where` の `mode` は**行に対して**判定されますが、行にはフォームの状態" +
      `（新規/編集）がありません。常に false＝**1件も残らない**ので、「${label}」は` +
      (owner === "computed" ? "空欄か 0 になります。" : "0 と比べることになります。"),
    "行の値で絞ってください（`field` と `operator`）。新規のときだけ効かせたいなら、" +
      "それは行の絞り込みではなく `visibleWhen` / `requiredWhen` の話です。",
  );
}

/** 条件のどこかに `{ mode: ... }` があるか（`all` / `any` / `not` の中も見る）。 */
function hasModeLeaf(condition: Dict): boolean {
  if (str(condition.mode) !== undefined) return true;
  for (const key of ["all", "any"]) {
    if (list(condition[key]).filter(isDict).some(hasModeLeaf)) return true;
  }
  return isDict(condition.not) ? hasModeLeaf(condition.not) : false;
}

/**
 * `where` が指す行の項目名を見る。
 *
 * **綴り違いに見えるときだけ**言う。行には「持っているが画面に出していない値」
 * （取消フラグなど）があるので、`fields` に無い名前を一律に責めると、正しい定義に
 * 嘘の警告を出すことになる。
 */
function checkWhereFields(
  condition: Dict,
  path: string,
  found: DefinitionWarning[],
  rowNames: Set<string>,
  label: string,
  owner: "computed" | "compare",
): void {
  for (const key of ["all", "any"]) {
    list(condition[key]).forEach((raw, i) => {
      if (isDict(raw)) {
        checkWhereFields(raw, `${path}.${key}[${i}]`, found, rowNames, label, owner);
      }
    });
  }
  if (isDict(condition.not)) {
    checkWhereFields(condition.not, `${path}.not`, found, rowNames, label, owner);
  }
  const name = str(condition.field);
  if (name === undefined || rowNames.has(name)) return;
  const near = closestKey(name, [...rowNames]);
  if (near === null) return;
  warn(
    found,
    `${owner}-where-unknown-field`,
    `${path}.field`,
    `絞り込みが見ている "${name}" が明細の行にありません（${near} の間違いでは` +
      `ないですか？）。条件が当たらないので、「${label}」は 1件も数えない値になります。`,
    `${near} に直してください` +
      "（行に持っているだけで画面に出していない値なら、そのままで合っています）。",
  );
}

/**
 * 計算の**順番**。計算は書いた順に1回だけなので、後ろに書いた計算項目の結果は使えない。
 *
 * 転んだときに出るのは空欄か 0 で、画面を見ても「順番のせい」だとは分からない
 * （消費税だけ 0 円の伝票が出る）。だから機械に言わせる。
 *
 * ここも**組み込みの op のときだけ**。独自の op が `fields` に何を書くかは知らない。
 */
function checkComputedOrder(
  field: Dict,
  computed: Dict,
  at: string,
  found: DefinitionWarning[],
  siblingDefs: Map<string, Dict>,
): void {
  const own = str(field.field);
  if (own === undefined) return;
  const order = [...siblingDefs.keys()];
  const mine = order.indexOf(own);
  if (mine < 0) return;
  const label = str(field.label) ?? own;
  list(computed.fields).forEach((raw, i) => {
    const dep = str(raw);
    if (dep === undefined) return;
    if (dep === own) {
      warn(
        found,
        "computed-self-reference",
        `${at}.fields[${i}]`,
        `「${label}」の計算が**自分自身**（"${own}"）を使っています。計算は書いた順に` +
          "1回なので、いつも1つ前の値（はじめは空）を使うことになります。",
        "使うのは別の項目です（前回の値が要るなら、それは計算ではなくレコードに" +
          "持つ値です）。",
      );
      return;
    }
    const def = siblingDefs.get(dep);
    if (def === undefined || !isDict(def.computed)) return;
    if (order.indexOf(dep) <= mine) return;
    warn(
      found,
      "computed-order",
      `${at}.fields[${i}]`,
      `「${label}」は "${dep}" を使っていますが、"${dep}" も計算項目で**後ろに` +
        `書かれています**。計算は書いた順に1回なので、「${label}」は "${dep}" が` +
        "空のまま計算されます。",
      `"${dep}" を「${label}」より前に置いてください（小計 → 消費税 → 合計 の順）。`,
    );
  });
}

/**
 * 項目間の検証（`compare`）の辻褄。
 *
 * この検証は**書き間違えても静かに通る**（比べる相手が見つからなければ判定しない）ので、
 * 相手の項目名の綴り違いは画面を見ても気づけない。だから機械に言わせる。
 */
function checkCompare(
  field: Dict,
  path: string,
  found: DefinitionWarning[],
  siblings: Set<string>,
  siblingDefs: Map<string, Dict>,
): void {
  const own = str(field.field);
  list(field.validators)
    .filter(isDict)
    .forEach((rule, index) => {
      if (str(rule.type) !== ValidatorTypes.compare) return;
      const at = `${path}.validators[${index}]`;
      const target = str(rule.field);
      if (target === undefined) {
        warn(
          found,
          "compare-without-field",
          at,
          "比べる相手（`field`）がありません。この検証は何も判定しません。",
          "`field: <相手の項目名>` を書いてください（`operator` の既定は gte）。",
        );
        return;
      }
      if (target === own) {
        warn(
          found,
          "compare-with-itself",
          `${at}.field`,
          `自分（"${target}"）と比べています。いつも同じ値なので、判定は変わりません。`,
          "比べたい**別の**項目名を書いてください。",
        );
      } else if (siblings.size > 0 && !siblings.has(target)) {
        const near = closestKey(target, [...siblings]);
        warn(
          found,
          "compare-unknown-field",
          `${at}.field`,
          `比べる相手 "${target}" が同じフォームにありません。相手の値が取れないので、` +
            "この検証は**黙って通ります**。",
          near === null
            ? "同じフォームの項目名を書いてください（明細の中なら、その行の項目名）。"
            : `${near} の間違いではないですか？`,
        );
      }
      const operator = str(rule.operator);
      if (operator !== undefined && !COMPARE_OPERATORS.includes(operator as never)) {
        warn(
          found,
          "compare-bad-operator",
          `${at}.operator`,
          `突合 "${operator}" では大小を比べられないので、この検証は何も判定しません。`,
          `使えるのは ${COMPARE_OPERATORS.join(" / ")} です。`,
        );
      }
      const aggregate = str(rule.aggregate);
      if (
        aggregate !== undefined &&
        aggregate !== AggregateOps.count &&
        str(rule.of) === undefined
      ) {
        warn(
          found,
          "compare-aggregate-without-of",
          `${at}.of`,
          `${aggregate} で畳む項目（\`of\`）がありません。相手の値が null になるので、` +
            "この検証は**黙って通ります**。",
          "`of: <行の項目名>` を書いてください（`count` だけは要りません）。",
        );
      }

      // 畳む前に行を絞る指定。計算（`computed`）と**同じ行を同じ規則で**絞るための
      // ものなので、検査も計算と同じものを使う（言うことが違うと読む人が混乱する）。
      const where = isDict(rule.where) ? rule.where : undefined;
      if (where === undefined) return;
      const label = str(field.label) ?? own ?? "項目";
      if (aggregate === undefined) {
        warn(
          found,
          "compare-where-ignored",
          `${at}.where`,
          "`where` は**明細の行を絞る**指定ですが、この検証は明細を畳んでいません" +
            `（\`aggregate\` がありません）。「${label}」は絞られていない値と比べられます。`,
          "明細を畳んで比べるなら `aggregate: sum` と `of: <行の項目名>` を足して" +
            "ください。1つの項目と比べるだけなら `where` を消してください。",
        );
        return;
      }
      checkCondition(where, `${at}.where`, found);
      checkWhereMode(where, `${at}.where`, found, label, "compare");
      const def = siblingDefs.get(target);
      if (def === undefined || str(def.type) !== FieldTypes.subTable) return;
      const rowNames = rowFieldNames(def);
      if (rowNames.size > 0) {
        checkWhereFields(where, `${at}.where`, found, rowNames, label, "compare");
      }
    });
}

/** 選択肢の連動（`optionsFrom` / `when` / `optionsSource`）の辻褄。 */
function checkOptions(
  field: Dict,
  path: string,
  found: DefinitionWarning[],
  siblings: Set<string>,
  scope: string = "フォーム",
): void {
  const parent = str(field.optionsFrom);
  const hasWhen = list(field.options)
    .filter(isDict)
    .some((option) => option.when !== undefined);

  if (parent === undefined && hasWhen) {
    warn(
      found,
      "option-when-without-optionsfrom",
      `${path}.options`,
      "選択肢に `when` があるのに `optionsFrom` が無いので、どの項目と連動するのか決まりません。全部の選択肢がそのまま出ます。",
      "`optionsFrom: <親の項目名>` を足してください。",
    );
  }
  if (parent !== undefined && siblings.size > 0 && !siblings.has(parent)) {
    warn(
      found,
      "optionsfrom-unknown-field",
      `${path}.optionsFrom`,
      `親に指定した "${parent}" がこの${scope}にありません。親の値が取れないので、\`when\` 付きの選択肢は出ません。`,
      `同じ${scope}にある項目名を書いてください（別の場所の項目は見えません）。`,
    );
  }

  const source = isDict(field.optionsSource) ? field.optionsSource : undefined;
  if (source === undefined) return;
  if (str(source.parentKey) !== undefined && parent === undefined) {
    warn(
      found,
      "optionssource-parentkey-without-optionsfrom",
      `${path}.optionsSource.parentKey`,
      "絞り込みに使う親の値が決まらないので、`parentKey` が効きません（全件を引きます）。",
      "`optionsFrom: <親の項目名>` を足してください（親の値が `parentKey` の名前で Repository に渡ります）。",
    );
  }
  if (list(field.options).length > 0) {
    warn(
      found,
      "options-and-optionssource",
      `${path}.optionsSource`,
      "`options` と `optionsSource` の両方があります。引いてくる方が勝つので、書いた `options` は出ません。",
      "どちらかにしてください（静的な選択肢だけなら `optionsSource` を消す）。",
    );
  }
}

/** 条件は結合（all / any / not）で入れ子になる。葉の演算子だけを見る。 */
function checkCondition(
  condition: Dict,
  path: string,
  found: DefinitionWarning[],
): void {
  for (const key of ["all", "any"]) {
    list(condition[key]).forEach((raw, i) => {
      if (isDict(raw)) checkCondition(raw, `${path}.${key}[${i}]`, found);
    });
  }
  if (isDict(condition.not)) checkCondition(condition.not, `${path}.not`, found);

  const operator = str(condition.operator);
  if (operator === undefined) return;
  if ((ConditionOperators as readonly string[]).includes(operator)) return;
  warn(
    found,
    "condition-operator-unsupported",
    `${path}.operator`,
    `条件は演算子 "${operator}" を理解しません。常に false になり、この項目は出てきません。`,
    `使えるのは ${ConditionOperators.join(" / ")}`
      + "（`between` は検索専用。範囲は all + gte/lte で書く）。",
    operator === "between" ? "between-in-condition" : undefined,
  );
}

function checkDashboard(
  page: Dict,
  actionIds: Set<string>,
  path: string,
  found: DefinitionWarning[],
): void {
  list(page.items).forEach((raw, i) => {
    if (!isDict(raw)) return;
    const at = `${path}.items[${i}]`;
    const action = str(raw.action);
    if (action !== undefined && !actionIds.has(action)) {
      warn(
        found,
        "unknown-action",
        `${at}.action`,
        `カードが指しているアクション "${action}" が actions にありません。押しても何も起きません。`,
        "actions に足すか、既にある id に直してください。",
      );
    }
    if (isDict(raw.value)) checkAggregate(raw.value, `${at}.value`, found);
    if (isDict(raw.chart)) checkAggregate(raw.chart, `${at}.chart`, found);
  });
}

/** `count` 以外は畳み込む対象が要る。無いと結果が null になる（0 ではない）。 */
function checkAggregate(
  node: Dict,
  path: string,
  found: DefinitionWarning[],
): void {
  const aggregate = str(node.aggregate);
  if (aggregate === undefined || aggregate === AggregateOps.count) return;
  const field = str(node.field) ?? str(node.valueField);
  if (field !== undefined) return;
  warn(
    found,
    "aggregate-without-field",
    `${path}.aggregate`,
    `"${aggregate}" は畳み込む項目が要りますが field がありません。結果は null になります。`,
    "field（チャートなら valueField）を書いてください。count なら field は不要です。",
  );
}

function checkReport(page: Dict, path: string, found: DefinitionWarning[]): void {
  const report = isDict(page.report) ? page.report : undefined;
  if (report === undefined) return;
  const groups = list(report.groupBy);

  if (groups.length > 0 && !isDict(report.sort)) {
    warn(
      found,
      "groupby-without-sort",
      `${path}.report.groupBy`,
      "グループはコントロールブレイクなので、行がその順で届かないとグループが分裂し、小計が何度も出ます。",
      "report.sort に印刷したい並びを書いてください（並べ替えは Repository の責務）。",
      "groupby-without-sort",
    );
  }

  const table = isDict(page.table) ? page.table : undefined;
  checkPaperFits(report, list(table?.columns).filter(isDict), path, found);

  const columns = new Set(
    list(table?.columns)
      .filter(isDict)
      .map((c) => str(c.field))
      .filter((f): f is string => f !== undefined),
  );
  if (columns.size === 0) return; // 列が無いページは別の問題（スキーマ側）
  list(report.totals).forEach((raw, i) => {
    if (!isDict(raw)) return;
    const field = str(raw.field);
    if (field === undefined || columns.has(field)) return;
    warn(
      found,
      "total-without-column",
      `${path}.report.totals[${i}].field`,
      `合計の対象 "${field}" が table.columns にありません。合計は列の下に出るので、どこにも表示されません。`,
      "その項目を table.columns に足すか、列にある項目で合計してください。",
    );
  });
}

/**
 * 幅の指定が無い列にも、最低これだけは要る（40pt ＝ 全角2文字ぶん）。
 *
 * 刷る側（`hatake_print`）が指定の無い列に渡す最低幅と同じ数。これが要るのは、
 * 「幅の指定がある列だけなら紙に収まる」定義でも、**残りの列に何も残らない**ことが
 * あるため。
 */
const MIN_FLEX_WIDTH = 40;

/** これより低い行は、文字を入れても読めない（9pt ＝ 5〜6pt の文字が入る高さ）。 */
const MIN_ROW_HEIGHT = 9;

/** 数を紙の話に出す形（小数2桁まで・無駄な 0 は落とす）。 */
const pt = (value: number): string => value.toFixed(2).replace(/\.?0+$/, "");

/**
 * 紙に入らない帳票。
 *
 * `column.width` は紙の上ではポイント（1/72 inch）として使われ、`rowsPerPage` 行が
 * 1枚に載る。**どちらも定義に書いてある数なので、刷る前に入るかどうかが分かる。**
 *
 * 刷る側は溢れないように**縮めて収める**（紙は伸びないので、そうする以外にない）。
 * つまり刷っても例外は出ず、**読めない紙が出てくる**だけ。だから機械が先に言う。
 *
 * 見積もりは**紙そのもの**と比べる（余白を引かない）。余白や見出しの高さは刷る側の
 * 設定で変えられるので、そこを当てにすると「設定を変えれば入るのに言われる」嘘の警告に
 * なる。ここで言うのは「紙より広い」「紙の高さで割ったら読めない」＝**設定では直らない
 * 事実**だけ。用紙の実寸は [`spec/papers.json`](../../spec/papers.json) が正。
 */
function checkPaperFits(
  report: Dict,
  columns: Dict[],
  path: string,
  found: DefinitionWarning[],
): void {
  const declaredPaper = isDict(report.paper) ? report.paper : undefined;
  const paper = paperSize(declaredPaper);
  // 知らない用紙名は黙る（開いた文字列＝Renderer が独自の紙を知っていてよい）。
  if (paper === undefined) return;
  const name = paperName(declaredPaper);

  if (columns.length > 0) {
    const declared = columns.filter((c) => typeof c.width === "number");
    const fixed = declared.reduce((sum, c) => sum + (c.width as number), 0);
    const flex = columns.length - declared.length;
    const needed = fixed + MIN_FLEX_WIDTH * flex;
    if (needed > paper.width) {
      warn(
        found,
        "columns-wider-than-paper",
        `${path}.table.columns`,
        `${name}の紙幅 ${pt(paper.width)}pt に対して、列は最低 ${pt(needed)}pt 要ります` +
          `（幅の指定がある ${declared.length} 列で ${pt(fixed)}pt` +
          (flex > 0 ? ` ＋ 指定の無い ${flex} 列に最低 ${MIN_FLEX_WIDTH}pt ずつ` : "") +
          `）。刷ると全体が縮められて、どの列も読めなくなります。`,
        "列の width を減らす・列を減らす・paper.orientation を landscape にする、" +
          "のどれかです（width は紙の上ではポイント＝1/72 inch。画面の px を" +
          "そのまま書くと広すぎます）。",
      );
    }
  }

  const rows = typeof report.rowsPerPage === "number" ? report.rowsPerPage : undefined;
  if (rows !== undefined && rows > 0 && paper.height / rows < MIN_ROW_HEIGHT) {
    warn(
      found,
      "rows-per-page-too-many",
      `${path}.report.rowsPerPage`,
      `1枚 ${rows} 行だと1行あたり ${pt(paper.height / rows)}pt しか取れません` +
        `（${name}の高さ ${pt(paper.height)}pt ÷ ${rows} 行。表題と余白を除くと更に狭くなります）。` +
        `文字がつぶれて、刷っても読めません。`,
      "rowsPerPage を減らしてください（A4 縦なら 30〜40 行が目安）。" +
        "どうしても載せたいなら、大きい紙か横向きにします。",
    );
  }
}
