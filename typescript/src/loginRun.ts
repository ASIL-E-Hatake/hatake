// 資格を取る1往復（`--login` の通信する側）。
//
// [httpProbe] と分けてあるのは**GET しか送れない縛りを解かないため**。probe / attack が
// 使う送り口はいまも GET 専用で、ここは「login.json に書いてある1本」だけを送る別の口。
// 業務の口に POST が飛ぶ道は増えていない（このモジュールが組み立てる要求は login.json の
// url だけ）。

import type { HttpResponse } from "./httpProbe.js";
import type { AttackAccounts } from "./attackSweep.js";
import { bodyFor, type LoginPlan, tokenFrom } from "./login.js";

/** 資格を取るために送る1本。 */
export interface LoginRequest {
  method: "POST";
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** 送る口。試験からは偽のサーバを渡す（通信しないので CI で回る）。 */
export type LoginSend = (request: LoginRequest) => Promise<HttpResponse>;

/** Node の `fetch` で送る。POST 以外は組み立てられない（型と実行時の両方で断る）。 */
export const loginFetch: LoginSend = async (request) => {
  if (request.method !== "POST") {
    throw new Error("資格を取るのは POST だけです。");
  }
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
    redirect: "manual",
  });
  return { status: response.status, body: await response.text() };
};

/** その役割で送る1本を組み立てる（`--dry-run` もこれを使う＝出す形と送る形が同じ）。 */
export function loginRequest(plan: LoginPlan, role: string): LoginRequest {
  return {
    method: "POST",
    url: plan.url,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...plan.headers,
    },
    body: JSON.stringify(bodyFor(plan, role) ?? {}),
  };
}

/** 1役割ぶん取る。取れなければ**理由**を返す（トークンは返さない道が無いように）。 */
export async function getToken(
  plan: LoginPlan,
  role: string,
  send: LoginSend,
): Promise<{ token: string } | { error: string }> {
  let response: HttpResponse;
  try {
    response = await send(loginRequest(plan, role));
  } catch (error) {
    return { error: `資格を取る所に繋がりません（${String(error)}）` };
  }
  if (response.status < 200 || response.status >= 300) {
    return { error: `資格が取れませんでした（${response.status} が返りました）` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    return { error: "資格を取る口が JSON を返していません" };
  }
  return tokenFrom(parsed, plan.tokenAt);
}

/** 役割ごとの資格をまとめて取る。取れなかった役割は理由を残す（黙って飛ばさない）。 */
export async function loginAccounts(
  plan: LoginPlan,
  roles: string[],
  send: LoginSend,
): Promise<{ accounts: AttackAccounts; troubles: Record<string, string> }> {
  const accounts: AttackAccounts = {};
  const troubles: Record<string, string> = {};
  for (const role of roles) {
    const got = await getToken(plan, role, send);
    if ("error" in got) {
      troubles[role] = got.error;
      continue;
    }
    accounts[role] = { token: got.token };
  }
  return { accounts, troubles };
}
