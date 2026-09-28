import { Notifier } from "./notifier.js";
import {
  type DataRecord,
  type PageResult,
  type Repository,
  type RepositoryQuery,
  repositoryQuery,
} from "./repository.js";

/**
 * 一覧を持つ画面（search / crud の一覧側 / master）が共通で使う読み取りの道。
 *
 * **Repository と話すのはここだけ。** 条件・ページ・並べ替えの状態を1か所に置いて、
 * Renderer は結果を描くだけにする。Dart 側の `ListController` と同じ振る舞い。
 */
export class ListController extends Notifier {
  readonly repository: Repository;
  readonly pageSize: number;

  private _query: RepositoryQuery;
  private _loading = false;
  private _error: unknown = null;
  private _items: readonly DataRecord[] = [];
  private _totalCount = 0;

  constructor(options: { repository: Repository; pageSize: number }) {
    super();
    this.repository = options.repository;
    this.pageSize = options.pageSize;
    this._query = repositoryQuery({ pageSize: options.pageSize });
  }

  get query(): RepositoryQuery {
    return this._query;
  }
  get loading(): boolean {
    return this._loading;
  }
  get error(): unknown {
    return this._error;
  }
  get items(): readonly DataRecord[] {
    return this._items;
  }
  get totalCount(): number {
    return this._totalCount;
  }
  get page(): number {
    return this._query.page;
  }

  get pageCount(): number {
    if (this.pageSize <= 0) return 1;
    const count = Math.ceil(this._totalCount / this.pageSize);
    return count < 1 ? 1 : count;
  }

  /** 最初の1ページ。作ったあとに1回呼ぶ。 */
  init(): Promise<void> {
    return this.load();
  }

  /** いまの条件で読み直す。 */
  async load(): Promise<void> {
    this._loading = true;
    this._error = null;
    this.notify();
    try {
      const result: PageResult = await this.repository.search(this._query);
      this._items = result.items;
      this._totalCount = result.totalCount;
    } catch (error) {
      this._error = error;
      this._items = [];
      this._totalCount = 0;
    } finally {
      this._loading = false;
      this.notify();
    }
  }

  /** 条件を入れ替えて、**1ページ目から**読み直す。 */
  search(filters: Readonly<Record<string, unknown>>): Promise<void> {
    this._query = { ...this._query, filters, page: 0 };
    return this.load();
  }

  /** ページを移る（範囲の外と、同じページは何もしない）。 */
  setPage(page: number): Promise<void> {
    if (page < 0 || page >= this.pageCount || page === this._query.page) {
      return Promise.resolve();
    }
    this._query = { ...this._query, page };
    return this.load();
  }

  /** 並べ替えて読み直す。 */
  sortBy(field: string, ascending = true): Promise<void> {
    this._query = { ...this._query, sortField: field, sortAscending: ascending };
    return this.load();
  }

  /**
   * 1件消して読み直す。消した結果そのページが空になるなら1つ戻る。
   *
   * **Repository が断った場合（「まだ受注から参照されています」）も、読み込みの
   * 失敗と同じように `error` に出す。** 投げっぱなしにしないのは、押した人にも
   * 呼んだ側にも「消えなかった」が伝わる必要があるため。
   */
  async deleteRecord(key: unknown): Promise<void> {
    try {
      await this.repository.delete(key);
    } catch (error) {
      this.setError(error);
      return;
    }
    if (this._items.length <= 1 && this._query.page > 0) {
      this._query = { ...this._query, page: this._query.page - 1 };
    }
    await this.load();
  }

  /**
   * 出力のために、いまの条件をもう一度**大きい1ページ**で引く。
   *
   * 画面に出ている行だけを出力すると「見えているものと違う」が起きる。かといって
   * 上限なしで全部持つのも事故なので、`limit` で切る。
   */
  async fetchForExport(limit: number): Promise<readonly DataRecord[]> {
    const result = await this.repository.search({
      ...this._query,
      page: 0,
      pageSize: limit,
    });
    return result.items;
  }

  protected setError(error: unknown): void {
    this._error = error;
    this.notify();
  }
}
