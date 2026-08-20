/// One HTTP request, as data.
///
/// The adapter builds these; **something else sends them** (see [HttpSend]).
class HttpRequest {
  /// `GET` / `POST` / `PUT` / `DELETE`.
  final String method;

  /// Full URL, query string included.
  final Uri url;

  /// Headers to send. Already carries `accept`, plus `content-type` when there
  /// is a [body], plus whatever the app's header function added.
  final Map<String, String> headers;

  /// JSON text, or null for requests that carry nothing.
  final String? body;

  const HttpRequest({
    required this.method,
    required this.url,
    this.headers = const {},
    this.body,
  });

  @override
  String toString() => '$method $url';
}

/// One HTTP response, as data.
class HttpResponse {
  final int status;

  /// The body as text. Empty is fine (`204 No Content`).
  final String body;

  const HttpResponse(this.status, [this.body = '']);
}

/// Sends a request and returns the response.
///
/// **This is the only thing the app has to write, and it is why this package has
/// no dependencies.** A transport is a choice — `package:http`, `dio`, a mock, a
/// browser `fetch`, an interceptor stack an enterprise already owns — and baking
/// one in would force it on every app and break the platforms it does not cover.
///
/// ```dart
/// final send = (HttpRequest r) async {
///   final response = await http.Request(r.method, r.url)
///     ..headers.addAll(r.headers)
///     ..bodyBytes = utf8.encode(r.body ?? '');
///   final sent = await http.Client().send(response);
///   final text = await sent.stream.bytesToString();
///   return HttpResponse(sent.statusCode, text);
/// };
/// ```
typedef HttpSend = Future<HttpResponse> Function(HttpRequest request);

/// Extra headers for the next request — an auth token, a tenant, a trace id.
///
/// Called **per request** rather than fixed once, because a token expires: this
/// is where an app refreshes it before answering.
typedef HttpHeaders = Future<Map<String, String>> Function();
