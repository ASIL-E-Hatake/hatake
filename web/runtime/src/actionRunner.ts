import { FormatterRegistry, toCsv } from "@hatake-fw/api";
import type { ColumnDefinition } from "@hatake-fw/api";
import type {
  ActionDefinition,
  FieldDefinition,
  ReportPageDefinition,
} from "@hatake-fw/api/internal";
import {
  ActionOpens,
  ActionScopes,
  ActionTypes,
  batchSizeFor,
  bulkRemainingText,
  csvOptionsFromConfig,
  evaluateCondition,
  isAllowed,
  recordKeyOf,
  rowLimitFor,
} from "@hatake-fw/api/internal";

import { ActionOutcome, type ActionRegistry } from "./action.js";
import { type AppMessage, MessageCenter } from "./messages.js";
import { Notifier } from "./notifier.js";
import type { DataRecord } from "./repository.js";
import { resolveRouteParams, type HatakeRouter } from "./router.js";
import type { ExportSink, PrintSink } from "./sinks.js";

/**
 * ボタンを押したときに起きること**ぜんぶ**。
 *
 * **ここは描かない。** 押せるか・聞くか・何件ずつ送るか・何と言うかは全部業務の
 * 決めごと（定義に書いてある）なので土台が持ち、Renderer は
 *
 *   ・[[visible]] が返したボタンを並べる
 *   ・[[enabledFor]] が押せないと言ったら押せなくして、理由を添える
 *   ・聞く口（`ask`）が呼ばれたらダイアログを出して、答えを返す
 *   ・[[message]] が在れば出す
 *   ・[[progress]] が在れば進み具合を出す
 *
 * だけをする。Vue と React で同じ判断を2回書くと必ず食い違うので、判断はここ1か所。
 * Flutter 側は `hatake_material` の `page_actions.dart` が同じことをしている。
 *
 * **入れていないもの**（Material 側には在る）: 区切って実行している最中に人が止める
 * 口と、終わらなかった行をその場で CSV に落とす口。どちらも進捗ダイアログの作り方に
 * 引きずられるので、Web 側は先に土台を通してから入れる。
 */
export class ActionRunner extends Notifier {
  private readonly _actions: ActionRegistry | undefined;
  private readonly _exportSink: ExportSink | undefined;
  private readonly _printSink: PrintSink | undefined;
  private readonly _router: HatakeRouter | undefined;
  private readonly _ask: ActionAsker;
  private readonly _formatters: FormatterRegistry;

  /**
   * 押したあとの1行を置く所。
   *
   * アプリが1つ渡していればそこへ書く（**画面を移っても文が残る**）。渡していなければ
   * 自分のぶんを持つので、置き忘れても文は出る。
   */
  readonly messages: MessageCenter;

  private _roles: readonly string[];
  private _progress: ActionProgress | null = null;
  private _running: string | null = null;
  /** 中断を頼まれたか（まだ送っていない区切りを送らない）。 */
  private _cancel = false;
  /** 時計（ミリ秒）。残り時間の見当にだけ使う＝試験で差し替えられるように受け取る。 */
  private readonly _now: () => number;

  constructor(options: {
    roles?: readonly string[];
    actions?: ActionRegistry;
    exportSink?: ExportSink;
    printSink?: PrintSink;
    router?: HatakeRouter;
    formatters?: FormatterRegistry;
    /** 文の置き場（`HatakeApp` が配る）。無ければ自分で持つ。 */
    messages?: MessageCenter;
    /** 聞く所（確認・`prompt`）。渡さないと**聞くボタンは動かない**。 */
    ask?: ActionAsker;
    /** 時計（ミリ秒。既定は `Date.now`）。残り時間の見当にだけ使う。 */
    now?: () => number;
  }) {
    super();
    this._roles = options.roles ?? [];
    this._actions = options.actions;
    this._exportSink = options.exportSink;
    this._printSink = options.printSink;
    this._router = options.router;
    this._formatters = options.formatters ?? new FormatterRegistry();
    this._ask = options.ask ?? (() => Promise.resolve(null));
    this.messages = options.messages ?? new MessageCenter();
    this._now = options.now ?? (() => Date.now());
  }

