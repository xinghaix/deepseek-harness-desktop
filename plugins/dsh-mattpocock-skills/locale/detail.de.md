Natives DeepSeek-Harness-Skill-Bundle, portiert von [`mattpocock/skills`](https://github.com/mattpocock/skills) (`v1.3.2`), unter Beibehaltung der englischen Original-`SKILL.md`-Prompts mit gezielten DSH-Tool-Anpassungen:

- **38 Skills in 4 Kategorien**: `engineering` (20) und `productivity` (7) standardmäßig aktiviert; `in-progress` (7) und `misc` (4) unten optional zuschaltbar.
- **Automatische `~/.dsh/skills`-Symlink-Synchronisierung**: Pflegt verwaltete Symlinks ohne eigene Benutzer-Skills zu überschreiben, inklusive Deduplizierung mit `@deepseek-ai/dsh-skill-filesystem`.
- **Interaktive Verwaltung**: Kategorien oder einzelne Skills umschalten, nach Stichwörtern filtern und `SKILL.md`-Dateien direkt unten einsehen.
