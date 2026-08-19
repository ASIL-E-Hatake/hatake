import 'dart:convert';
import 'dart:io';

import 'package:hatake_core/hatake_core.dart';
import 'package:test/test.dart';

/// The wording of a page kind is written once, in `spec/vocabulary.json`, and
/// transcribed by every edition. This test is what makes transcribing safe: add
/// a word there and Dart fails until it is copied; change it here and it fails
/// too. Without it, the CLI and the app would call the same screen two things.
void main() {
  final vocabulary = jsonDecode(
    File('../../../spec/vocabulary.json').readAsStringSync(),
  ) as Map<String, Object?>;
  final kinds = vocabulary['pageKinds']! as Map<String, Object?>;

  group('page kind wording', () {
    test('matches spec/vocabulary.json word for word', () {
      expect(pageKindWords.keys.toSet(), kinds.keys.toSet());
      for (final entry in kinds.entries) {
        final spec = entry.value! as Map<String, Object?>;
        final mine = pageKindWords[entry.key]!;
        expect(
          mine.what,
          (spec['what']! as Map<String, Object?>)['ja'],
          reason: '${entry.key}.what',
        );
        expect(
          mine.short,
          (spec['short']! as Map<String, Object?>)['ja'],
          reason: '${entry.key}.short',
        );
      }
    });

    test('covers every built-in page kind', () {
      expect(PageKinds.all.toSet(), kinds.keys.toSet());
      for (final kind in PageKinds.all) {
        expect(shortWordOf(kind), isNotEmpty);
        expect(whatWordOf(kind), isNotEmpty);
      }
    });

    // A kind a plugin added has no honest wording here, so the kind itself is
    // the answer — better than inventing a sentence.
    test('an unknown kind falls back to the kind itself', () {
      expect(shortWordOf('kanban'), 'kanban');
      expect(whatWordOf('kanban'), isEmpty);
    });
  });
}
