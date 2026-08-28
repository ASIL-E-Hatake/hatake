/// 画面をどう開くか（`app.navigation`）。
///
/// 業務システムによって作法が違う。1画面ずつ遷移して使うもの（伝票を1件ずつ処理する）と、
/// 並べて開いて行き来するもの（受注を見ながらマスタを直す）の両方が現場に在るので、
/// **どちらかに決め打ちしない**。
///
/// 書かなければ `single`＝いままでの動き（後方互換）。定義が既定を言い、アプリ側
/// （`HatakeApp(navigation:)`）が上書きできる＝同じ定義を PC ではタブ、タブレットでは
/// 遷移で出せる。
abstract final class AppNavigation {
  /// 1画面ずつ。メニューで選ぶと入れ替わり、遷移すると戻れる（既定）。
  static const single = 'single';

  /// 並べて開く。メニューで選ぶと新しいタブになり、開いたままにできる。
  static const tabs = 'tabs';

  /// 書ける値の全部（`validate` と Renderer が同じ表を見る）。
  static const values = <String>{single, tabs};
}

/// 遷移のボタンが**どこに開くか**（`action.open`。`type: navigate` のとき）。
///
/// 既定は `same`＝いまの画面の続きとして進む（一覧 → 明細は同じ仕事なので、押すたびに
/// タブが増えるのは邪魔）。`tab` と書いたものだけ別のタブで開く（「一覧を残したまま
/// 個別を開く」が業務の意図なら、それは定義に書ける）。
///
/// `single` のアプリでは `tab` は効かない（並べる場所が無い）＝`validate` が言う。
abstract final class ActionOpen {
  /// いまの画面の続きとして進む（既定）。
  static const same = 'same';

  /// 別のタブで開く（`app.navigation: tabs` のときだけ）。
  static const tab = 'tab';

  static const values = <String>{same, tab};
}