  get roles(): readonly string[] {
    return this._roles;
  }
  setRoles(roles: readonly string[]): void {
    this._roles = roles;
    this.notify();
  }

  /** いま人に見せる1行（[[messages]] の写し）。 */
  get message(): ActionMessage | null {
    return this.messages.message;
  }
  clearMessage(): void {
    this.messages.clear();
  }

  /** 区切って実行している最中だけ在る。 */
  get progress(): ActionProgress | null {
    return this._progress;
  }

  /**
   * 区切って実行している一括を**中断する**（Flutter の「中断（ここまでは実行されます）」と同じ）。
   *
   * 止めるのは「まだ送っていない区切りを送らない」だけ。送った区切りは動いている
   * （取り消しではない）。送り残した行は選び直されて、`{skipped}` に数えられる。
   */
  cancel(): void {
    if (this._progress === null || this._cancel) return;
    this._cancel = true;
    this._progress = { ...this._progress, cancelling: true };
    this.notify();
  }

  /**
   * 画面が自分で聞くときの口（組み込みの「削除」など、定義のボタンではないもの）。
   * **聞く場所を1つにする**ため、ボタンと同じダイアログを使う。
   */
  ask(ask: ActionAsk): Promise<DataRecord | null> {
    return this._ask(ask);
  }

  /** いま走っているボタンの id（二度押しを止めるのに使う）。 */
  get running(): string | null {
    return this._running;
  }

  /**
   * その場所に出すボタン。
   *
   * **見える／見えないは役割だけで決まる**（`roles`）。押せる／押せないは別
   * （[[enabledFor]]）で、見えているのに押せないほうが「なぜ押せないか」を言えるぶん
   * 親切。
   */
  visible(actions: readonly ActionDefinition[], scope: string): ActionDefinition[] {
    return actions.filter((one) => one.scope === scope && isAllowed(one.roles, this._roles));
  }

  /**
   * そのボタンが**いま押せるか**（`enabledWhen`）。
   *
   * 判定する相手は置き場所で決まる。選んだ行に対しては**全部満たすときだけ**押せる
   * ＝一部だけ動くものを作らない（選んだうちの一部だけが動いたことに、押した人は
   * 気づけない）。判定する相手が無ければ押せるまま。
   */
  enabledFor(
    action: ActionDefinition,
    where: { record?: DataRecord; rows?: readonly DataRecord[]; mode?: string } = {},
  ): ActionEnabled {
    const condition = action.enabledWhen;
    if (condition === undefined || Object.keys(condition).length === 0) {
      return { enabled: true, failing: 0, fields: [] };
    }
    const fields = conditionFields(condition);
    if (where.rows !== undefined) {
      const failing = where.rows.filter(
        (row) => !evaluateCondition(condition, row, where.mode),
      ).length;
      return { enabled: failing === 0, failing, fields };
    }
    if (where.record === undefined) return { enabled: true, failing: 0, fields };
    return {
      enabled: evaluateCondition(condition, where.record, where.mode),
      failing: 0,
      fields,
    };
  }

  /**
   * そのボタンが**まだ繋がっていない**か（`type: plugin` なのにハンドラが未登録）。
   *
   * 押してから「未登録です」と言うのが最後の砦だが、登録は押す前に引けるので押す前に
   * 言う。**押すまで気づけない**のがこの枠組みで一番まずい転び方なので、ここだけは
   * 最後の砦に任せない。
   */
  unwiredReason(action: ActionDefinition): string | null {
    if (action.type !== ActionTypes.plugin) return null;
    const name = action.plugin;
    if (name === undefined || name === "") return null;
    if (this._actions?.has(name) === true) return null;
    return `まだ繋がっていません（プラグイン "${name}" が登録されていません）`;
  }

  /** 1回で実行してよい行数の上限（`maxRows`）。**undefined = 上限なし**。 */
  limitFor(action: ActionDefinition): number | undefined {
    return rowLimitFor(action.maxRows, this._roles);
  }

