"""Cifra reversível da senha das conexões externas (Fernet).

A chave vem de ``CONNECTIONS_SECRET_KEY`` e só a API e o worker a leem. Sem chave nada é salvo
nem decifrado: a mensagem de erro diz o que configurar, e nenhum texto de erro inclui a senha.
"""

from cryptography.fernet import Fernet, InvalidToken

from fraudradar.config import get_settings


class SecretKeyMissingError(RuntimeError):
    """``CONNECTIONS_SECRET_KEY`` ausente ou inválida."""


class CannotDecryptError(RuntimeError):
    """A senha guardada não abre com a chave atual (chave trocada ou dado corrompido)."""


def _fernet() -> Fernet:
    key = (get_settings().connections_secret_key or "").strip()
    if not key:
        raise SecretKeyMissingError(
            "A chave de cifra das conexões não está configurada. "
            "Defina CONNECTIONS_SECRET_KEY no ambiente da API e do worker."
        )
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError) as exc:
        raise SecretKeyMissingError(
            "CONNECTIONS_SECRET_KEY é inválida: use uma chave Fernet (32 bytes em base64)."
        ) from exc


def encrypt_password(password: str) -> str:
    return _fernet().encrypt(password.encode("utf-8")).decode("ascii")


def decrypt_password(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise CannotDecryptError(
            "Não foi possível abrir a senha guardada: a CONNECTIONS_SECRET_KEY mudou. "
            "Cadastre a conexão de novo."
        ) from exc
