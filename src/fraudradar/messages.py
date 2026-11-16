"""Mensagem de tela montada no servidor: texto em português + código estável + parâmetros.

O texto em português continua sendo o que as telas antigas mostram (`detail`, `message`,
`reason`). O front traduz pelo ``code`` e pelos ``params`` quando conhece o código
(``web/messages/<idioma>/errors.json``, ``errors.api``, e ``jobs.json`` para os trabalhos);
senão mostra o texto. O código é estável: trocar o texto não muda o código, e trocar o sentido
exige código novo.

``Msg`` é um ``str`` (o texto em português) com ``code`` e ``params`` pendurados: quem só quer o
texto (``==``, f-string, ``WorkerError(msg)``, gravar em coluna) não precisa mudar.
"""

from collections.abc import Mapping
from typing import Any


class Msg(str):
    code: str
    params: dict[str, Any]

    def __new__(cls, code: str, text: str, params: Mapping[str, Any] | None = None) -> "Msg":
        obj = super().__new__(cls, text)
        obj.code = code
        obj.params = dict(params or {})
        return obj

    @property
    def text(self) -> str:
        """O texto em português, como ``str`` simples."""
        return str.__str__(self)

    def as_fields(self, prefix: str = "") -> dict[str, Any]:
        """``{<prefix>code, <prefix>params}`` para juntar a um dicionário de resposta."""
        return {f"{prefix}code": self.code, f"{prefix}params": dict(self.params)}


def msg(code: str, text: str, **params: Any) -> Msg:
    return Msg(code, text, params)
