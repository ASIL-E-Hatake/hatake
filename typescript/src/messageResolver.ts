/** 既定（日本語）のバリデーションメッセージ。`{value}` などのプレースホルダを持つ。 */
export const defaultValidationMessages: Record<string, Record<string, string>> = {
  ja: {
    required: "必須項目です",
    maxLength: "{value}文字以内で入力してください",
    minLength: "{value}文字以上で入力してください",
    min: "{value}以上で入力してください",
    max: "{value}以下で入力してください",
    pattern: "形式が正しくありません",
    email: "メールアドレスの形式が正しくありません",
    postalCode: "郵便番号の形式が正しくありません",
    // 項目間の検証（compare）。{target} は比べる相手の**ラベル**が入る。
    // 明細の行どうしの検証（unique）。{label} は行の項目の**ラベル**、
    // {rows} は重なっている行の番号（1から数える）。
    unique: "{label} が同じ行があります（{rows} 行目）",
    "compare.equals": "{target}と同じ値にしてください",
    "compare.notEquals": "{target}と違う値にしてください",
    "compare.gt": "{target}より大きい値にしてください",
    "compare.gte": "{target}以上にしてください",
    "compare.lt": "{target}より小さい値にしてください",
    "compare.lte": "{target}以下にしてください",
    // 1回で動かせる件数の上限（`action.maxRows`）を超えて届いたとき。
    // 画面は押させないので、これが出るのは API を直接叩かれたとき。
    // 上位だけ並べた計算項目（`computed` の `limit`）で、出さなかった行の数。
    // `{count}` は**隠れた行数**（全体ではない）。定義の `overflow` で上書きできる。
    "computed.more": "ほか {count} 件",
    "bulk.tooMany": "1回に実行できるのは {value} 件までです（{count} 件届きました）",
  },
};

export interface MessageResolverOptions {
  /** 使用ロケール（既定 "ja"）。 */
  locale?: string;
  /** 既定にマージするロケール別テーブル。 */
  messages?: Record<string, Record<string, string>>;
}

/**
 * メッセージをロケール＋キーで解決する。既定ロケールは日本語。Dart / Java 版と同挙動。
 *
 * 未知のキー/ロケールは "ja" に、それも無ければキー名にフォールバックする。
 */
export class MessageResolver {
  readonly locale: string;
  private readonly messages: Record<string, Record<string, string>>;

  constructor(opts: MessageResolverOptions = {}) {
    this.locale = opts.locale ?? "ja";
    this.messages = MessageResolver.merge(defaultValidationMessages, opts.messages);
  }

  private static merge(
    base: Record<string, Record<string, string>>,
    overlay?: Record<string, Record<string, string>>,
  ): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    for (const [loc, table] of Object.entries(base)) result[loc] = { ...table };
    if (overlay) {
      for (const [loc, table] of Object.entries(overlay)) {
        result[loc] = { ...(result[loc] ?? {}), ...table };
      }
    }
    return result;
  }

  /** key のメッセージを現在の locale で解決し、params を `{name}` に埋める。 */
  resolve(key: string, params: Record<string, unknown> = {}): string {
    const table = this.messages[this.locale] ?? this.messages.ja ?? {};
    let template = table[key] ?? this.messages.ja?.[key] ?? key;
    for (const [k, v] of Object.entries(params)) {
      template = template.replaceAll(`{${k}}`, String(v));
    }
    return template;
  }

  /** マージ済みメッセージを保ったままロケールだけ切り替える。 */
  withLocale(locale: string): MessageResolver {
    return new MessageResolver({ locale, messages: this.messages });
  }
}