  /** 選びすぎているなら、その上限（押せなくする理由に使う）。 */
  overLimit(action: ActionDefinition, count: number): number | undefined {
    const limit = this.limitFor(action);
    return limit !== undefined && count > limit ? limit : undefined;
  }

  /**
   * 押す。**宣言された段取りを順に通す**: 聞く → 実行 → うまくいったときだけ
   * `onSuccess`。
   *
   * 返すのは「実行できたか」。呼んだ側（選択を持っている一覧）が、成功したときだけ
   * 選び直せるようにするため。
   */
  async run(action: ActionDefinition, around: ActionSurroundings): Promise<boolean> {
    const rows = around.records ?? [];
    // 押す前に分かっているのは**件数だけ**。`{count}` はここで埋まる
    // （1件ずつのボタンでは件数が無いので埋めない）。
    const count = action.scope === ActionScopes.selection ? rows.length : undefined;

    const limit = this.limitFor(action);
    if (count !== undefined && limit !== undefined && count > limit) {
      this._say(`一度に実行できるのは ${limit} 件までです（${count} 件選ばれています）`, false);
      return false;
    }

    // 聞くことが在るなら、その OK が確認そのもの（ダイアログを2枚出さない）。
    let input: DataRecord = {};
    if (action.prompt !== undefined) {
      // 既定の字は Flutter 版（`action_prompt.dart`）と同じ。聞く相手が「押したボタン」
      // なので、書いていなければ**ボタンの名前**が題と OK になる。
      const answer = await this._ask({
        action,
        count,
        title:
          fillCount(action.prompt.title, count) ?? fillCount(action.confirm?.title, count) ?? action.label,
        okLabel: action.prompt.okLabel ?? action.confirm?.okLabel ?? action.label,
        cancelLabel: action.prompt.cancelLabel ?? action.confirm?.cancelLabel ?? "キャンセル",
        danger: action.confirm?.danger ?? false,
        fields: action.prompt.fields,
      });
      if (answer === null) return false; // やめた＝何も起きない
      input = answer;
    } else if (action.confirm !== undefined) {
      const answer = await this._ask(confirmAsk(action, count));
      if (answer === null) return false;
    }

    this._running = action.id;
    this.notify();
    let outcome: ActionOutcome | null;
    try {
      outcome = await this._dispatch(action, { ...around, records: rows }, input);
    } catch (error) {
      // 投げっぱなしにすると**押しても何も起きない**（console にだけ出る）。
      this._say(failureText(action, { error }), false);
      return false;
    } finally {
      this._running = null;
      this._progress = null;
      this.notify();
    }

    // null＝実行できなかった／失敗した。何と言うかは _dispatch が既に言っている
    // （言う場所を散らすと、失敗の文言が種類ごとに変わる）。
    if (outcome === null) return false;

    const success = action.onSuccess;
    if (success?.message !== undefined) {
      this._say(fillAfter(success.message, { outcome }), true);
    }
    if (success?.page !== undefined) {
      this._router?.go(success.page, resolveRouteParams(success.params, around.record));
    }
    return true;
  }

  // ── ここから下は「どう実行するか」 ──────────────────────────

