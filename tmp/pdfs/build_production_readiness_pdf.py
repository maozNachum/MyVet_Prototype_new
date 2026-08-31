from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tmp" / "pdfs" / "vendor"))

from bidi.algorithm import get_display
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    PageBreak,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


SOURCE = ROOT / "docs" / "PRODUCTION_READINESS_ACTION_PLAN_2026-08-30.md"
OUTPUT_DIR = ROOT / "output" / "pdf"
OUTPUT = OUTPUT_DIR / "MyVet_Production_Readiness_Action_Plan_HE.pdf"

PAGE_W, PAGE_H = A4
BLUE = colors.HexColor("#1E40AF")
BLUE_2 = colors.HexColor("#2563EB")
BLUE_LIGHT = colors.HexColor("#EFF6FF")
BLUE_PALE = colors.HexColor("#F7FAFF")
SLATE = colors.HexColor("#1E293B")
MUTED = colors.HexColor("#64748B")
LINE = colors.HexColor("#DCE7F7")
RED = colors.HexColor("#B91C1C")
GREEN = colors.HexColor("#047857")
AMBER = colors.HexColor("#B45309")

FONT_REGULAR = "ArialMyVet"
FONT_BOLD = "ArialMyVetBold"


def clean_markup(text: str) -> str:
    text = text.strip()
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    text = text.replace("**", "").replace("`", "")
    text = text.replace("\u2011", "-").replace("\u2013", "-").replace("\u2014", "-")
    return re.sub(r"\s+", " ", text).strip()


def visual(text: str, base_dir: str = "R") -> str:
    return get_display(clean_markup(text), base_dir=base_dir)


class RTLText(Flowable):
    def __init__(
        self,
        text: str,
        *,
        font: str = FONT_REGULAR,
        size: float = 10.2,
        leading: float | None = None,
        color=SLATE,
        align: str = "right",
        marker: str | None = None,
        pad_x: float = 0,
        pad_y: float = 0,
        background=None,
        border=None,
        radius: float = 0,
    ):
        super().__init__()
        self.text = clean_markup(text)
        self.font = font
        self.size = size
        self.leading = leading or size * 1.48
        self.color = color
        self.align = align
        self.marker = marker
        self.pad_x = pad_x
        self.pad_y = pad_y
        self.background = background
        self.border = border
        self.radius = radius
        self.lines: list[str] = []

    def _wrap_lines(self, width: float) -> list[str]:
        width = max(width, 30)
        paragraphs = self.text.split("\n") if self.text else [""]
        lines: list[str] = []
        for paragraph in paragraphs:
            words = paragraph.split()
            if not words:
                lines.append("")
                continue
            current = words[0]
            for word in words[1:]:
                candidate = f"{current} {word}"
                if pdfmetrics.stringWidth(visual(candidate), self.font, self.size) <= width:
                    current = candidate
                else:
                    lines.append(current)
                    current = word
            lines.append(current)
        return lines

    def wrap(self, avail_width, avail_height):
        marker_space = 14 if self.marker else 0
        content_width = avail_width - (self.pad_x * 2) - marker_space
        self.lines = self._wrap_lines(content_width)
        self.width = avail_width
        self.height = max(self.leading, len(self.lines) * self.leading) + self.pad_y * 2
        return self.width, self.height

    def draw(self):
        canvas = self.canv
        if self.background or self.border:
            canvas.saveState()
            if self.background:
                canvas.setFillColor(self.background)
            else:
                canvas.setFillColor(colors.white)
            if self.border:
                canvas.setStrokeColor(self.border)
                canvas.setLineWidth(0.7)
            else:
                canvas.setStrokeColor(self.background or colors.white)
            canvas.roundRect(0, 0, self.width, self.height, self.radius, fill=1, stroke=1 if self.border else 0)
            canvas.restoreState()

        canvas.saveState()
        canvas.setFillColor(self.color)
        canvas.setFont(self.font, self.size)
        y = self.height - self.pad_y - self.size
        marker_space = 14 if self.marker else 0
        right_edge = self.width - self.pad_x - marker_space

        if self.marker:
            canvas.setFont(self.font, self.size)
            canvas.drawRightString(self.width - self.pad_x, y, visual(self.marker))

        for line in self.lines:
            shown = visual(line)
            if self.align == "center":
                canvas.drawCentredString(self.width / 2, y, shown)
            elif self.align == "left":
                canvas.drawString(self.pad_x, y, shown)
            else:
                canvas.drawRightString(right_edge, y, shown)
            y -= self.leading
        canvas.restoreState()


