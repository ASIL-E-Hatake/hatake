import '../definition/app_definition.dart';
import '../definition/page_definition.dart';
import 'page_kind_words.dart';
import 'page_parts.dart';
import 'screen_brief.dart';

/// One row of the index — one screen.
class ScreenEntry {
  const ScreenEntry({
    required this.file,
    required this.id,
    required this.title,
    required this.kind,
    required this.what,
    required this.counts,
    required this.brief,
    required this.words,
    this.repository,
  });

  /// Builds the row from a parsed page. [file] is free-form: a path when the
  /// definition came from disk, an asset key inside an app, empty when the
  /// screen was built in Dart.
  factory ScreenEntry.of(PageDefinition page, {String file = ''}) {
    final brief = briefOf(page);
    return ScreenEntry(
      file: file,
      id: brief.id,
      title: brief.title,
      kind: brief.kind,
      what: brief.what,
      repository: page.repositoryKey,
      counts: brief.counts,
      brief: brief.line,
      words: _wordsOf(page, brief),
    );
  }

  /// Where the definition lives (empty when it was built in code).
  final String file;
  final String id;
  final String title;

  /// `page.type` as written.
  final String kind;

  /// Heading word for [kind].
  final String what;

  /// Repository key, when the page declares one.
  final String? repository;

  /// Size, broken down (filters / columns / fields / …).
  final Map<String, int> counts;

  /// The one-line summary.
  final String brief;

  /// Words to search by.
  final List<String> words;

  /// How big this screen is. Sorting only — [counts] holds the detail.
  ///
  /// `required` and `controlled` are left out: they describe fields already
  /// counted, so adding them would make a form look twice as big as it is.
  int get size => counts.entries
      .where((one) => one.key != 'required' && one.key != 'controlled')
      .fold(0, (sum, one) => sum + one.value);

  /// True when every word in [terms] appears somewhere in this row.
  bool matchesAll(List<String> terms) {
    final haystack = [brief, ...words].join(' ').toLowerCase();
    return terms.every(haystack.contains);
  }

  Map<String, Object?> toJson() => {
        if (file.isNotEmpty) 'file': file,
        'id': id,
        'title': title,
        'kind': kind,
        'what': what,
        if (repository != null) 'repository': repository,
        'counts': counts,
        'brief': brief,
        'words': words,
      };
}

/// Words this screen can be found by.
///
/// Both the words on the screen (labels) and the identifiers in the definition
/// (id, field names, repository) go in: the shop floor searches for 得意先 and
/// the developer searches for `customer`. An index that answers only one of the
/// two is not worth building.
List<String> _wordsOf(PageDefinition page, ScreenBrief brief) {
  final words = <String>[
    page.id,
    page.title,
    brief.kind,
    // The long wording too, so `master` is reachable by 検索 (the heading word
    // is マスタ保守, which nobody on the floor would type).
    whatWordOf(brief.kind),
  ];
  final repository = page.repositoryKey;
  if (repository != null) words.add(repository);

  for (final filter in page.searchArea?.filters ?? const []) {
    words.addAll([filter.field, filter.label]);
  }
  for (final column in page.tableArea?.columns ?? const []) {
    words.addAll([column.field, column.label]);
  }
  for (final field in page.formArea?.fields ?? const []) {
    words.addAll([field.field, field.label]);
    for (final row in field.rowFields) {
      words.addAll([row.field, row.label]);
    }
    for (final column in field.columns) {
      words.addAll([column.field, column.label]);
    }
  }
  for (final step in page.steps) {
    words.add(step.title);
    for (final field in step.fields) {
      words.addAll([field.field, field.label]);
    }
  }
  for (final card in page.cards) {
    words.addAll([card.id, card.title]);
  }
  for (final action in page.pageActions) {
    words.addAll([action.id, action.label]);
  }
  // Keep declaration order, drop repeats and blanks (order makes the row
  // readable when someone prints it).
  return {...words.where((word) => word.isNotEmpty)}.toList();
}

/// A definition that could not be read (so the index is incomplete).
class UnreadableDefinition {
  const UnreadableDefinition(this.file, this.reason);

  final String file;
  final String reason;
}

