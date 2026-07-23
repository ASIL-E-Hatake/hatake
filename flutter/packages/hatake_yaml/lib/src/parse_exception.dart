/// Thrown when a definition document cannot be converted into a
/// [PageDefinition]. Carries an optional [path] pointing at the offending
/// location (e.g. `page.form.sections[0].fields[2].type`).
class DefinitionParseException implements Exception {
  final String message;
  final String? path;

  DefinitionParseException(this.message, {this.path});

  @override
  String toString() => path == null
      ? 'DefinitionParseException: $message'
      : 'DefinitionParseException at "$path": $message';
}