  private async _dispatch(
    action: ActionDefinition,
    around: ActionSurroundings,
    input: DataRecord,
  ): Promise<ActionOutcome | null> {
    const rows = around.records ?? [];

    // 選んだ行にまとめて実行できるのは、いまはアプリ側の処理だけ。「消す」をまとめる
    // のは、取り消せない操作の事故を大きくするので入れていない（Flutter 側と同じ）。
    if (action.scope === ActionScopes.selection && action.type !== ActionTypes.plugin) {
      this._say(
        `アクション "${action.id}" は選んだ行に対しては実行できません` +
          "（scope: selection は type: plugin だけ）",
        false,
      );
      return null;
    }

    if (action.type === ActionTypes.create) {
      if (around.onCreate === undefined) {
        this._say(`アクション "${action.id}" はこの画面では使えません`, false);
        return null;
      }
      await around.onCreate();
      // 入力を開いただけ＝まだ結果は出ていないので `onSuccess` は動かさない。
      return null;
    }

    if (action.type === ActionTypes.navigate) {
      return this._navigate(action, around.record) ? new ActionOutcome() : null;
    }

    if (action.type === ActionTypes.export) {
      return (await this._export(action, around)) ? new ActionOutcome() : null;
    }

    if (action.type === ActionTypes.print) {
      return (await this._print(action, around)) ? new ActionOutcome() : null;
    }

    if (action.type !== ActionTypes.plugin) {
      this._say(`アクション "${action.id}" は未実装です`, false);
      return null;
    }

    const handler =
      action.plugin === undefined ? undefined : this._actions?.resolve(action.plugin);
    if (handler === undefined) {
      this._say(`アクション "${action.id}" のハンドラが未登録です`, false);
      return null;
    }

    /** 区切り1つぶんを呼ぶ。**何も言わずに戻った＝うまくいった。** */
    const call = async (part: readonly DataRecord[]): Promise<ActionOutcome> => {
      let reported: ActionOutcome | null = null;
      await handler({
        controller: around.controller,
        action,
        record: around.record,
        records: part,
        input,
        report: (given) => {
          reported = given;
        },
      });
      // 渡した行数を件数として扱う＝`{count}` がハンドラの手間ゼロで埋まる。
      return reported ?? new ActionOutcome({ succeeded: part.length });
    };

    // 何件ずつかは**その人の役割で決まる**（回線の細い拠点は小さく、社内は大きく）。
    const batchSize = batchSizeFor(action.batchSize, this._roles);
    const batched =
      action.scope === ActionScopes.selection &&
      batchSize !== undefined &&
      rows.length > batchSize;

    if (!batched) return this._afterPlugin(action, await call(rows), rows, around);

    let outcome = new ActionOutcome();
    let done = 0;
    const started = this._now();
    this._cancel = false;
    try {
      for (let at = 0; at < rows.length; at += batchSize) {
        // 中断を頼まれたら、**次の区切りを送らない**（送り残しは下で `{skipped}` になる）。
        if (this._cancel) break;
        const part = rows.slice(at, at + batchSize);
        // 残り時間は区切りの境目でだけ見積もる（毎秒動かしても、待つ人には揺れるだけ）。
        const seconds = Math.floor((this._now() - started) / 1000);
        this._progress = {
          done,
          total: rows.length,
          remaining: bulkRemainingText(done, rows.length, seconds),
          cancelling: false,
        };
        this.notify();
        outcome = outcome.merge(await call(part));
        // 区切りが失敗したら**そこで止める**。残りは「送っていない」（`{skipped}`）。
        if (!outcome.isSuccess) break;
        done += part.length;
      }
    } finally {
      this._progress = null;
      this._cancel = false;
      this.notify();
    }
    // 終わっていない行（送っていない行）は「失敗」ではなく「送り残し」。
    const rest = rows.length - done;
    if (rest > 0) outcome = outcome.withSkipped(rest);
    return this._afterPlugin(action, outcome, rows.slice(done), around);
  }

  /**
   * 一括のあと始末。
   *
   * **終わっていない行は選んだままにする**＝もう一度押せば続きから動く。全部送った
   * うえで一部が失敗したなら、**失敗した行だけ**を選んだ状態にする（その行だけ直せる）。
   * 送った行を選び直さないのは、同じ行に二度実行するのがまず事故だから。
   */
  private _afterPlugin(
    action: ActionDefinition,
    outcome: ActionOutcome,
    unfinished: readonly DataRecord[],
    around: ActionSurroundings,
  ): ActionOutcome | null {
    if (outcome.isSuccess) return outcome;

    if (unfinished.length > 0) {
      around.setSelection?.(unfinished.map((row) => recordKeyOf(around.keyFields ?? [], row)));
    } else {
      const failed = outcome.failedKeys;
      if (failed.length > 0) around.setSelection?.(failed);
    }

    // **一部でも `onSuccess` は動かさない**（1件失敗したまま画面を移すと、直すべき行が
    // 視界から消える）。
    this._say(failureText(action, { outcome }), false);
    return null;
  }

