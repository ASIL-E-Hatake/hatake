import 'package:equatable/equatable.dart';

import 'column_types.dart';

/// A single column in a data table.
class ColumnDefinition extends Equatable {
  /// The backing data key rendered in this column.
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
  final String? format;

  /// Plugin / renderer specific extra configuration (also formatter options).
  final Map<String, Object?> config;

  /// Roles allowed to see this column (see `isAllowed`). Empty = everyone.
  final List<String> roles;

  const ColumnDefinition({
    required this.field,
    required this.label,
    this.type = ColumnTypes.text,
    this.width,
    this.sortable = false,
    this.format,
    this.config = const {},
    this.roles = const [],
  });

  @override
  List<Object?> get props =>
      [field, label, type, width, sortable, format, config, roles];
}
