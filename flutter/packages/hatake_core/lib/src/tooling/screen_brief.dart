import '../definition/field_definition.dart';
import '../definition/page_definition.dart';
import 'page_kind_words.dart';
import 'page_kinds.dart';
import 'page_parts.dart';

/// A screen said in one line ("受注照会（order_search）… 照会（読み取り専用）。条件 5、列 5").
///
/// The full explanation is what a review needs; a list of screens needs one line
/// per screen or nobody reads it. Same wording as the TypeScript edition's
/// `hatake explain --brief`, because a screen must not be called two things.
class ScreenBrief {
  const ScreenBrief({
    required this.id,
    required this.title,
    required this.kind,
    required this.what,
    required this.parts,
    required this.counts,
    required this.line,
  });

  final String id;
  final String title;

  /// `page.type` as written.
  final String kind;

  /// Heading word for [kind].
  final String what;

  /// Size, broken down ("条件 5", "列 5").
  final List<String> parts;

  /// The same numbers, for sorting and for tables.
  final Map<String, int> counts;

  /// The line itself — paste it anywhere.
  final String line;
}

/// True when a field is shown or required only under a condition. Worth saying
/// in one line: a screen whose fields come and go reads very differently.
bool _controlled(FieldDefinition field) =>
    field.visibleWhen != null ||
    field.enabledWhen != null ||
    field.readOnlyWhen != null ||
    field.requiredWhen != null;

/// Summarises [page] in one line.
ScreenBrief briefOf(PageDefinition page) {
  final kind = pageKindOf(page);
  final counts = <String, int>{};
  final parts = <String>[];
  int count(String key, int value) {
    if (value > 0) counts[key] = value;
    return value;
  }

  final search = page.searchArea;
  if (search != null) {
    final filters = count('filters', search.filters.length);
    if (filters > 0) parts.add('条件 $filters');
  }
  final table = page.tableArea;
  if (table != null) {
    final columns = count('columns', table.columns.length);
    if (columns > 0) parts.add('列 $columns');
  }
  final form = page.formArea;
  if (form != null) {
    final fields = form.fields;
    final sections = count('sections', form.sections.length);
    final required = count('required', fields.where((f) => f.required).length);
    count('fields', fields.length);
    count('controlled', fields.where(_controlled).length);
    parts.add(
      '${sections > 1 ? '$sections 枠に' : ''}項目 ${fields.length}'
      '${required > 0 ? '（必須 $required）' : ''}',
    );
  }
  if (page.steps.isNotEmpty) {
    final steps = count('steps', page.steps.length);
    final fields = [for (final step in page.steps) ...step.fields];
    count('fields', fields.length);
    count('controlled', fields.where(_controlled).length);
    parts.add('ステップ $steps（項目 ${fields.length}）');
  }
  if (page.cards.isNotEmpty) {
    parts.add('カード ${count('cards', page.cards.length)}');
  }
  final actions = count('actions', page.pageActions.length);
  if (actions > 0) parts.add('ボタン $actions');
  if (counts.containsKey('controlled')) {
    parts.add('条件で出し分け ${counts['controlled']} 項目');
  }
  if (_hasRoles(page)) parts.add('権限で出し分けあり');
  final repository = page.repositoryKey;
  if (repository != null) parts.add('$repository から');

  final what = shortWordOf(kind);
  return ScreenBrief(
    id: page.id,
    title: page.title,
    kind: kind,
    what: what,
    parts: parts,
    counts: counts,
    line: '${page.title}（${page.id}）… $what'
        '${parts.isEmpty ? '' : '。${parts.join('、')}'}',
  );
}

/// True when anything on the page is gated by a role. Worth one line: it is the
/// first thing to check when a screen shows too much.
bool _hasRoles(PageDefinition page) {
  if (page.pageActions.any((action) => action.roles.isNotEmpty)) return true;
  if (page.tableArea?.columns.any((c) => c.roles.isNotEmpty) ?? false) return true;
  if (page.formArea?.fields.any((f) => f.roles.isNotEmpty) ?? false) return true;
  if (page.steps.any((s) => s.fields.any((f) => f.roles.isNotEmpty))) return true;
  return page.cards.any((card) => card.roles.isNotEmpty);
}
