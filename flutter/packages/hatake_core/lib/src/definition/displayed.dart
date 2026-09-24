/// 値を**1つの文字にして見せる**もの。列 [ColumnDefinition] と
/// 入力項目 [FieldDefinition] が、どちらもこの形をしている。
///
/// 分けて持っていたせいで起きたこと: 「値を文字にする」処理が一覧・検索・数字の画面・
/// 帳票・紙・明細・詳細の**6か所に写し取られ**、0.9.2 で選択肢の名前を出すように直した
/// のは**そのうち3か所だけ**だった。残り3か所は、同じ値が同じ画面の中で別の顔で出る
/// ままになっていた（詳細画面の「受注状態」が `shipped` と出たのがそれ）。
///
/// [OptionsOwner] と同じ考え方で、**画面の種類ではなく形で受ける**。こうすると
/// `cellText` が1本で済み、直す所も1か所になる。
abstract interface class Displayed {
  /// 値を持つキー（レコードのキー）。
  String get field;

  /// 見せ方の名前（`currency` など）。null なら素のまま。
  String? get format;

  /// 見せ方に渡す設定（`decimals` など）。
  Map<String, Object?> get config;
}
