"""Semanas do lote: sempre a segunda-feira, e só depois do treino do modelo (sem pandas nem
LightGBM, para a CLI validar os argumentos antes de tudo)."""

from datetime import date, timedelta

from worker.errors import WorkerError


def monday(day: date) -> date:
    """A segunda-feira da semana de `day`."""
    return day - timedelta(days=day.weekday())


def check_monday(day: date, flag: str = "a semana") -> None:
    if day.weekday() != 0:
        raise WorkerError(
            f"{flag} {day.isoformat()} não é segunda-feira: a semana é a da segunda"
            f" {monday(day).isoformat()}"
        )


def parse_monday(value: str, flag: str) -> date:
    """Data AAAA-MM-DD de um argumento da CLI, que precisa ser uma segunda-feira."""
    try:
        day = date.fromisoformat(value)
    except ValueError:
        raise WorkerError(f"{flag} {value}: use a data no formato AAAA-MM-DD") from None
    check_monday(day, flag)
    return day


def first_out_of_sample_week(card: dict) -> date:
    """A primeira segunda depois do fim do treino do modelo (`train_end` da ficha)."""
    day = date.fromisoformat(card["train_end"]) + timedelta(days=1)
    return day + timedelta(days=(7 - day.weekday()) % 7)


def check_out_of_sample(weeks: list[date], card: dict, allow_in_sample: bool) -> None:
    """Recusa semana que começa até `train_end`, a não ser com `allow_in_sample`."""
    train_end = date.fromisoformat(card["train_end"])
    inside = [w for w in weeks if w <= train_end]
    if inside and not allow_in_sample:
        listed = ", ".join(w.isoformat() for w in inside[:5]) + (" ..." if len(inside) > 5 else "")
        raise WorkerError(
            f"semana dentro do período de treino do modelo (até {train_end.isoformat()}):"
            f" {listed}. O modelo já viu esses scores no treino e a demo pareceria melhor do que"
            " é. Para processar mesmo assim, use --allow-in-sample."
        )
