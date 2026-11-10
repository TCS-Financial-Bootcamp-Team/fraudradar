"""Deterministic, overlapping text chunks for FraudRadar RAG."""

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class TextChunk:
    """A source-aligned chunk and its original character offsets."""

    index: int
    content: str
    start_char: int
    end_char: int


def split_document(
    content: str,
    *,
    max_chars: int = 1000,
    overlap_chars: int = 150,
) -> list[TextChunk]:
    """Split text on word boundaries, retaining source offsets.

    Offsets use Python string indexing: content[start_char:end_char].
    """
    if not isinstance(content, str):
        raise TypeError("O documento precisa ser uma string.")

    if max_chars <= 0:
        raise ValueError("max_chars deve ser positivo.")

    if not 0 <= overlap_chars < max_chars:
        raise ValueError(
            "overlap_chars deve ser >= 0 e menor que max_chars."
        )

    words = list(re.finditer(r"\S+", content))

    if not words:
        return []

    if any(len(word.group()) > max_chars for word in words):
        raise ValueError(
            "Existe uma palavra maior que max_chars. "
            "Revise o documento ou aumente o limite."
        )

    chunks = []
    first = 0

    while first < len(words):
        start = words[first].start()
        last = first

        while (
            last + 1 < len(words)
            and words[last + 1].end() - start <= max_chars
        ):
            last += 1

        end = words[last].end()

        chunks.append(
            TextChunk(
                index=len(chunks),
                content=content[start:end],
                start_char=start,
                end_char=end,
            )
        )

        if last == len(words) - 1:
            break

        # Move backwards to include some prior words in the next chunk.
        # At least one new word is always processed per iteration.
        next_first = last + 1

        if overlap_chars > 0:
            candidate = last

            while (
                candidate > first
                and end - words[candidate].start() <= overlap_chars
            ):
                next_first = candidate
                candidate -= 1

        first = next_first

    return chunks
