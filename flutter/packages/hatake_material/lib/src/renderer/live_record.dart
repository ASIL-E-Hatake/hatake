part of '../material_renderer.dart';

/// いま入力されている値（フォームがその瞬間に持っているレコード）を、画面の**別の枝**
/// ＝ボタンの活性（`enabledWhen`）に届けるための入れ物。
///
/// なぜ要るのか: 項目の出し分け（`visibleWhen` / `enabledWhen` / `computed`）はフォーム
/// の中で完結しているが、**画面のボタンはフォームの外に居る**。値が変わったことが
/// そこまで届かないと、「下書きなら送信できる」と書いた送信ボタンが、下書きに直しても
/// 灰色のままになる。書けて・通って・画面も出るのに効かない、が一番まずい。
///
/// 通知は**フレームの後**に回す。フォームは build の中で今の値を組み立てるので、その場で
/// 通知すると「描いている途中に別の枝を作り直す」ことになる。
class _LiveRecord extends ChangeNotifier {
  _LiveRecord(this._record);

  DataRecord _record;
  bool _scheduled = false;
  bool _disposed = false;

  /// いまの値。フォームがまだ組み立てていなければ、開いたときのレコード。
  DataRecord get record => _record;

  /// フォームから呼ぶ。**変わったときだけ**通知する（毎フレーム「変わった」と言うと、
  /// 通知と描き直しが互いを呼び続ける）。
  void publish(DataRecord next) {
    if (_sameRecord(_record, next)) return;
    _record = next;
    if (_scheduled || _disposed) return;
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scheduled = false;
      if (!_disposed) notifyListeners();
    });
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// 同じ値か。**中身で見る**（`collect` は毎回写しを作るので、同一性で見ると必ず
/// 「変わった」になる）。明細の行のような入れ子も中身で比べる。
bool _sameRecord(DataRecord a, DataRecord b) {
  if (a.length != b.length) return false;
  for (final entry in a.entries) {
    if (!b.containsKey(entry.key)) return false;
    if (!_sameValue(entry.value, b[entry.key])) return false;
  }
  return true;
}

bool _sameValue(Object? a, Object? b) {
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!_sameValue(a[i], b[i])) return false;
    }
    return true;
  }
  if (a is Map && b is Map) {
    if (a.length != b.length) return false;
    for (final key in a.keys) {
      if (!b.containsKey(key)) return false;
      if (!_sameValue(a[key], b[key])) return false;
    }
    return true;
  }
  return a == b;
}
