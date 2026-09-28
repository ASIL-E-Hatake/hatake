import type { ActionDefinition } from "@hatake-fw/api/internal";

import type { Notifier } from "./notifier.js";
import type { DataRecord } from "./repository.js";

/**
 * 通らなかった1行。
 *
 * 鍵は定義が行を指すのに使っているもの（`page.key`）なので、**枠組みは業務を
 * 何も知らないまま**文言に入れたり、その行を選び直したりできる。
 */
export interface FailedRow {
  readonly key: unknown;
  /** なぜ通らなかったかを、業務の言葉で。無ければ「通らなかった」だけ。 */
  readonly reason?: string;
}

/**
 * 一括の handler がどう終わったか。
 *
 * **一部だけ通るのが普通**（5件のうち1件はもう出荷済み）で、それは成功でも失敗でも
 * ない。ここで報告してもらえば、**定義の言葉で**「どちらだったか」を枠組みが言える
 * ＝ handler ごとに違う通知を作らせない。
 */
export class ActionOutcome {
  /** 通った行数。 */
  readonly succeeded: number;
  /** 通らなかった行数（出荷済み・サーバに断られた…）。 */
  readonly failed: number;
  /**
   * **そもそも送っていない**行数。区切って実行するとき（`batchSize`）だけ 0 より
   * 大きくなる。
   *
   * **「実行していない」と「失敗した」は別。** 失敗はやり直す相手、実行していない
   * ぶんはもう一度押す相手なので、数も別に持つ。
   */
  readonly skipped: number;
  /**
   * 通らなかった行を**名指しした**もの。数えただけの handler なら空。
   *
   * 「3件失敗しました」だけでは、現場は全部やり直すしかない。名指しできれば
   * その3件だけ直せる（文言の `{failedKeys}` に入る）。
   *
   * [[failed]] より短いことがある＝3件失敗したが1件しか名指しできない handler は
   * そう言い、枠組みは「3件のうち1件が分かっています」と報告する。
   */
  readonly rows: readonly FailedRow[];

  constructor(given: Partial<ActionOutcome> = {}) {
    this.succeeded = given.succeeded ?? 0;
    this.failed = given.failed ?? 0;
    this.skipped = given.skipped ?? 0;
    this.rows = given.rows ?? [];
  }

  /** 行を名指しできるときの普通の形（**数は行から出す**ので食い違えない）。 */
  static rejected(options: { succeeded?: number; rows: readonly FailedRow[] }): ActionOutcome {
    return new ActionOutcome({
      succeeded: options.succeeded ?? 0,
      failed: options.rows.length,
      rows: options.rows,
    });
  }

  /**
   * 1件も失敗せず、**送り残しも無い**。`onSuccess` が動く。
   *
   * 途中で止めた実行は成功ではない。ここで `onSuccess` を動かすと画面が移って、
   * 動いていない行が視界から消える。
   */
  get isSuccess(): boolean {
    return this.failed === 0 && this.skipped === 0;
  }

  /**
   * 通ったものと通らなかったものが両方ある。**`onSuccess` は動かさない**
   * （5件中1件が失敗した画面から移ると、直すべき1件が見えなくなる）。
   */
  get isPartial(): boolean {
    return this.failed > 0 && this.succeeded > 0;
  }

  get total(): number {
    return this.succeeded + this.failed;
  }

  /** 区切りごとの報告を1つにまとめる（何回に分けたかは枠組みの都合なので出さない）。 */
  merge(other: ActionOutcome): ActionOutcome {
    return new ActionOutcome({
      succeeded: this.succeeded + other.succeeded,
      failed: this.failed + other.failed,
      skipped: this.skipped + other.skipped,
      rows: [...this.rows, ...other.rows],
    });
  }

  /** 送らなかったぶんを足した写し（中断・途中で止めたとき）。 */
  withSkipped(count: number): ActionOutcome {
    return new ActionOutcome({
      succeeded: this.succeeded,
      failed: this.failed,
      skipped: this.skipped + count,
      rows: this.rows,
    });
  }

  /**
   * 名指しした行の鍵（鍵が無いものは外す）。
   *
   * 鍵の無い行は文言に書けない（書く字が無い）ので、ここには出さず画面の一覧にだけ出す。
   */
  get failedKeys(): unknown[] {
    return this.rows.filter((one) => one.key !== undefined && one.key !== null).map((one) => one.key);
  }

  /** 失敗を全部名指しできているか（部分的にしか分かっていないなら、そう言うため）。 */
  get namesEveryFailure(): boolean {
    return this.rows.length >= this.failed;
  }
}

/** handler に渡すもの。 */
export interface ActionContext {
  /** 押された画面の controller（`CrudController` など）。 */
  readonly controller: Notifier;
  /** 押されたボタンの定義。 */
  readonly action: ActionDefinition;
  /** 行のボタンなら、その行。画面のボタンなら無い。 */
  readonly record?: DataRecord;
  /**
   * `scope: selection` で選ばれていた行。それ以外では空。
   *
   * **鍵ではなく行そのもの**なのは、一括の handler はたいてい項目を1つ2つ見て
   * 判断するため（状態・金額）。読み直させるとボタン1つが N 回の通信になる。
   */
  readonly records: readonly DataRecord[];
  /**
   * `prompt` に入力された値。
   *
   * 入力は**フォームと同じ検証**（`required` / `validators` / `computed`）を
   * 通ってから届くので、handler が言われたことを再確認しなくていい。
   */
  readonly input: DataRecord;
  /**
   * どう終わったかを枠組みに伝える。**押した人が見る文言は定義から出る**
   * （`onSuccess.message` / `onError.message`）。
   *
   * 省いてよい。戻れば成功・投げれば失敗として扱う。報告が要るのは**一部だけ
   * 通った**とき（一括が始終ぶつかる形）。
   */
  readonly report: (outcome: ActionOutcome) => void;
}

/** `type: plugin` のボタンの中身。 */
export type ActionHandler = (context: ActionContext) => Promise<void> | void;

/**
 * `type: plugin` の名前から handler を引く。
 *
 * **枠組みは副作用のあるボタンを1つも持たない。** アプリとプラグインが自分で登録する。
 */
export class ActionRegistry {
  private readonly _handlers = new Map<string, ActionHandler>();

  constructor(handlers: Readonly<Record<string, ActionHandler>> = {}) {
    for (const [key, handler] of Object.entries(handlers)) this._handlers.set(key, handler);
  }

  resolve(key: string): ActionHandler | undefined {
    return this._handlers.get(key);
  }

  register(key: string, handler: ActionHandler): void {
    this._handlers.set(key, handler);
  }

  has(key: string): boolean {
    return this._handlers.has(key);
  }

  /** 登録された名前。組み込みは無いので**全部がアプリの登録**（申告に使う）。 */
  get customKeys(): string[] {
    return [...this._handlers.keys()].sort();
  }
}