  private _navigate(action: ActionDefinition, record: DataRecord | undefined): boolean {
    const page = action.config.page;
    if (this._router === undefined || typeof page !== "string") {
      this._say(`遷移先が解決できません（"${action.id}"）`, false);
      return false;
    }
    const params = resolveRouteParams(
      action.config.params as Record<string, unknown> | undefined,
      record,
    );
    // 既定は「いまの画面の続き」。`open: tab` と書いたものだけ別のタブで開く
    // （並べる場所が無いアプリでは無視される＝書いても壊れない）。
    const opened = this._router.navigate(page, params, action.open === ActionOpens.tab);
    if (!opened) this._say("これ以上タブを開けません", false);
    return opened;
  }

  private async _export(action: ActionDefinition, around: ActionSurroundings): Promise<boolean> {
    if (this._exportSink === undefined) {
      this._say(`アクション "${action.id}" の出力先が未登録です（exportSink）`, false);
      return false;
    }
    if (around.fetchRows === undefined || around.columns === undefined) {
      this._say(`アクション "${action.id}" はこの画面では出力できません`, false);
      return false;
    }
    // **見えない列は出さない**（画面で隠した原価が CSV から漏れる、を作らない）。
    const columns = around.columns.filter((one) => isAllowed(one.roles, this._roles));
    const options = csvOptionsFromConfig(action.config);
    const limit = action.config.limit;
    const rows = await around.fetchRows(typeof limit === "number" ? limit : 10_000);
    await this._exportSink({
      filename: exportFilename(action, around.fallbackName ?? "出力"),
      // 文字コードは MIME にも載せる（受け取り側がそのまま使えるように）。
      mimeType: isUtf8(options.charset) ? "text/csv" : `text/csv; charset=${options.charset}`,
      text: toCsv(
        columns as ColumnDefinition[],
        rows as DataRecord[],
        options,
        this._formatters,
        [...(around.owners ?? [])],
      ),
      charset: options.charset,
      actionId: action.id,
    });
    return true;
  }

  private async _print(action: ActionDefinition, around: ActionSurroundings): Promise<boolean> {
    if (this._printSink === undefined) {
      this._say(`アクション "${action.id}" の刷る先が未登録です（printSink）`, false);
      return false;
    }
    // 刷れるのは帳票だけ（紙の形は `report` が決めるので、無ければ紙が無い）。
    const document = around.printDocument?.();
    if (document === undefined) {
      this._say(
        `アクション "${action.id}" はこの画面では刷れません（type: print は帳票の画面だけ）`,
        false,
      );
      return false;
    }
    // **待つ。** 0.9.24 までは投げっぱなしで、刷る口が失敗しても「刷った」ことになって
    // いた（失敗は console にだけ出る）。出す口（export）と Flutter は待っていた。
    await this._printSink({
      filename: printFilename(action, around.fallbackName ?? "帳票"),
      document,
      actionId: action.id,
      ...(around.reportPage === undefined ? {} : { page: around.reportPage }),
      roles: this._roles,
      formatters: this._formatters,
      config: action.config,
    });
    return true;
  }

  private _say(text: string, ok: boolean): void {
    this.messages.say(text, ok);
  }
}

/**
 * 「押してよいか」だけを聞く形。既定の字は Flutter 版（`_confirmAction`）と同じ:
 * 取り消せない操作なら「確認」「削除」、そうでなければ「実行の確認」「OK」。
 *
 * `delete` は `confirm` を書いていなくても**必ず聞く**（取り消せない唯一の操作）。
 * それは画面側が `destructive: true` で呼ぶ。
 */
