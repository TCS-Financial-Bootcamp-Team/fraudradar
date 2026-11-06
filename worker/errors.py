"""Erros que a pessoa resolve sozinha: a mensagem diz o que aconteceu e o que rodar."""


class WorkerError(Exception):
    """O worker não pode fazer o que foi pedido (semana inválida, modelo ausente, carga ou
    reprocessamento recusados...). A CLI mostra a mensagem e sai com código 1."""
