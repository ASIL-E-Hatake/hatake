import 'package:flutter/foundation.dart';
import 'package:hatake_core/hatake_core.dart';

/// Renderer-independent runtime for a [DetailPageDefinition]: loads a single
/// record by key from the repository.
class DetailController extends ChangeNotifier {
  final Repository repository;
  final Object? recordKey;

  DetailController({required this.repository, required this.recordKey});

  bool _loading = false;
  bool get loading => _loading;

  Object? _error;
  Object? get error => _error;

  DataRecord? _record;
  DataRecord? get record => _record;

  Future<void> init() => load();

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _record = recordKey == null ? null : await repository.findByKey(recordKey!);
    } catch (error) {
      _error = error;
      _record = null;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }
}
