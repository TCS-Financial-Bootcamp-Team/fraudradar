"""Local text embeddings for FraudRadar RAG."""

from functools import lru_cache

import numpy as np
from sentence_transformers import SentenceTransformer

from fraudradar.config import get_settings


@lru_cache(maxsize=2)
def _load_model(model_name: str) -> SentenceTransformer:
    """Load the model once per process and model name."""
    return SentenceTransformer(model_name, device="cpu")


class EmbeddingService:
    """Generate normalized document and query embeddings locally."""

    def __init__(self) -> None:
        settings = get_settings()
        self.model_name = settings.embedding_model
        self.dimension = settings.embedding_dim

    def _model(self) -> SentenceTransformer:
        return _load_model(self.model_name)

    def _encode(self, texts: list[str], prefix: str) -> np.ndarray:
        if not texts:
            raise ValueError("A lista de textos nao pode estar vazia.")

        if any(not isinstance(t, str) or not t.strip() for t in texts):
            raise ValueError("Todos os textos devem ser strings nao vazias.")

        prepared = [f"{prefix}: {text.strip()}" for text in texts]

        vectors = self._model().encode(
            prepared,
            normalize_embeddings=True,
            convert_to_numpy=True,
            show_progress_bar=False,
        )

        vectors = np.asarray(vectors, dtype=np.float32)

        if vectors.shape != (len(texts), self.dimension):
            raise ValueError(
                f"Dimensoes inesperadas: {vectors.shape}. "
                f"Esperado: ({len(texts)}, {self.dimension})."
            )

        if not np.isfinite(vectors).all():
            raise ValueError("O modelo retornou valores invalidos.")

        return vectors

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        """Generate document embeddings using the E5 passage prefix."""
        return self._encode(texts, "passage")

    def embed_query(self, text: str) -> np.ndarray:
        """Generate one query embedding using the E5 query prefix."""
        return self._encode([text], "query")[0]
