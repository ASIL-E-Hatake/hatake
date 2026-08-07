import 'package:equatable/equatable.dart';

/// Built-in paper sizes. Open strings — a renderer may know more.
abstract final class PaperSizes {
  const PaperSizes._();

  static const String a4 = 'A4';
  static const String a3 = 'A3';
  static const String b5 = 'B5';
  static const String letter = 'letter';
}

/// Paper orientations.
abstract final class Orientations {
  const Orientations._();

  static const String portrait = 'portrait';
  static const String landscape = 'landscape';
}

/// The sheet a report is laid out on.
///
/// The framework does not print: it says how wide a page is meant to be and the
/// renderer draws a preview at that shape (see the report page renderer).
class PaperDefinition extends Equatable {
  /// Paper size name ([PaperSizes] or a renderer's own).
  final String size;

  /// `portrait` or `landscape` ([Orientations]).
  final String orientation;

  const PaperDefinition({
    this.size = PaperSizes.a4,
    this.orientation = Orientations.portrait,
  });

  bool get isLandscape => orientation == Orientations.landscape;

  @override
  List<Object?> get props => [size, orientation];
}
