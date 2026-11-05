import pytest

from fraudradar.config import ROOT_DIR

# As skills das IAs existem em duas pastas: .agents/skills (Codex, Cursor, Copilot,
# Gemini) e .claude/skills (Claude Code). O original é o de .agents.
ORIGINAL_DIR = ROOT_DIR / ".agents" / "skills"
COPY_DIR = ROOT_DIR / ".claude" / "skills"


def _skill_names(base):
    return sorted(p.parent.name for p in base.glob("*/SKILL.md"))


def test_both_folders_have_the_same_skills():
    assert _skill_names(ORIGINAL_DIR), "nenhuma skill em .agents/skills"
    assert _skill_names(COPY_DIR) == _skill_names(ORIGINAL_DIR), (
        "as skills de .claude/skills e .agents/skills não são as mesmas"
    )


@pytest.mark.parametrize("name", _skill_names(ORIGINAL_DIR))
def test_skill_copy_matches_original(name):
    original = ORIGINAL_DIR / name / "SKILL.md"
    copy = COPY_DIR / name / "SKILL.md"
    assert copy.exists(), f"falta a cópia {copy.relative_to(ROOT_DIR)}"
    assert copy.read_text(encoding="utf-8") == original.read_text(encoding="utf-8"), (
        f"{copy.relative_to(ROOT_DIR)} difere de {original.relative_to(ROOT_DIR)}: "
        "copie o original por cima"
    )
