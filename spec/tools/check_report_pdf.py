#!/usr/bin/env python3
"""Check that the sample report PDF is a real PDF, read by a library we didn't write.

`hatake_print` writes PDF bytes itself, and its own tests can only prove that it
agrees with itself. This opens the committed sample with an unrelated library
(pypdf) and reads back what a person would see: the page count, the title, the
group headings, the formatted amounts, the subtotals and the grand total.

It also re-checks the cross-reference table by hand. Every entry is a byte
offset, so a stray line-ending conversion (or an off-by-one in the writer) makes
a file that some viewers open and others reject — this catches it either way.

Usage: python spec/tools/check_report_pdf.py   (run from the repository root)
"""
import pathlib
import re
import sys

from pypdf import PdfReader

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
PDF = ROOT / "flutter/packages/hatake_print/test/golden/sales_report.pdf"

failures = 0


def check(label: str, ok: bool) -> None:
    global failures
    if ok:
        print(f"OK   {label}")
    else:
        failures += 1
        print(f"FAIL {label}")


raw = PDF.read_bytes()
reader = PdfReader(PDF)
pages = [page.extract_text() for page in reader.pages]
text = "\n".join(pages)

# (a) 構造: 別の実装が開けること
check("pypdf が開けて、紙は3枚（得意先ごとに改ページする例）", len(reader.pages) == 3)
check("題が入っている（ビューアのタブに出る）", reader.metadata.title == "売上明細表")
check(
    "用紙は A4 縦",
    [round(float(v)) for v in reader.pages[0].mediabox] == [0, 0, 595, 842],
)

# (b) 相互参照表のバイト位置（改行の書き換えで壊れていないこと）
start = int(re.search(rb"startxref\s+(\d+)", raw).group(1))
check("startxref が xref を指している", raw[start:start + 4] == b"xref")
offsets = [
    int(m.group(1))
    for m in re.finditer(rb"^(\d{10}) 00000 n \n", raw[start:], re.MULTILINE)
]
check(
    f"{len(offsets)} 個の object が、表の言うバイト位置にある",
    all(
        raw[offset:].startswith(f"{i + 1} 0 obj".encode())
        for i, offset in enumerate(offsets)
    ),
)

# (c) 中身: 人が紙で見るもの
check("表題とページ番号がどの紙にも出る", all("売上明細表" in p for p in pages))
check("ページ番号は 1/3・2/3・3/3", all(f"{i + 1} / 3" in p for i, p in enumerate(pages)))
check("列見出しが出る", "受注番号" in pages[0] and "金額" in pages[0])
check(
    "グループ見出しは得意先ごと",
    all(
        f"顧客: {name}" in page
        for name, page in zip(["山田商事", "佐藤物産", "鈴木工業"], pages)
    ),
)
check("金額は定義の書式（円記号と桁区切り）", "¥1,250,000" in text)
check("負の金額も出る", "-¥5,000" in text)
check("小計は得意先ごと", "小計 ¥1,387,800 / 3 件" in pages[0])
check("総計は最後の紙に1つだけ", text.count("合計 ¥1,502,500 / 6 件") == 1)
check("脚注が入っている", "売上明細表 - 3/3" in pages[2])
check("文字を選んでコピーできる（画像にしていない）", "SO-1001" in text)

# (d) 毎回同じバイト列（日付が入っていないこと）
check("作成日時を入れていない", b"/CreationDate" not in raw)

if failures:
    print(f"\n{failures} check(s) failed")
    sys.exit(1)
print(f"\n{PDF.relative_to(ROOT)}: すべて通過")
