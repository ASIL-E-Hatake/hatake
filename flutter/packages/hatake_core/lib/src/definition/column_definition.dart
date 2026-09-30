import 'package:equatable/equatable.dart';

import 'column_types.dart';
import 'displayed.dart';
import 'option_item.dart';
import 'options_owner.dart';
import 'options_source.dart';

/// A single column in a data table.
class ColumnDefinition extends Equatable implements Displayed, OptionsOwner {
  /// The backing data key rendered in this column.
  @override
  final String field;

  /// Column header label.
  final String label;

  /// Render type (see [ColumnTypes]). Open string, plugin-extensible.
  final String type;

  /// Fixed width in logical pixels; null means flexible.
  final double? width;

  /// Whether the column can be sorted.
  final bool sortable;

  /// Optional display formatter name (see `FormatterRegistry`), e.g. `currency`.
  /// Formatter options are read from [config].
  @override
  final String? format;

  /// Plugin / renderer specific extra configuration (also formatter options).
  @override
  final Map<String, Object?> config;

  /// Roles allowed to see this column (see `isAllowed`). Empty = everyone.
  final List<String> roles;

  /// この列の選択肢。**定義に直接は書けない**（DSL キーは `optionsOf` だけ）。
  ///
  /// 見せる所に並びをもう一度書かせると、入力側と片方だけ直したときに
  /// 一覧と入力で違う字が出る。だから列が指せるのは**名前だけ**で、
  /// 実体は読み込み時に `app.vocabularies` から入る。
  @override
  final List<OptionItem> options;

  /// キーから**別の Repository の名前**を引いて見せる（部署コード → 部署名）。
  /// 一覧の画面が1回だけ引いて、引いた選択肢で升の字を決める（[withOptions]）。
  @override
  final OptionsSource? optionsSource;

  /// 列は親の値で絞らない（引くのは一覧に出すための名前の表）。
  @override
  String? get optionsFrom => null;

  const ColumnDefinition({
    required this.field,
    required this.label,
    this.type = ColumnTypes.text,
    this.width,
    this.sortable = false,
    this.format,
    this.config = const {},
    this.roles = const [],
    this.options = const [],
    this.optionsSource,
  });

  /// 選択肢だけを差し替えた列（引いた名前の表で升を描くとき）。
  ColumnDefinition withOptions(List<OptionItem> options) => ColumnDefinition(
        field: field,
        label: label,
        type: type,
        width: width,
        sortable: sortable,
        format: format,
        config: config,
        roles: roles,
        options: options,
        optionsSource: optionsSource,
      );

  @override
  List<Object?> get props => [
        field,
        label,
        type,
        width,
        sortable,
        format,
        config,
        roles,
        options,
        optionsSource,
      ];
}
