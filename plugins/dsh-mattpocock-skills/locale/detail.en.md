Native DeepSeek Harness skill bundle ported from [`mattpocock/skills`](https://github.com/mattpocock/skills) (`v1.3.2`), preserving the original English `SKILL.md` prompts with surgical DSH tool adaptations:

- **38 Skills across 4 Buckets**: `engineering` (20) and `productivity` (7) core skills enabled by default; `in-progress` (7) and `misc` (4) optional in the panel below.
- **Automatic `~/.dsh/skills` Symlink Sync**: Maintains managed symlinks without overwriting user-created skills, deduplicating automatically with `@deepseek-ai/dsh-skill-filesystem`.
- **Interactive Explorer**: Toggle buckets or individual skills, filter by keyword, and preview `SKILL.md` files directly below.
