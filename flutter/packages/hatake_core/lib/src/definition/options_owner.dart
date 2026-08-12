import 'option_item.dart';
import 'options_source.dart';

/// 選択肢を持つもの（入力項目 [FieldDefinition] と検索条件 [FilterDefinition]）。
///
/// 選択肢の連動（カスケード）は入力でも検索でも同じ判定なので、絞り込みの
/// ロジック（`visibleOptions` / `optionValueIsStale`）はこの形だけを見る。
/// 「入力用」「検索用」で同じ判定を2つ持つと必ずズレるので。
abstract interface class OptionsOwner {
  /// 値を持つキー（レコード / 検索条件のキー）。
  String get field;

  /// 定義に書いた選択肢。
  List<OptionItem> get options;

  /// 親の項目名。null なら連動しない（全部出す）。
  String? get optionsFrom;

  /// 選択肢の取得元。null なら [options] を使う。
  OptionsSource? get optionsSource;
}