export function confirmAsk(
  action: ActionDefinition,
  count?: number,
  options: { destructive?: boolean } = {},
): ActionAsk {
  const danger = action.confirm?.danger ?? options.destructive ?? false;
  return {
    action,
    count,
    title: fillCount(action.confirm?.title, count) ?? (danger ? "確認" : "実行の確認"),
    message: fillCount(action.confirm?.message, count) ?? "この操作を実行してもよろしいですか？",
    okLabel: action.confirm?.okLabel ?? (danger ? "削除" : "OK"),
    cancelLabel: action.confirm?.cancelLabel ?? "キャンセル",
    danger,
    fields: [],
  };
}

/** 押したときに人へ聞くこと。`fields` が空なら確認だけ。 */
export interface ActionAsk {
  readonly action: ActionDefinition;
  /** 選んだ行数（`scope: selection` のときだけ）。 */
  readonly count?: number;
  readonly title: string;
  readonly message?: string;
  readonly okLabel: string;
  readonly cancelLabel: string;
  /** 取り消せない操作か（OK のボタンを危険色にする）。 */
  readonly danger: boolean;
  readonly fields: readonly FieldDefinition[];
}

/**
 * 聞く口。**答えたら値、やめたら null。**
 *
 * 確認だけ（`fields` が空）のときは `{}` を返せば「はい」。
 */
export type ActionAsker = (ask: ActionAsk) => Promise<DataRecord | null>;

/** 押したあとに人へ出す1行（[[MessageCenter]] が持つもの）。 */
export type ActionMessage = AppMessage;

/** 区切って実行している最中の進み具合。 */
export interface ActionProgress {
  readonly done: number;
  readonly total: number;
  /**
   * 「あと N 分くらい」。見当が付かないうちは null（言わない）。言い方は Flutter と同じ
   * （`bulkRemainingText`＝共有フィクスチャ `bulk_progress.json`）。
   */
  readonly remaining: string | null;
  /** 中断を頼まれて、いまの区切りが終わるのを待っている。 */
  readonly cancelling: boolean;
}

/** そのボタンが押せるか（押せないなら、何で決まっているか）。 */
export interface ActionEnabled {
  readonly enabled: boolean;
  /** 選んだ行のうち条件に合わない行の数（一括のときだけ）。 */
  readonly failing: number;
  /** 条件が見ている項目（押せない理由を言うのに使う）。 */
  readonly fields: readonly string[];
}

/** 押した画面が持っているもの。**画面ごとに在るものだけ渡す。** */
export interface ActionSurroundings {
  /** 押された画面の controller（handler にそのまま渡る）。 */
  readonly controller: Notifier;
  /** 行のボタンなら、その行。入力する画面なら**いま入力されている値**。 */
  readonly record?: DataRecord;
  /** `scope: selection` で選ばれていた行。 */
  readonly records?: readonly DataRecord[];
  /** 行を指す項目（失敗した行を名指しするのに使う）。 */
  readonly keyFields?: readonly string[];
  /** 入力する画面の状態（`{ field: $mode }` の判定用）。 */
  readonly mode?: string;
  /** 出力する列（`type: export`）。 */
  readonly columns?: readonly ColumnDefinition[];
  /** 選択肢を持っているもの（CSV の字を画面とそろえる）。 */
  readonly owners?: readonly { field: string; options?: { value: unknown; label: string }[] }[];
  /** 出力のときにもう一度引く口（画面に出ている行だけを出さないため）。 */
  readonly fetchRows?: (limit: number) => Promise<readonly DataRecord[]>;
  /** 刷る紙（帳票の画面だけが持つ）。 */
  readonly printDocument?: () => unknown;
  /** 帳票の定義（刷る口が紙に組むのに要る）。 */
  readonly reportPage?: ReportPageDefinition;
  /** 既定のファイル名（画面の題）。 */
  readonly fallbackName?: string;
  /** `type: create` を受ける口（一覧が入力を開く）。 */
  readonly onCreate?: () => void | Promise<void>;
  /** 選び直す口（終わっていない行・失敗した行を残す）。 */
  readonly setSelection?: (keys: readonly unknown[]) => void;
}

