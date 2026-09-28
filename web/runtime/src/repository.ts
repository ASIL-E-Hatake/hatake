// 外のデータとの境目。**枠組みは HTTP も DB も ORM も知らない。**
//
// Dart 側の `Repository`（`hatake_core`）と同じ契約を、そのまま TypeScript にしたもの。
// 3版で同じ形にしておかないと、同じ定義から出した画面が版ごとに違う口を要求する
// ことになる（案件のサーバは1つなのに）。
//
// 実装を書くのは**利用者**で、枠組みは名前（`repository: "customerRepository"`）で
// 引くだけ。REST に載せるだけなら `@hatake-fw/http` が1つ持っている。

/** 枠組みから見た1件。**型は付けない**（定義が形を持っているので、二重に持たない）。 */
export type DataRecord = Record<string, unknown>;

/** 一覧・検索で Repository に渡すもの。画面の条件は**解決済み**で届く。 */
export interface RepositoryQuery {
  /** 項目名をキーにした絞り込みの値。 */
  readonly filters: Readonly<Record<string, unknown>>;
  /** 0 から数えるページ番号。 */
  readonly page: number;
  /** 1ページの件数。 */
  readonly pageSize: number;
  /** 並べ替えの項目。無いときは Repository の既定の順。 */
  readonly sortField?: string;
  /** 昇順か。`sortField` が無いときは見ない。 */
  readonly sortAscending: boolean;
}

/** 1ページ分と、総件数（ページ送りに要る）。 */
export interface PageResult {
  readonly items: readonly DataRecord[];
  readonly totalCount: number;
}

export const emptyPage: PageResult = { items: [], totalCount: 0 };

export const repositoryQuery = (given: Partial<RepositoryQuery> = {}): RepositoryQuery => ({
  filters: given.filters ?? {},
  page: given.page ?? 0,
  pageSize: given.pageSize ?? 50,
  sortField: given.sortField,
  sortAscending: given.sortAscending ?? true,
});

/**
 * 枠組みが頼りにする唯一のデータ口。
 *
 * `findByKey` などが受け取る鍵が `unknown` なのは、**1件を決める列が1つとは限らない**
 * ため（0.9.7 の複合キー）。単一なら素の値、複合なら並びが来る。
 */
export interface Repository {
  search(query: RepositoryQuery): Promise<PageResult>;
  findByKey(key: unknown): Promise<DataRecord | null>;
  create(data: DataRecord): Promise<DataRecord>;
  update(key: unknown, data: DataRecord): Promise<DataRecord>;
  delete(key: unknown): Promise<void>;
}

/**
 * 画面が名指しした Repository を引く。**枠組みは作らない**（利用者が登録する）。
 *
 * 引けなかったときに黙って何も出さないのではなく**落とす**のは、この枠組みが
 * 潰してきた「書いたのに効かない」を作らないため。画面は出たのに一覧が空、が
 * いちばん見つけにくい。
 */
export class RepositoryRegistry {
  private readonly _repositories: ReadonlyMap<string, Repository>;

  constructor(repositories: Readonly<Record<string, Repository>> = {}) {
    this._repositories = new Map(Object.entries(repositories));
  }

  resolve(key: string): Repository {
    const found = this._repositories.get(key);
    if (found === undefined) {
      throw new Error(
        `Repository "${key}" が登録されていません。` +
          `HatakeScope に渡す RepositoryRegistry に足してください。`,
      );
    }
    return found;
  }

  has(key: string): boolean {
    return this._repositories.has(key);
  }

  /** 登録されている名前。組み込みは無いので、**全部がアプリの登録**（申告に使う）。 */
  get customKeys(): string[] {
    return [...this._repositories.keys()].sort();
  }
}
