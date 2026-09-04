/// 既定（日本語）のバリデーションメッセージ。`{value}` などのプレースホルダを
/// 持つ。ロケールごとに差し替え・追加できる（[MessageResolver]）。
const Map<String, Map<String, String>> defaultValidationMessages = {
  'ja': {
    'required': '必須項目です',
    'maxLength': '{value}文字以内で入力してください',
    'minLength': '{value}文字以上で入力してください',
    'min': '{value}以上で入力してください',
    'max': '{value}以下で入力してください',
    'pattern': '形式が正しくありません',
    'email': 'メールアドレスの形式が正しくありません',
    'postalCode': '郵便番号の形式が正しくありません',
    // 明細の行どうしの検証（unique）。{label} は行の項目の**ラベル**、
    // {rows} は重なっている行の番号（1から数える）。
    'unique': '{label} が同じ行があります（{rows} 行目）',
    // 項目間の検証（compare）。{target} には比べる相手の**ラベル**が入る。
    'compare.equals': '{target}と同じ値にしてください',
    'compare.notEquals': '{target}と違う値にしてください',
    'compare.gt': '{target}より大きい値にしてください',
    'compare.gte': '{target}以上にしてください',
    'compare.lt': '{target}より小さい値にしてください',
    'compare.lte': '{target}以下にしてください',
    // 上位だけ並べた計算項目（`computed` の `limit`）で、出さなかった行の数。
    // `{count}` は**隠れた行数**（全体ではない）。定義の `overflow` で上書きできる。
    'computed.more': 'ほか {count} 件',
    // 1回で動かせる件数の上限（`action.maxRows`）を超えて届いたとき。
    // 画面は押させないので、これが出るのは API を直接叩かれたとき。
    'bulk.tooMany': '1回に実行できるのは {value} 件までです（{count} 件届きました）',
  },
};

/// メッセージをロケール＋キーで解決する。既定ロケールは日本語（`ja`）。
///
/// フレームワークの他レジストリと同じく「開いた文字列キー + 差し替え可能」。
/// バリデータの日本語固定メッセージはこれ経由に置き換わっており、利用者は
/// ロケール切替や文言上書きができる。未知のキー/ロケールは `ja` に、それも
/// 無ければキー名そのものにフォールバックする。
///
/// ```dart
/// // 英語ロケールを足して切り替える
/// final messages = MessageResolver(
///   locale: 'en',
///   messages: {'en': {'required': 'Required', 'maxLength': 'Max {value} chars'}},
/// );
/// final registry = ValidatorRegistry(null, messages);
/// ```
class MessageResolver {
  /// 使用ロケール。
  final String locale;

  final Map<String, Map<String, String>> _messages;

  const MessageResolver._(this.locale, this._messages);

  /// [messages] を既定（[defaultValidationMessages]）にマージして構築する。
  factory MessageResolver({
    String locale = 'ja',
    Map<String, Map<String, String>>? messages,
  }) =>
      MessageResolver._(locale, _merge(defaultValidationMessages, messages));

  static Map<String, Map<String, String>> _merge(
    Map<String, Map<String, String>> base,
    Map<String, Map<String, String>>? overlay,
  ) {
    final result = {
      for (final e in base.entries) e.key: {...e.value},
    };
    overlay?.forEach((loc, table) {
      result[loc] = {...?result[loc], ...table};
    });
    return result;
  }

  /// [key] のメッセージを現在の [locale] で解決し、[params] を `{name}` に埋める。
  String resolve(String key, [Map<String, Object?> params = const {}]) {
    final table = _messages[locale] ?? _messages['ja'] ?? const {};
    var template = table[key] ?? _messages['ja']?[key] ?? key;
    params.forEach((k, v) {
      template = template.replaceAll('{$k}', '$v');
    });
    return template;
  }

  /// マージ済みメッセージを保ったままロケールだけ切り替えた新しいリゾルバを返す。
  MessageResolver withLocale(String locale) =>
      MessageResolver._(locale, _messages);
}