/** 条件が見ている項目名（押せない理由を業務の言葉で言うため）。 */
function conditionFields(condition: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (one: unknown): void => {
    if (Array.isArray(one)) {
      for (const each of one) walk(each);
      return;
    }
    if (one === null || typeof one !== "object") return;
    const node = one as Record<string, unknown>;
    if (typeof node.field === "string") out.push(node.field);
    for (const key of ["all", "any", "not"]) walk(node[key]);
  };
  walk(condition);
  return [...new Set(out)];
}

/**
 * 走る前に埋まるのは `{count}` だけ。
 *
 * `{failed}` を埋めないのは、まだ1件も失敗していないから（0 と出すのは嘘）。
 * 埋まらなかった差し込みは**字のまま出る**ので、「当てはまらなかった」と読める。
 */
function fillCount(template: string | undefined, count: number | undefined): string | undefined {
  if (template === undefined || count === undefined) return template;
  return template.replaceAll("{count}", String(count));
}

/**
 * 走ったあとに埋まるもの。
 *
 * 件数は**分かっているときだけ**埋める。`0 件を実行しました` と出すのは嘘で、
 * `{count}` が見えたままのほうが「この差し込みは当てはまらなかった」と読める
 * （`hatake validate` も押す前に同じことを言う）。
 */
function fillAfter(template: string, given: { error?: unknown; outcome?: ActionOutcome }): string {
  let text = template;
  if (given.error !== undefined) {
    text = text.replaceAll("{error}", messageOf(given.error));
  }
  const outcome = given.outcome;
  if (outcome !== undefined && outcome.total > 0) {
    text = text
      .replaceAll("{count}", String(outcome.succeeded))
      .replaceAll("{failed}", String(outcome.failed))
      .replaceAll("{total}", String(outcome.total));
  }
  // 送っていない件数。区切って途中で止めたときだけ（止めていないなら 0 は嘘）。
  if (outcome !== undefined && outcome.skipped > 0) {
    text = text.replaceAll("{skipped}", String(outcome.skipped));
  }
  // 行を名指しできたときだけ。件数しか報告していないなら字のまま出す
  // ＝`{failedKeys}` が見えている＝「アプリ側が行を報告していない」と読める。
  const keys = outcome?.failedKeys ?? [];
  if (keys.length > 0) text = text.replaceAll("{failedKeys}", keys.map(String).join(", "));
  return text;
}

/** 失敗したときに出す1行。**定義の `onError` が在ればそれで差し替える。** */
function failureText(
  action: ActionDefinition,
  given: { error?: unknown; outcome?: ActionOutcome },
): string {
  const declared = action.onError?.message;
  if (declared !== undefined) return fillAfter(declared, given);
  const outcome = given.outcome;
  if (outcome !== undefined) {
    const named = outcome.failedKeys;
    const tail =
      named.length > 0
        ? `通らなかった行: ${named.map(String).join(", ")}`
        : `${outcome.failed} 件が通りませんでした`;
    const rest = outcome.skipped > 0 ? `${outcome.skipped} 件は送っていません` : "";
    if (outcome.succeeded > 0) {
      return `${outcome.succeeded} 件を実行しました（${tail}${rest === "" ? "" : `、${rest}`}）`;
    }
    return `${outcome.failed} 件すべて失敗しました${rest === "" ? "" : `（${rest}）`}`;
  }
  const error = messageOf(given.error);
  if (action.type === ActionTypes.export) return `出力に失敗しました: ${error}`;
  if (action.type === ActionTypes.print) return `印刷に失敗しました: ${error}`;
  return `アクション "${action.id}" が失敗しました: ${error}`;
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isUtf8 = (charset: string): boolean =>
  ["utf-8", "utf8", "utf_8"].includes(charset.toLowerCase());

/** `config.filename`、無ければ画面の題。拡張子が無ければ付ける。 */
const exportFilename = (action: ActionDefinition, fallback: string): string => {
  const name = action.config.filename === undefined ? fallback : String(action.config.filename);
  return name.includes(".") ? name : `${name}.csv`;
};

const printFilename = (action: ActionDefinition, fallback: string): string => {
  const name = action.config.filename === undefined ? fallback : String(action.config.filename);
  return name.includes(".") ? name : `${name}.pdf`;
};
