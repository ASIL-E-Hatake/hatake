import { AggregateRegistry } from "@hatake-fw/api";
import {
  type AggregateBucket,
  aggregateValue,
  AggregateOps,
  type DashboardItemDefinition,
  type DashboardPageDefinition,
  type DashboardValueDefinition,
  DashboardItemTypes,
  isAllowed,
} from "@hatake-fw/api/internal";

import { Notifier } from "./notifier.js";
import type { DataRecord, PageResult, RepositoryRegistry } from "./repository.js";

/** 1枚のカードの状態。 */
export interface DashboardItemState {
  readonly loading: boolean;
  readonly rows: readonly DataRecord[];
  readonly totalCount: number;
  /** `metric` のカードが出す1つの数。 */
  readonly value: number | null;
  /** `chart` のカードの点。 */
  readonly buckets: readonly AggregateBucket[];
  readonly error: unknown;
}

const initialItemState: DashboardItemState = {
  loading: true,
  rows: [],
  totalCount: 0,
  value: null,
  buckets: [],
  error: null,
};

/**
 * ダッシュボード（`kind: dashboard`）の土台。カード1枚につき小さい問い合わせを
 * 1回ずつ投げて、結果を畳む。
 *
 * **カードは同時に読んで、それぞれが自分の状態を持つ。** 1つの Repository が
 * 落ちても、落ちるのはそのカード1枚だけ。画面の検索欄の値は全部のカードに混ぜる
 * （カード固定の `filters` より**画面の値が勝つ**）。
 */
export class DashboardController extends Notifier {
  readonly definition: DashboardPageDefinition;
  readonly repositories: RepositoryRegistry;
  readonly aggregates: AggregateRegistry;

  /**
   * いま見ている人に出すカード（`roles` で絞ったもの）。
   *
   * **見せないカードは読みにも行かない。** 画面で隠しても問い合わせは飛ぶので、
   * admin にしか見せない数字を tester の端末に運ぶことになる（0.9.19 まではそう
   * なっていた＝隠してもいなかった）。本当の遮断はサーバの仕事だが、わざわざ運ぶ
   * 理由は無い。
   */
  readonly items: readonly DashboardItemDefinition[];

  private readonly _states = new Map<string, DashboardItemState>();
  private _filters: Readonly<Record<string, unknown>> = {};

  constructor(options: {
    definition: DashboardPageDefinition;
    repositories: RepositoryRegistry;
    aggregates?: AggregateRegistry;
    /** いま見ている人の役割。渡さなければ `roles` の無いカードだけ出る。 */
    roles?: readonly string[];
  }) {
    super();
    this.definition = options.definition;
    this.repositories = options.repositories;
    this.aggregates = options.aggregates ?? new AggregateRegistry();
    this.items = options.definition.items.filter((one) => isAllowed(one.roles, options.roles ?? []));
  }

  /** いま全部のカードに当てている条件。 */
  get filters(): Readonly<Record<string, unknown>> {
    return this._filters;
  }

  /** そのカードの状態。最初の結果が来るまでは読み込み中。 */
  stateOf(item: DashboardItemDefinition): DashboardItemState {
    return this._states.get(item.id) ?? initialItemState;
  }

  /** どれか1枚でもまだ読んでいるか。 */
  get loading(): boolean {
    return this.items.some((one) => this.stateOf(one).loading);
  }

  init(): Promise<void> {
    return this.load();
  }

  /** いまの条件で全部のカードを読み直す。 */
  async load(): Promise<void> {
    for (const item of this.items) {
      this._states.set(item.id, initialItemState);
    }
    this.notify();
    await Promise.all(this.items.map((one) => this._loadItem(one)));
  }

  /** 条件を入れ替えて全部のカードを読み直す。 */
  search(filters: Readonly<Record<string, unknown>>): Promise<void> {
    this._filters = filters;
    return this.load();
  }

  private async _loadItem(item: DashboardItemDefinition): Promise<void> {
    try {
      const key = item.repository ?? this.definition.repository;
      if (key === undefined) {
        throw new Error(
          `カード "${item.id}" に repository が在りません。` +
            `カードに書くか、画面に既定を書いてください。`,
        );
      }
      const result = await this.repositories.resolve(key).search({
        // **画面の検索欄がカード固定の条件より勝つ。**
        filters: { ...item.filters, ...this._filters },
        page: 0,
        pageSize: item.limit,
        sortField: item.sortField,
        sortAscending: item.sortAscending,
      });
      this._states.set(item.id, {
        loading: false,
        rows: result.items,
        totalCount: result.totalCount,
        value: this._metricValue(item, result),
        buckets: this._chartBuckets(item, result.items),
        error: null,
      });
    } catch (error) {
      this._states.set(item.id, { ...initialItemState, loading: false, error });
    }
    this.notify();
  }

  /**
   * `metric` のカードの行を1つの数に畳む。
   *
   * `value` が無ければ**件数**。ページで区切った問い合わせが信じられる畳み方は
   * それだけ（合計は「読んだぶんの合計」になってしまう）。
   */
  private _metricValue(item: DashboardItemDefinition, result: PageResult): number | null {
    if (item.type !== DashboardItemTypes.metric) return null;
    const value: DashboardValueDefinition | undefined = item.value;
    // **書いていなければ件数。** ページで区切った問い合わせが信じられる畳み方は
    // それだけ（合計は「読んだぶんの合計」になってしまう）。
    if (value === undefined || value.aggregate === AggregateOps.count) return result.totalCount;
    return this.aggregates.aggregate(value.aggregate, result.items as DataRecord[], value.field);
  }

  /**
   * `chart` のカードの行を点にする。
   *
   * `aggregate` が書いてあればラベルごとに畳み、無ければ1行1点（既に集計済みの
   * データを渡された形）。
   */
  private _chartBuckets(
    item: DashboardItemDefinition,
    rows: readonly DataRecord[],
  ): readonly AggregateBucket[] {
    const chart = item.chart;
    if (chart === undefined) return [];
    if (chart.aggregate !== undefined) {
      return this.aggregates.aggregateBy(
        chart.aggregate,
        rows as DataRecord[],
        chart.labelField,
        chart.valueField,
      );
    }
    return rows.map((row) => ({
      label: row[chart.labelField] === undefined ? "" : String(row[chart.labelField]),
      value: chart.valueField === undefined ? null : aggregateValue(row[chart.valueField]),
    }));
  }
}
