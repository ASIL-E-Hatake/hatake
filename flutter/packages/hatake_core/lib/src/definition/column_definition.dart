import 'package:equatable/equatable.dart';

import 'column_types.dart';
import 'displayed.dart';
import 'option_item.dart';

/// A single column in a data table.
class ColumnDefinition extends Equatable implements Displayed {
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
  });

  @override
  List<Object?> get props =>
      [field, label, type, width, sortable, format, config, roles, options];
}
