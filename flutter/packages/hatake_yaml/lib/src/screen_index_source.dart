import 'package:hatake_core/hatake_core.dart';

import 'source_loaders.dart';

/// One definition to index.
class IndexInput {
  const IndexInput(this.file, this.source);

  /// Where it came from (a path, an asset key — free-form, shown in the index).
  final String file;

  /// The definition text (YAML or JSON).
  final String source;
}

/// True when [source] looks like a definition document at all.
///
/// Same test as the TypeScript edition uses, so both give the same answer for
/// the same folder — a directory that indexes to 18 screens with the CLI must
/// index to 18 screens in Dart.
/// JSON (`"page": { … }`) counts too: a definition is a definition whichever
/// way it is written.
final _isDefinition =
    RegExp(r'(^|[{,])\s*"?(page|app)"?\s*:', multiLine: true);
final _isApp = RegExp(r'(^|[{,])\s*"?app"?\s*:', multiLine: true);

/// Builds a [ScreenIndex] from definition sources.
///
/// Read loosely on purpose (not strict): a definition with a typo is still a
/// screen that exists, and dropping it from the index only makes it harder to
/// find. What is not allowed is quiet loss — anything that fails to parse lands
/// in [ScreenIndex.unreadable] so the caller can say the index is incomplete.
ScreenIndex buildScreenIndex(List<IndexInput> inputs) {
  final screens = <ScreenEntry>[];
  final unreadable = <UnreadableDefinition>[];
  var ignored = 0;

  for (final input in inputs) {
    if (!_isDefinition.hasMatch(input.source)) {
      ignored++;
      continue;
    }
    try {
      final pages = _isApp.hasMatch(input.source)
          ? parseAppYaml(input.source).pages
          : [parsePageYaml(input.source)];
      for (final page in pages) {
        screens.add(ScreenEntry.of(page, file: input.file));
      }
    } on Object catch (error) {
      unreadable.add(
        UnreadableDefinition(input.file, _firstLine(error.toString())),
      );
    }
  }
  return ScreenIndex(
    ScreenIndex.sorted(screens),
    ignored: ignored,
    unreadable: unreadable,
  );
}

/// The first line of the reason. A parse error can be long; the index shows one
/// line per file and the full message is available where it was thrown.
String _firstLine(String message) => message.split('\n').first;
