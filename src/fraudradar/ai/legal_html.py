"""Extract article-oriented legal text from official HTML documents."""

import re
from dataclasses import dataclass
from html.parser import HTMLParser

ARTICLE_PATTERN = re.compile(
    r"^Art[.]\s*(\d+)\s*"
    r"(?:[\u00ba\u00b0])?"
    r"(?:-([A-Za-z]))?"
    r"(?=[.\s]|$)",
    flags=re.IGNORECASE,
)


@dataclass(frozen=True)
class LegalArticle:
    """A legal article and its associated paragraphs."""

    reference: str
    paragraphs: tuple[str, ...]
    content: str


class _ParagraphParser(HTMLParser):
    """Extract visible text from HTML paragraph elements."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.paragraphs: list[str] = []
        self._parts: list[str] | None = None
        self._excluded_depth = 0

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        if tag in {"script", "style"}:
            self._excluded_depth += 1

        if self._excluded_depth:
            return

        if tag == "p":
            if self._parts is not None:
                self._finish_paragraph()

            self._parts = []

        elif tag == "br" and self._parts is not None:
            self._parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self._excluded_depth == 0 and self._parts is not None:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"}:
            self._excluded_depth = max(0, self._excluded_depth - 1)
            return

        if tag == "p" and self._parts is not None:
            self._finish_paragraph()

    def _finish_paragraph(self) -> None:
        if self._parts is None:
            return

        content = " ".join("".join(self._parts).split())

        if content:
            self.paragraphs.append(content)

        self._parts = None


def extract_paragraphs(html: str) -> list[str]:
    """Extract normalized HTML paragraph text."""
    parser = _ParagraphParser()
    parser.feed(html)
    parser.close()

    if parser._parts is not None:
        parser._finish_paragraph()

    return parser.paragraphs


def _is_section_heading(paragraph: str) -> bool:
    """Identify standalone section headings."""
    value = paragraph.strip()

    if not 5 <= len(value) <= 160:
        return False

    if value != value.upper():
        return False

    if not any(character.isalpha() for character in value):
        return False

    return re.match(
        r"^(?:[IVXLCDM]+|\d+)\s*[-.)]",
        value,
    ) is None


def _is_document_closing(paragraph: str) -> bool:
    """Recognize the formal closing line before signatures."""
    return bool(
        re.match(
            r"^Bras[i\u00ed]lia,\s*\d+\s+de\s+",
            paragraph.strip(),
            flags=re.IGNORECASE,
        )
    )


def extract_articles(html: str) -> list[LegalArticle]:
    """Extract articles without section headings or signatures."""
    paragraphs = extract_paragraphs(html)

    articles: list[LegalArticle] = []
    current_reference: str | None = None
    current_paragraphs: list[str] = []

    def finish_article() -> None:
        if current_reference is None or not current_paragraphs:
            return

        articles.append(
            LegalArticle(
                reference=current_reference,
                paragraphs=tuple(current_paragraphs),
                content="\n\n".join(current_paragraphs),
            )
        )

    for paragraph in paragraphs:
        if (
            current_reference is not None
            and _is_document_closing(paragraph)
        ):
            break

        match = ARTICLE_PATTERN.match(paragraph)

        if match:
            finish_article()

            number = match.group(1)
            suffix = match.group(2)

            current_reference = (
                f"Art. {number}"
                + (f"-{suffix.upper()}" if suffix else "")
            )

            current_paragraphs = [paragraph]
            continue

        if current_reference is None:
            continue

        if _is_section_heading(paragraph):
            continue

        current_paragraphs.append(paragraph)

    finish_article()
    return articles