def rtl(text: str, **kwargs) -> RTLText:
    return RTLText(text, **kwargs)


def page_decor(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BLUE)
    canvas.rect(0, PAGE_H - 7 * mm, PAGE_W, 7 * mm, fill=1, stroke=0)

    if doc.page > 1:
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.6)
        canvas.line(18 * mm, 15 * mm, PAGE_W - 18 * mm, 15 * mm)
        canvas.setFont(FONT_REGULAR, 8.2)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(PAGE_W - 18 * mm, 9.5 * mm, visual("MyVet | תוכנית מוכנות ל-Production"))
        canvas.drawString(18 * mm, 9.5 * mm, str(doc.page))
    canvas.restoreState()


def table_from_rows(rows: list[list[str]], available_width: float) -> Table:
    max_cols = max(len(row) for row in rows)
    normalized = [row + [""] * (max_cols - len(row)) for row in rows]
    normalized = [list(reversed(row)) for row in normalized]

    if max_cols == 2:
        widths = [available_width * 0.55, available_width * 0.45]
    elif max_cols == 3:
        widths = [available_width * 0.34, available_width * 0.39, available_width * 0.27]
    elif max_cols == 4:
        widths = [available_width * 0.25] * 4
    else:
        widths = [available_width / max_cols] * max_cols

    data = []
    for row_index, row in enumerate(normalized):
        cell_flowables = []
        for value in row:
            cell_flowables.append(
                rtl(
                    value,
                    font=FONT_BOLD if row_index == 0 else FONT_REGULAR,
                    size=8.5 if row_index == 0 else 8.1,
                    leading=11.3,
                    color=colors.white if row_index == 0 else SLATE,
                    pad_x=2,
                    pad_y=2,
                )
            )
        data.append(cell_flowables)

    table = Table(data, colWidths=widths, repeatRows=1, hAlign="RIGHT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BLUE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.45, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BLUE_PALE]),
            ]
        )
    )
    return table


