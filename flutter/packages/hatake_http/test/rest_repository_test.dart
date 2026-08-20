import 'dart:convert';

import 'package:hatake_core/hatake_core.dart';
import 'package:hatake_http/hatake_http.dart';
import 'package:test/test.dart';

/// Records what was sent and answers with what the test wants.
class _Fake {
  final List<HttpRequest> sent = [];
  final List<HttpResponse> answers;
  int _next = 0;

  _Fake([this.answers = const [HttpResponse(200, '{"items":[],"totalCount":0}')]]);

  Future<HttpResponse> call(HttpRequest request) async {
    sent.add(request);
    final answer = answers[_next.clamp(0, answers.length - 1)];
    _next++;
    return answer;
  }

  HttpRequest get last => sent.last;
}

RestRepository _repo(_Fake fake, {HttpHeaders? headers}) => RestRepository(
      collection: '/api/customers',
      send: fake.call,
      headers: headers,
    );

void main() {
  group('一覧（search）', () {
    test('ページと並びは OpenAPI が宣言している名前で送る', () async {
      final fake = _Fake();
      await _repo(fake).search(const RepositoryQuery(
        page: 2,
        pageSize: 25,
        sortField: 'customerCode',
        sortAscending: false,
      ));

      expect(fake.last.method, 'GET');
      expect(fake.last.url.path, '/api/customers');
      expect(fake.last.url.queryParameters, {
        'page': '2',
        'pageSize': '25',
        'sortField': 'customerCode',
        'sortAscending': 'false',
      });
    });

    test('並びが無ければ sort は送らない（既定の順は Repository の自由）', () async {
      final fake = _Fake();
      await _repo(fake).search(const RepositoryQuery());
      expect(fake.last.url.queryParameters.containsKey('sortField'), isFalse);
      expect(
        fake.last.url.queryParameters.containsKey('sortAscending'),
        isFalse,
      );
    });

    test('絞り込みは項目名で乗る。空と null は送らない', () async {
      final fake = _Fake();
      await _repo(fake).search(const RepositoryQuery(filters: {
        'status': '未出荷',
        'name': '',
        'kind': null,
      }));
      final params = fake.last.url.queryParameters;
      expect(params['status'], '未出荷');
      // `?name=` は「空文字に一致するもの」を頼むことになる（絞っていないのとは違う）。
      expect(params.containsKey('name'), isFalse);
      expect(params.containsKey('kind'), isFalse);
    });

    test('範囲（between）は同じ名前を2回。配列の既定の書き方', () async {
      final fake = _Fake();
      await _repo(fake).search(const RepositoryQuery(filters: {
        'orderDate': ['2026-04-01', '2026-04-30'],
      }));
      expect(
        fake.last.url.queryParametersAll['orderDate'],
        ['2026-04-01', '2026-04-30'],
      );
    });

    test('返ってきた items と totalCount がそのまま結果になる', () async {
      final fake = _Fake([
        HttpResponse(
          200,
          jsonEncode({
            'items': [
              {'customerCode': 'C-1', 'name': '山田商事'},
            ],
            'totalCount': 42,
          }),
        ),
      ]);
      final result = await _repo(fake).search(const RepositoryQuery());
      expect(result.totalCount, 42);
      expect(result.items.single['name'], '山田商事');
    });

    test('宣言と違う形が来たら、黙って 0 件にせず落ちる', () async {
      // 配列だけを返す API は多い。ここで黙ると「空の画面」になり、原因が
      // 通信まで遡れなくなる。
      final fake = _Fake([const HttpResponse(200, '[{"customerCode":"C-1"}]')]);
      await expectLater(
        _repo(fake).search(const RepositoryQuery()),
        throwsA(isA<RepositoryShapeException>().having(
          (e) => e.toString(),
          'message',
          allOf(contains('items'), contains('OpenAPI')),
        )),
      );
    });
  });

  group('1件（findByKey / create / update / delete）', () {
    test('キーは道の最後に付く（記号は escape する）', () async {
      final fake = _Fake([const HttpResponse(200, '{"customerCode":"C 1/2"}')]);
      await _repo(fake).findByKey('C 1/2');
      expect(fake.last.url.path, '/api/customers/C%201%2F2');
    });

    test('404 は「無い」＝null（例外にしない）', () async {
      final fake = _Fake([const HttpResponse(404, '{"message":"not found"}')]);
      expect(await _repo(fake).findByKey('C-9'), isNull);
    });

    test('create は POST、update は PUT、どちらも本文は JSON', () async {
      final fake = _Fake([const HttpResponse(201, '{"customerCode":"C-1"}')]);
      await _repo(fake).create({'name': '山田商事'});
      expect(fake.last.method, 'POST');
      expect(fake.last.url.path, '/api/customers');
      expect(jsonDecode(fake.last.body!), {'name': '山田商事'});
      expect(fake.last.headers['content-type'], contains('application/json'));

      final put = _Fake([const HttpResponse(200, '{"customerCode":"C-1"}')]);
      await _repo(put).update('C-1', {'name': '山田商事'});
      expect(put.last.method, 'PUT');
      expect(put.last.url.path, '/api/customers/C-1');
    });

    test('delete は 204 を成功として扱う（本文が無い）', () async {
      final fake = _Fake([const HttpResponse(204)]);
      await _repo(fake).delete('C-1');
      expect(fake.last.method, 'DELETE');
    });
  });

  group('失敗の型', () {
    test('401 / 403 は専用の型（アプリがログインへ飛ばせる）', () async {
      for (final status in [401, 403]) {
        final fake = _Fake([HttpResponse(status)]);
        await expectLater(
          _repo(fake).findByKey('C-1'),
          throwsA(isA<RepositoryUnauthorizedException>()),
        );
      }
    });

    test('400 は項目ごとのメッセージに開く（フォームに戻せる形）', () async {
      final fake = _Fake([
        HttpResponse(
          400,
          jsonEncode({
            'valid': false,
            'errors': [
              {'field': 'name', 'message': '必須です'},
              {'field': 'postalCode', 'message': '郵便番号の形式ではありません'},
            ],
          }),
        ),
      ]);
      await expectLater(
        _repo(fake).create({'name': ''}),
        throwsA(isA<RepositoryValidationException>()
            .having((e) => e.errors['name'], 'name', '必須です')
            .having((e) => e.errors.length, '件数', 2)),
      );
    });

    test('400 なのに payload が無ければ、項目名を作らない', () async {
      final fake = _Fake([const HttpResponse(400, 'Bad Request')]);
      await expectLater(
        _repo(fake).create(const {}),
        throwsA(isA<RepositoryValidationException>()
            .having((e) => e.errors, 'errors', isEmpty)),
      );
    });

    test('500 は素の型。何をしていたかと本文を持つ', () async {
      final fake = _Fake([const HttpResponse(500, 'boom')]);
      await expectLater(
        _repo(fake).search(const RepositoryQuery()),
        throwsA(isA<RepositoryHttpException>().having(
          (e) => e.toString(),
          'message',
          allOf(contains('500'), contains('boom'), contains('/api/customers')),
        )),
      );
    });
  });

  group('ヘッダ', () {
    test('毎回呼ぶ（トークンは期限が切れるので、固定の地図では足りない）',
        () async {
      var calls = 0;
      final fake = _Fake(const [
        HttpResponse(200, '{"items":[],"totalCount":0}'),
        HttpResponse(200, '{"items":[],"totalCount":0}'),
      ]);
      final repo = _repo(fake, headers: () async {
        calls++;
        return {'authorization': 'Bearer token-$calls'};
      });
      await repo.search(const RepositoryQuery());
      await repo.search(const RepositoryQuery());

      expect(calls, 2);
      expect(fake.sent[0].headers['authorization'], 'Bearer token-1');
      expect(fake.sent[1].headers['authorization'], 'Bearer token-2');
    });
  });

  group('restRepositories', () {
    test('定義の repository 名 → collection の対応を1箇所で組む', () async {
      final fake = _Fake();
      final repositories = restRepositories(
        baseUrl: '/api/',
        send: fake.call,
        collections: {
          'customerRepository': 'customers',
          'orderRepository': 'orders',
        },
      );
      await repositories['orderRepository']!.search(const RepositoryQuery());
      expect(fake.last.url.path, '/api/orders');
      expect(repositories['customerRepository'], isA<RestRepository>());
    });
  });
}
