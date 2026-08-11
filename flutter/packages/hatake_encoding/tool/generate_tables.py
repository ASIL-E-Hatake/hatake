#!/usr/bin/env python3
"""Generates the Japanese charset tables (and the shared conformance fixture).

Why generated: a Shift_JIS table is ~7,000 mappings. Writing it by hand is not an
option, and taking a third-party package into an opt-in adapter would put someone
else's table between us and the bytes a customer's system receives. Python's
standard library already ships the codecs, so the table is derived from those and
committed — no runtime dependency, and the provenance is one command.

Usage (from the repository root, no third-party packages needed):

    python flutter/packages/hatake_encoding/tool/generate_tables.py

Writes:
    flutter/packages/hatake_encoding/lib/src/tables/<codec>.g.dart
    spec/conformance/charset.json
"""
import base64
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[4]
TABLES = ROOT / "flutter/packages/hatake_encoding/lib/src/tables"
FIXTURE = ROOT / "spec/conformance/charset.json"

# name in the DSL (`config.charset`) -> Python codec.
#
# cp932 と shift_jis を分けているのは、実務で「Shift_JIS」と言われるものがほぼ cp932
# （Windows / Excel の Shift_JIS）だから。①・～・㈱・髙(IBM拡張) は cp932 にはあって
# JIS X 0208 の shift_jis には無い。ここを取り違えると連携先で化ける／落ちる。
CODECS = {
    "cp932": "cp932",
    "shift_jis": "shift_jis",
    "euc_jp": "euc_jp",
}

# Everything the BMP can hold. Surrogates cannot be encoded on their own, and no
# Japanese charset covers anything above the BMP anyway.
MAX_CODE_POINT = 0xFFFF


def decode_map(codec: str) -> dict[int, int]:
    """Every byte sequence this codec accepts -> the code point it means.

    Built from the byte side on purpose. CP932 gives some characters **two** byte
    sequences (the IBM extension block appears both at 0xED40.. and, NEC-selected,
    at 0xFA40..), and only walking the bytes shows that.

    Key is the packed value: a single byte as-is, two bytes as `hi << 8 | lo`.
    """
    out: dict[int, int] = {}

    def accept(packed: int, raw: bytes) -> None:
        try:
            text = raw.decode(codec)
        except UnicodeDecodeError:
            return
        if len(text) != 1:
            return
        code_point = ord(text)
        if code_point > MAX_CODE_POINT:
            return
        # C1 制御（U+0080..U+009F）は外す。Microsoft の cp932 は 0x80 を素通しするが、
        # その範囲は2バイト文字の先頭バイトでもある。表に両方入れると「1バイトとして
        # 読むか、次のバイトと組にして読むか」が決まらない。業務データに C1 制御は
        # 出てこないので、外して曖昧さを構造的に消す。
        if 0x80 <= code_point <= 0x9F:
            return
        # 往復できないものは表に入れない（codec が正規化してしまう組み合わせ）。
        try:
            if text.encode(codec) is None:
                return
        except UnicodeEncodeError:
            return
        out[packed] = code_point

    for single in range(0x100):
        accept(single, bytes([single]))
    for lead in range(0x80, 0x100):
        for trail in range(0x100):
            accept((lead << 8) | trail, bytes([lead, trail]))
    return out


# CP932 の IBM 拡張が置かれているもう一つの領域。Python の encoder はここを選ぶが、
# Windows / Excel（と JVM の windows-31j）は NEC選定 IBM 領域（0xFA..0xFC）を書く。
IBM_AREA = range(0xED40, 0xEEFD)


def encode_map(
    codec: str, decode: dict[int, int]
) -> tuple[dict[int, int], dict[int, int]]:
    """code point -> the bytes we write, plus the byte sequences we only read.

    Which sequence to write is not a matter of taste: it has to be the one Windows
    and Excel write, or a receiving system built around them sees different bytes
    than it expects. So we start from the codec's own choice and fix the one place
    it differs — the IBM extension block, which CP932 holds twice. NEC row 13
    (`㈱` at 0x878A) is *also* duplicated, and there the codec's choice is already
    the Windows one, which is why this is a targeted rule and not "prefer the
    higher sequence". The JVM cross-check in the Java test is what keeps us honest.
    """
    preferred: dict[int, int] = {}
    alternatives: dict[int, list[int]] = {}
    for packed, code_point in sorted(decode.items()):
        alternatives.setdefault(code_point, []).append(packed)

    for code_point, packed_list in alternatives.items():
        chosen = _codec_choice(codec, code_point) or packed_list[0]
        if chosen in IBM_AREA:
            nec_selected = next(
                (p for p in packed_list if p >= 0xFA40), None
            )
            if nec_selected is not None:
                chosen = nec_selected
        preferred[code_point] = chosen

    aliases = {
        packed: code_point
        for packed, code_point in sorted(decode.items())
        if preferred[code_point] != packed
    }
    return preferred, aliases


def _codec_choice(codec: str, code_point: int) -> int | None:
    """What the codec itself writes for this character (packed), if it can."""
    try:
        encoded = chr(code_point).encode(codec)
    except UnicodeEncodeError:
        return None
    if len(encoded) == 1:
        return encoded[0]
    if len(encoded) == 2:
        return (encoded[0] << 8) | encoded[1]
    return None


