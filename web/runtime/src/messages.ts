import { Notifier } from "./notifier.js";

/** 人に見せる1行。 */
export interface AppMessage {
  readonly text: string;
  /** うまくいったか（見せ方を変えるためだけ。判断はもう終わっている）。 */
  readonly ok: boolean;
}

/**
 * 押したあとの1行を置く所。
 *
 * **画面より上に置く。** `onSuccess` は「言う」と「移る」を同時に書けるので、文を
 * 画面が持っていると**移った先で作り直されて消える**（実際に消えた）。Flutter 側が
 * `ScaffoldMessenger` をアプリに1つ置いているのと同じ理由。
 *
 * `HatakeApp` を使わないアプリ（自前の routing）では、[[ActionRunner]] が自分の
 * ぶんを1つ持つので、置き忘れても文は出る（出る場所が画面の中になるだけ）。
 */
export class MessageCenter extends Notifier {
  private _message: AppMessage | null = null;

  get message(): AppMessage | null {
    return this._message;
  }

  say(text: string, ok: boolean): void {
    this._message = { text, ok };
    this.notify();
  }

  clear(): void {
    if (this._message === null) return;
    this._message = null;
    this.notify();
  }
}
