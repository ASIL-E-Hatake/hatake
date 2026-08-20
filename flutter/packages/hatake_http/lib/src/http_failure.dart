/// The API answered, but not with what was asked for.
///
/// Thrown as-is by the repository so the *application* decides what a status
/// means for the user: the framework only knows that the read or write failed,
/// and showing a login screen or a retry is an app-level decision.
class RepositoryHttpException implements Exception {
  /// HTTP status code.
  final int status;

  /// What was attempted, e.g. `GET /api/customers`.
  final String request;

  /// The response body, as far as it was read. Kept because a server's own error
  /// message is usually the only useful part.
  final String body;

  const RepositoryHttpException(this.status, this.request, [this.body = '']);

  @override
  String toString() {
    final detail = body.isEmpty ? '' : ': ${body.length > 300 ? '${body.substring(0, 300)}…' : body}';
    return '$request が $status を返しました$detail';
  }
}

/// `401` / `403` — not signed in, or not allowed.
///
/// A separate type because this is the one status an app must always act on
/// (sign in again), and matching on a number in a catch block is how that gets
/// forgotten.
class RepositoryUnauthorizedException extends RepositoryHttpException {
  const RepositoryUnauthorizedException(super.status, super.request,
      [super.body]);

  @override
  String toString() => status == 401
      ? '$request にログインが必要です（401）'
      : '$request は許可されていません（403）';
}

/// `400` with the framework's own validation payload.
///
/// The same shape `FormValidator` produces, so a server-side rule rejected the
/// record — the messages belong to fields and the app can show them there
/// instead of as one opaque error.
class RepositoryValidationException extends RepositoryHttpException {
  /// Field name → message, as the API reported it.
  final Map<String, String> errors;

  const RepositoryValidationException(
    super.status,
    super.request,
    this.errors, [
    super.body,
  ]);

  @override
  String toString() {
    if (errors.isEmpty) return '$request が 400 を返しました';
    final parts = errors.entries.map((e) => '${e.key}: ${e.value}');
    return '$request が弾かれました（${parts.join(' / ')}）';
  }
}

/// The API answered with something that is not the declared shape.
///
/// Deliberately loud. A list endpoint that returns a bare array, or an object
/// without `totalCount`, would otherwise read as "0 件" — an empty screen with no
/// error is the hardest kind of bug to trace back to the wire.
class RepositoryShapeException implements Exception {
  final String request;
  final String expected;
  final String got;

  const RepositoryShapeException(this.request, this.expected, this.got);

  @override
  String toString() =>
      '$request の返した形が違います（$expected を期待、$got が来ました）。'
      'OpenAPI（hatake openapi）が宣言している形に合わせてください。';
}