/// "Which screen searches customers?" — the question a pile of definitions stops
/// answering once it grows.
///
/// grep finds a word in a file; it cannot tell you what the screen does. So the
/// index carries the one-line summary ([ScreenBrief]) plus the words to find it
/// by. Deliberately not a second vocabulary: the summary is the same one an
/// explanation prints, or the index and the docs would drift.
///
/// Inside an app this is also how a screen picker or a "jump to screen" box gets
/// built — the definitions are already in memory, so no tooling is involved.
class ScreenIndex {
  const ScreenIndex(
    this.screens, {
    this.ignored = 0,
    this.unreadable = const [],
  });

  /// Indexes pages already in memory (built in Dart or parsed elsewhere).
  factory ScreenIndex.ofPages(Iterable<PageDefinition> pages, {String file = ''}) =>
      ScreenIndex(sorted([
        for (final page in pages) ScreenEntry.of(page, file: file),
      ]));

  /// Indexes every screen of an app.
  factory ScreenIndex.ofApp(AppDefinition app, {String file = ''}) =>
      ScreenIndex.ofPages(app.pages, file: file);

  /// The rows, sorted by file then id (same input, same index).
  final List<ScreenEntry> screens;

  /// How many inputs were skipped because they were not definitions.
  final int ignored;

  /// Definitions that could not be read. One is enough to make the index
  /// incomplete, so callers report it rather than pretending.
  final List<UnreadableDefinition> unreadable;

  /// File, then id. Stable so two runs produce the same index.
  static List<ScreenEntry> sorted(List<ScreenEntry> screens) => [...screens]..sort(
        (a, b) {
          final byFile = a.file.compareTo(b.file);
          return byFile != 0 ? byFile : a.id.compareTo(b.id);
        },
      );

  /// Screens matching every word in [query] (split on spaces and 読点).
  ///
  /// Words, not a sentence: Japanese does not split on spaces, so a whole
  /// sentence would match nothing. Case is ignored. No words means everything.
  List<ScreenEntry> search(String? query) {
    final terms = (query ?? '')
        .split(RegExp(r'[\s、,]+'))
        .map((term) => term.trim().toLowerCase())
        .where((term) => term.isNotEmpty)
        .toList();
    if (terms.isEmpty) return screens;
    return screens.where((screen) => screen.matchesAll(terms)).toList();
  }

  /// Biggest screens first (where the work is).
  List<ScreenEntry> bySize() =>
      [...screens]..sort((a, b) => b.size.compareTo(a.size));

  Map<String, Object?> toJson() => {
        'screens': [for (final screen in screens) screen.toJson()],
        'ignored': ignored,
        'unreadable': [
          for (final one in unreadable) {'file': one.file, 'reason': one.reason},
        ],
      };
}

/// Renders [screens] as a table, columns lined up. Paste it anywhere.
String renderScreenIndex(
  List<ScreenEntry> screens, {
  bool showFile = true,
  bool showSize = false,
}) {
  if (screens.isEmpty) return '当てはまる画面はありません。';
  final idWidth = screens.map((s) => _width(s.id)).reduce(_max);
  final titleWidth = screens.map((s) => _width(s.title)).reduce(_max);
  final whatWidth = screens.map((s) => _width(s.what)).reduce(_max);
  return [
    '画面 ${screens.length} 枚${showSize ? '（規模の大きい順）' : ''}:',
    for (final screen in screens)
      '${showSize ? '${screen.size.toString().padLeft(3)}  ' : ''}'
          '${_pad(screen.id, idWidth)}  ${_pad(screen.title, titleWidth)}  '
          '${_pad(screen.what, whatWidth)}'
          '${showFile && screen.file.isNotEmpty ? '  ${screen.file}' : ''}',
  ].join('\n');
}

int _max(int a, int b) => a > b ? a : b;

/// Display width (full-width counts as 2). Only for lining columns up.
int _width(String text) =>
    text.runes.fold(0, (sum, rune) => sum + (rune > 0xff ? 2 : 1));

String _pad(String text, int to) {
  final short = to - _width(text);
  return short > 0 ? '$text${' ' * short}' : text;
}
