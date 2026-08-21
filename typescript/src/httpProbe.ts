// 定義を「実際に動いているサーバ」に突き合わせる道具（probe / attack）の HTTP 層。
//
// なぜ最小限か: この層は**縛るためだけ**に在る。汎用のクライアントを置くと、いつか
// 誰かが POST を通す。定義から出せるのは「どこを叩くか」までで、書き込みを試すことは
// 道具の仕事ではない（試すたびにデータが増える・消える）。
//
// なので **GET しか送れない**。方式を間違えたら送る前に落ちる＝道具が壊れても
// 業務データは壊れない。

/** 送る要求。URL は組み立て済みの文字列（問い合わせ文字列も入っている）。 */
export interface HttpRequest {
  /** `GET` だけ。ほかを渡すと [fetchSend] が送る前に落ちる。 */
  method: string;
  url: string;
  headers: Record<string, string>;
}

/** 返ってきたもの。本文は文字のまま持つ（JSON かどうかは呼ぶ側が見る）。 */
export interface HttpResponse {
  status: number;
  body: string;
}

/**
 * 要求を1回送る。試験からは偽のサーバを渡す（通信しないので CI で回る）。
 *
 * 例外を投げてよい（繋がらない・名前が引けない）。呼ぶ側は**落ちずに報告に混ぜる**
 * ＝1画面が繋がらないだけで残りを見られなくなるのは、道具としては役に立たない。
 */
export type HttpSend = (request: HttpRequest) => Promise<HttpResponse>;

/** 読むだけ、を型ではなく実行時に縛る（ここが最後の砦）。 */
export class WriteAttemptError extends Error {
  constructor(method: string) {
    super(
      `${method} は送れません（probe / attack は読むだけの道具です）。` +
        "書き込みを確かめるのは、業務のデータが壊れてよい所で人がやること。",
    );
  }
}

/** Node の `fetch` で送る。GET 以外は送らない。 */
export const fetchSend: HttpSend = async (request) => {
  if (request.method !== "GET") throw new WriteAttemptError(request.method);
  const response = await fetch(request.url, {
    method: "GET",
    headers: request.headers,
    // 認証は渡したヘッダだけで決める（cookie を拾うと「誰として叩いたか」が
    // 分からなくなる＝権限の確認にならない）。
    redirect: "manual",
  });
  return { status: response.status, body: await response.text() };
};

/**
 * 追加のヘッダ（認証など）。`{"authorization": "Bearer …"}` の形の JSON。
 *
 * ファイルから読む形にしてある。トークンを引数に書くと**CI のログと shell の履歴に
 * 残る**ので、渡し方の既定を安全な側にしておく。
 */
export function readHeaders(json: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`--headers の JSON が読めません: ${String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      '--headers は {"authorization": "Bearer …"} の形の JSON にしてください。',
    );
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throw new Error(`--headers の "${key}" が文字列ではありません。`);
    }
    headers[key] = value;
  }
  return headers;
}

/** `--token` で渡されたときの形。 */
export const bearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
});

/** 送るときに必ず付けるもの。 */
export const acceptJson = { accept: "application/json" } as const;
