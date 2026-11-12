"""Nome das versões do modelo.

O modelo oficial do SAML-D se chama ``lightgbm_vN`` (arquivos em ``models/``). Os retreinos de um
conjunto ficam em ``models/<slug>/lightgbm_vN.*`` e aparecem como ``<slug>/vN`` onde a versão é
mostrada ou guardada (``model_versions``, ``datasets.active_model_version``, respostas da API):
assim ``lightgbm_v2`` (oficial) e ``saml-d/v2`` (retreino) nunca se confundem. Sem LightGBM.
"""

import re

OFFICIAL_PATTERN = re.compile(r"^lightgbm_v[0-9]{1,6}$")
DATASET_PATTERN = re.compile(r"^(?P<slug>[a-z0-9-]{1,40})/v(?P<number>[0-9]{1,6})$")


def dataset_version_name(slug: str, number: int) -> str:
    return f"{slug}/v{number}"


def parse_dataset_version(name: str) -> tuple[str, int] | None:
    """``(slug, número)`` de um nome ``<slug>/vN``; ``None`` para qualquer outro nome."""
    match = DATASET_PATTERN.fullmatch(name)
    return None if match is None else (match["slug"], int(match["number"]))


def file_stem(number: int) -> str:
    """Nome dos arquivos da versão no disco (``lightgbm_vN``), oficial ou de conjunto."""
    return f"lightgbm_v{number}"
