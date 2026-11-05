from fraudradar.config import ROOT_DIR

# A skill das IAs existe em duas pastas: .agents/skills (Codex, Cursor, Copilot,
# Gemini) e .claude/skills (Claude Code). O original é o de .agents.
ORIGINAL = ROOT_DIR / ".agents" / "skills" / "fraudradar" / "SKILL.md"
COPIES = [ROOT_DIR / ".claude" / "skills" / "fraudradar" / "SKILL.md"]


def test_agent_skill_copies_match_original():
    original = ORIGINAL.read_text(encoding="utf-8")
    for copy in COPIES:
        assert copy.read_text(encoding="utf-8") == original, (
            f"{copy.relative_to(ROOT_DIR)} difere de {ORIGINAL.relative_to(ROOT_DIR)}: "
            "copie o original por cima"
        )
