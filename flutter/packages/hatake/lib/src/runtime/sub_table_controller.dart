import 'package:flutter/foundation.dart';
import 'package:hatake_core/hatake_core.dart';

/// Renderer-independent runtime for a repository-backed `subTable` field
/// (`source` present): pages the child rows of one parent record and saves them
/// one at a time.
///
/// Rows are linked to the parent by the source's `parentKey`, so a parent that
/// has no key yet cannot have rows — [canEdit] is then false and the renderer
/// should tell the user to save the parent first.
class SubTableController extends ChangeNotifier {
  final FieldDefinition field;
  final Repository repository;

  /// Primary-key value of the parent record, or null while it is unsaved.
  final Object? parentKey;

  final FormValidator _validator;

  SubTableController({
    required this.field,
    required this.repository,
    required this.parentKey,
    FormValidator? validator,
  })  : _validator = validator ?? FormValidator(),
        assert(field.source != null,
            'SubTableController needs a field with a `source`.');

  SubTableSource get source => field.source!;

  /// Whether rows can be listed/edited at all: the parent must exist first.
  bool get canEdit => parentKey != null;

  bool _loading = false;
  bool get loading => _loading;

  Object? _error;
  Object? get error => _error;

  List<DataRecord> _rows = const [];
  List<DataRecord> get rows => _rows;

  int _totalCount = 0;
  int get totalCount => _totalCount;

  int _page = 0;
  int get page => _page;

  int get pageSize => source.pageSize;

  int get pageCount =>
      _totalCount == 0 ? 1 : (_totalCount + pageSize - 1) ~/ pageSize;

  bool _saving = false;
  bool get saving => _saving;

  /// Loads the current page. Call once after construction.
  Future<void> load() async {
    if (!canEdit) {
      _rows = const [];
      _totalCount = 0;
      notifyListeners();
      return;
    }
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final result = await repository.search(RepositoryQuery(
        filters: {source.parentKey: parentKey},
        page: _page,
        pageSize: pageSize,
      ));
      _rows = result.items;
      _totalCount = result.totalCount;
    } catch (error) {
      _error = error;
      _rows = const [];
      _totalCount = 0;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> setPage(int page) async {
    if (page < 0 || page == _page) return;
    _page = page;
    await load();
  }

  /// Validates [row] against the field's row rules and, if valid, persists it —
  /// creating when it carries no key, updating otherwise. Returns the validation
  /// result so the caller can keep the row editor open on failure.
  Future<ValidationResult> saveRow(DataRecord row) async {
    final result = _validator.validate(_rowForm, row);
    if (!result.isValid) return result;

    _saving = true;
    _error = null;
    notifyListeners();
    var persisted = false;
    try {
      final key = row[source.keyField];
      final data = {...row, source.parentKey: parentKey};
      if (key == null) {
        await repository.create(data);
      } else {
        await repository.update(key, data);
      }
      persisted = true;
    } catch (error) {
      _error = error;
    } finally {
      _saving = false;
    }
    // Only reload on success — a reload would clear the error we just captured.
    if (persisted) {
      await load();
    } else {
      notifyListeners();
    }
    return result;
  }

  Future<void> deleteRow(DataRecord row) async {
    final key = row[source.keyField];
    if (key == null) return;
    _error = null;
    try {
      await repository.delete(key);
    } catch (error) {
      _error = error;
      notifyListeners();
      return;
    }
    await load();
  }

  /// The row editor as a form, so row `required` / `validators` / `computed`
  /// behave exactly like a normal form's.
  late final FormDefinition _rowForm = FormDefinition(
    sections: [SectionDefinition(fields: field.rowFields)],
  );
}
