// REST の失敗を**型で言う**。中身の解釈はしない。
//
// 401 がその案件で何を意味するか（ログイン画面に飛ばす／黙って再試行する）は
// アプリの判断で、枠組みが決めることではない。ここがやるのは「どの種類の失敗か」を
// 区別できる形にするところまで。Dart 側の `hatake_http` と同じ分け方。

/** REST が 2xx 以外を返した。 */
export class RepositoryHttpError extends Error {
  readonly status: number;
  /** どの呼び出しか（`GET /api/customers` など。人が追える字）。 */
  readonly request: string;
  readonly body: string;

  constructor(status: number, request: string, body: string) {
    super(`${request} が ${status} を返しました`);
    this.name = "RepositoryHttpError";
    this.status = status;
    this.request = request;
    this.body = body;
  }
}

/** 401 / 403。**誰が見ているか**の話なので、他の失敗と混ぜない。 */
export class RepositoryUnauthorizedError extends RepositoryHttpError {
  constructor(status: number, request: string, body: string) {
    super(status, request, body);
    this.name = "RepositoryUnauthorizedError";
  }
}

/**
 * 400。サーバ側の検証が弾いた。
 *
 * `{valid, errors: [{field, message}]}` を項目名 → 文言にほどく。**画面と同じ
 * 規則で弾かれている**はずなので、入力欄にそのまま貼れる。
 */
export class RepositoryValidationError extends RepositoryHttpError {
  readonly errors: Readonly<Record<string, string>>;

  constructor(status: number, request: string, errors: Record<string, string>, body: string) {
    super(status, request, body);
    this.name = "RepositoryValidationError";
    this.errors = errors;
  }
}

/**
 * 通信は通ったが、**返ってきた形が契約と違う**。
 *
 * 黙って空の一覧にしないのが要点。「0件」と「形が違う」を混ぜると、画面は出たのに
 * 何も出ない理由が分からなくなる。
 */
export class RepositoryShapeError extends Error {
  readonly request: string;
  readonly expected: string;
  readonly got: string;

  constructor(request: string, expected: string, got: string) {
    super(`${request} が ${expected} を返すはずが、${got} でした`);
    this.name = "RepositoryShapeError";
    this.request = request;
    this.expected = expected;
    this.got = got;
  }
}
