import 'package:hatake_core/hatake_core.dart';

/// Resolves the [Repository] a page needs from its string key
/// (see `CrudPageDefinition.repository`).
///
/// The framework never constructs repositories; the application registers its
/// own implementations here.
class RepositoryRegistry {
  final Map<String, Repository> _repositories;

  const RepositoryRegistry(this._repositories);

  const RepositoryRegistry.empty() : _repositories = const {};

  /// Returns the repository registered under [key], or throws if none exists.
  Repository resolve(String key) {
    final repository = _repositories[key];
    if (repository == null) {
      throw StateError(
        'No repository registered for key "$key". '
        'Register it in the RepositoryRegistry passed to HatakeScope.',
      );
    }
    return repository;
  }

  bool contains(String key) => _repositories.containsKey(key);
}