def parse_markdown(md: str, content_width: float) -> list[Flowable]:
    lines = md.splitlines()
    story: list[Flowable] = []
    i = 0
    paragraph: list[str] = []

    def flush_paragraph():
        nonlocal paragraph
        if paragraph:
            text = " ".join(part.strip() for part in paragraph).strip()
            if text:
                story.append(rtl(text, size=10.1, leading=15.2, color=SLATE))
                story.append(Spacer(1, 3.5 * mm))
            paragraph = []

    while i < len(lines):
        raw = lines[i].rstrip()
        stripped = raw.strip()

        if not stripped:
            flush_paragraph()
            i += 1
            continue

        if stripped.startswith("|") and stripped.endswith("|"):
            flush_paragraph()
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].strip())
                i += 1
            rows = []
            for line in table_lines:
                cells = [cell.strip() for cell in line.strip("|").split("|")]
                if all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
                    continue
                rows.append(cells)
            if rows:
                story.append(table_from_rows(rows, content_width))
                story.append(Spacer(1, 4.5 * mm))
            continue

        heading = re.match(r"^(#{1,3})\s+(.+)$", stripped)
        if heading:
            flush_paragraph()
            level = len(heading.group(1))
            title = heading.group(2)
            if level == 1:
                i += 1
                continue
            if level == 2:
                story.append(Spacer(1, 3 * mm))
                story.append(
                    rtl(
                        title,
                        font=FONT_BOLD,
                        size=16.5,
                        leading=21,
                        color=BLUE,
                        pad_x=5 * mm,
                        pad_y=3 * mm,
                        background=BLUE_LIGHT,
                        border=LINE,
                        radius=5,
                    )
                )
                story.append(Spacer(1, 4 * mm))
            else:
                story.append(Spacer(1, 1.5 * mm))
                story.append(rtl(title, font=FONT_BOLD, size=12.7, leading=17, color=BLUE_2))
                story.append(Spacer(1, 2.2 * mm))
            i += 1
            continue

        bullet = re.match(r"^-\s+(.+)$", stripped)
        numbered = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if bullet or numbered:
            flush_paragraph()
            marker = "•" if bullet else f"{numbered.group(1)}."
            text = bullet.group(1) if bullet else numbered.group(2)
            story.append(rtl(text, size=9.8, leading=14.5, marker=marker, pad_x=2 * mm, color=SLATE))
            story.append(Spacer(1, 1.2 * mm))
            i += 1
            continue

        if stripped.startswith("**") and stripped.endswith("**"):
            flush_paragraph()
            color = RED if "FAIL" in stripped or "אינה מוכנה" in stripped else BLUE
            story.append(
                rtl(
                    stripped,
                    font=FONT_BOLD,
                    size=10.5,
                    leading=15,
                    color=color,
                    pad_x=4 * mm,
                    pad_y=2.5 * mm,
                    background=colors.HexColor("#FFF7ED") if color == RED else BLUE_LIGHT,
                    border=colors.HexColor("#FED7AA") if color == RED else LINE,
                    radius=4,
                )
            )
            story.append(Spacer(1, 3 * mm))
            i += 1
            continue

        paragraph.append(stripped)
        i += 1

    flush_paragraph()
    return story


def build():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(TTFont(FONT_REGULAR, r"C:\Windows\Fonts\arial.ttf"))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, r"C:\Windows\Fonts\arialbd.ttf"))

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title="MyVet - תוכנית משימות מלאה לקראת Production",
        author="MyVet",
        subject="Production readiness action plan",
    )

    story: list[Flowable] = []
    story.append(Spacer(1, 28 * mm))
    story.append(rtl("MyVet", font=FONT_BOLD, size=34, leading=40, color=BLUE, align="center"))
    story.append(Spacer(1, 5 * mm))
    story.append(rtl("תוכנית משימות מלאה לקראת Production", font=FONT_BOLD, size=22, leading=29, color=SLATE, align="center"))
    story.append(Spacer(1, 7 * mm))
    story.append(rtl("מסמך עבודה מאוחד המבוסס על בדיקות מוכנות, אבטחה וקבלת Staging", size=12, leading=18, color=MUTED, align="center"))
    story.append(Spacer(1, 18 * mm))
    story.append(
        rtl(
            "סטטוס נוכחי: מתאים לדמו מבוקר בלבד. לפני שימוש במידע רפואי אמיתי יש לסגור את שערי האבטחה, הזהות, התפעול והמשפט המפורטים במסמך.",
            font=FONT_BOLD,
            size=11.5,
            leading=18,
            color=RED,
            pad_x=8 * mm,
            pad_y=6 * mm,
            background=colors.HexColor("#FFF7ED"),
            border=colors.HexColor("#FDBA74"),
            radius=8,
        )
    )
    story.append(Spacer(1, 22 * mm))
    story.append(rtl("31 באוגוסט 2026", size=10.5, color=MUTED, align="center"))
    story.append(PageBreak())

    markdown = SOURCE.read_text(encoding="utf-8")
    # The cover replaces the source title and metadata block.
    first_section = markdown.find("## 1.")
    if first_section >= 0:
        markdown = markdown[first_section:]
    story.extend(parse_markdown(markdown, doc.width))

    doc.build(story, onFirstPage=page_decor, onLaterPages=page_decor)
    print(OUTPUT)


if __name__ == "__main__":
    build()
