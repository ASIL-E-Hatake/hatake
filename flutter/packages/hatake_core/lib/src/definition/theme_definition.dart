import 'package:equatable/equatable.dart';

/// Brightness values a [ThemeDefinition] may declare.
abstract final class Brightnesses {
  const Brightnesses._();

  static const String light = 'light';
  static const String dark = 'dark';

  /// Follow the device setting.
  static const String system = 'system';

  static const Set<String> all = {light, dark, system};
}

/// Density values a [ThemeDefinition] may declare: how tall rows are and how
/// much padding controls get. Business screens usually want [compact].
abstract final class Densities {
  const Densities._();

  static const String comfortable = 'comfortable';
  static const String standard = 'standard';
  static const String compact = 'compact';

  static const Set<String> all = {comfortable, standard, compact};
}

/// How an app looks: brand colour, brightness, density and shape.
///
/// Deliberately renderer-neutral and deliberately small — it says *what the
/// company looks like*, not how a particular toolkit draws it. A Material
/// renderer turns this into a `ThemeData`; another renderer maps its own way.
/// Renderer-specific extras go in [config] instead of growing the DSL.
///
/// Nothing here changes behaviour. Colours are kept as the declared `#RRGGBB`
/// string because this package has no Flutter dependency; use [argbOf] to read
/// one as a 32-bit value.
class ThemeDefinition extends Equatable {
  /// Brand colour (`#RRGGBB` / `#AARRGGBB`); the seed the palette derives from.
  final String? primaryColor;

  /// Accent colour. Derived from [primaryColor] when omitted.
  final String? secondaryColor;

  /// See [Brightnesses].
  final String brightness;

  /// See [Densities].
  final String density;

  /// Font family name; the renderer resolves it.
  final String? fontFamily;

  /// Corner radius in logical pixels.
  final double? radius;

  /// Renderer specific extras.
  final Map<String, Object?> config;

  const ThemeDefinition({
    this.primaryColor,
    this.secondaryColor,
    this.brightness = Brightnesses.light,
    this.density = Densities.standard,
    this.fontFamily,
    this.radius,
    this.config = const {},
  });

  /// [primaryColor] as a 32-bit ARGB value, or null when not declared.
  int? get primaryArgb => argbOf(primaryColor);

  /// [secondaryColor] as a 32-bit ARGB value, or null when not declared.
  int? get secondaryArgb => argbOf(secondaryColor);

  @override
  List<Object?> get props => [
        primaryColor,
        secondaryColor,
        brightness,
        density,
        fontFamily,
        radius,
        config,
      ];
}

/// Reads `#RRGGBB` / `#AARRGGBB` (`#` optional) as a 32-bit ARGB value.
///
/// Returns null when [color] is null or not a colour — the parser turns that
/// into an error, because a colour that is silently ignored is exactly the kind
/// of "I wrote it and nothing happened" this framework tries to remove.
int? argbOf(String? color) {
  if (color == null) return null;
  final hex = color.startsWith('#') ? color.substring(1) : color;
  if (hex.length != 6 && hex.length != 8) return null;
  final value = int.tryParse(hex, radix: 16);
  if (value == null) return null;
  return hex.length == 6 ? 0xFF000000 | value : value;
}