def dart_table(
    name: str,
    codec: str,
    preferred: dict[int, int],
    aliases: dict[int, int],
) -> str:
    """One Dart file: base64 blobs, decoded lazily into maps."""
    units = bytearray()
    bytes_ = bytearray()
    for code_point, packed in sorted(preferred.items()):
        units += code_point.to_bytes(2, "big")
        bytes_ += packed.to_bytes(2, "big")
    alias_blob = bytearray()
    for packed, code_point in sorted(aliases.items()):
        alias_blob += packed.to_bytes(2, "big")
        alias_blob += code_point.to_bytes(2, "big")
    return f'''// GENERATED — do not edit by hand.
//
// {codec} の変換表。出自は Python 標準ライブラリの codec で、
// tool/generate_tables.py が書き出す（同じコマンドで何度でも再生成できる）。
// 書ける文字 {len(preferred)} 字 / 読めるだけの別バイト列 {len(aliases)} 通り。

/// 変換元（Unicode のコードポイント）を2バイトずつ並べたもの。
const String {name}Units =
    '{base64.b64encode(bytes(units)).decode()}';

/// 変換先（1バイトなら下位、2バイトなら上位<<8|下位）を2バイトずつ並べたもの。
const String {name}Bytes =
    '{base64.b64encode(bytes(bytes_)).decode()}';

/// 「読めるが書かない」バイト列（4バイトずつ: バイト列2 + コードポイント2）。
/// CP932 の IBM 拡張のように、同じ文字に2通りのバイト列があるときの片方。
const String {name}Aliases =
    '{base64.b64encode(bytes(alias_blob)).decode()}';
'''


def fixture(tables: dict[str, dict[int, int]]) -> dict:
    """The shared expectations. Small on purpose: the table itself is verified by
    counting round-trips, these are the cases a human wants to read."""
    samples = [
        "ASCII only",
        "こんにちは",
        "顧客マスタ",
        "半角ｶﾀｶﾅ",
        "①②③",  # NEC 特殊文字（cp932 にはあるが JIS X 0208 には無い）
        "㈱畠山商事",  # 丸括弧付き（同じく cp932 だけ）
        "髙島屋",  # はしごだか（IBM 拡張なので cp932 だけ）
        "𠮷野家",  # BMP 外のサロゲートペア（どの日本語コードにも無い）
        "受注番号,金額\r\n",
        "1,234,567 円",
        "全角～チルダ",  # 波ダッシュ問題。U+FF5E は cp932 だけ通る
    ]
    # 実装間で扱いが分かれる文字。JIS X 0208 の 0x2141 は本来 U+301C（波ダッシュ）で、
    # Microsoft 系はそこに U+FF5E（全角チルダ）も写す。EUC-JP でどちらを通すかは
    # 実装によって違う（Python は通さない・JVM は通す）ので、突き合わせから外す。
    ambiguous = {("euc_jp", "～")}
    cases = []
    for name in CODECS:
        preferred = tables[name]
        for text in samples:
            unmappable = next(
                (c for c in text if ord(c) not in preferred), None
            )
            if unmappable is not None:
                # 変換できない文字は「黙って化ける」より落とすのが業務要件。
                case = {"charset": name, "text": text, "unmappable": unmappable}
                if (name, unmappable) in ambiguous:
                    case["ambiguous"] = (
                        f"{unmappable!r} の扱いは実装で分かれる"
                        "（JIS X 0208 の 0x2141 は U+301C。Microsoft 系は U+FF5E も"
                        "同じ位置に写す）。他言語との突き合わせからは外す。"
                    )
                cases.append(case)
                continue
            encoded = bytearray()
            for character in text:
                packed = preferred[ord(character)]
                if packed <= 0xFF:
                    encoded.append(packed)
                else:
                    encoded.append(packed >> 8)
                    encoded.append(packed & 0xFF)
            cases.append({"charset": name, "text": text, "bytes": list(encoded)})
    return {
        "$comment": (
            "文字コード変換の期待値。Python 標準ライブラリの codec が出したバイト列で、"
            "Dart（hatake_encoding）と Java（JVM の Charset）が同じ結果になることを確認する。"
            "unmappable がある行は、その文字が変換できないので例外になることを期待する。"
        ),
        "counts": {name: len(table) for name, table in tables.items()},
        "cases": cases,
    }


def main() -> int:
    TABLES.mkdir(parents=True, exist_ok=True)
    tables = {}
    for name, codec in CODECS.items():
        preferred, aliases = encode_map(codec, decode_map(codec))
        tables[name] = preferred
        target = TABLES / f"{name}.g.dart"
        camel = name.split("_")[0] + "".join(
            part.capitalize() for part in name.split("_")[1:]
        )
        target.write_text(
            dart_table(camel, codec, preferred, aliases), encoding="utf-8"
        )
        print(
            f"{target.relative_to(ROOT)}: {len(preferred)} 文字"
            f"（別バイト列 {len(aliases)} 通り）"
        )

    data = fixture(tables)
    FIXTURE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"{FIXTURE.relative_to(ROOT)}: {len(data['cases'])} 件")
    return 0


if __name__ == "__main__":
    sys.exit(main())
