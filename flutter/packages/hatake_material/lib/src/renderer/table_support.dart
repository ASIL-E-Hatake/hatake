part of '../material_renderer.dart';

/// Applies a column's declared fixed width (DSL `column.width`) to [child].
///
/// Besides honoring the definition, a fixed width makes the column immune to
/// text-measurement timing: on web, CJK glyphs come from a font that is fetched
/// asynchronously, so a column sized purely from its content can collapse to
/// one character on the first frame and only recover after a rebuild.
Widget _sizedColumn(ColumnDefinition column, Widget child) {
  final width = column.width;
  if (width == null) return child;
  return SizedBox(
    width: width,
    // Keep a fixed-width cell on one line so a long value cannot wrap past the
    // row height; Text inherits these from the enclosing DefaultTextStyle.
    child: DefaultTextStyle.merge(
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      child: child,
    ),
  );
}
