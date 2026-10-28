# dsh-mattpocock-skills

Complete DeepSeek Harness (DSH) Cordis Bundle port of [`mattpocock/skills`](https://github.com/mattpocock/skills) (`v1.3.1`).

## Features

- **38 Skills across 4 Buckets**:
  - `engineering` (20 core skills — **enabled by default**)
  - `productivity` (7 core skills — **enabled by default**)
  - `in-progress` (7 experimental skills — **disabled by default**, toggleable in UI)
  - `misc` (4 stack-specific skills — **disabled by default**, toggleable in UI)
- **Automatic `~/.dsh/skills` Symlink Sync (`linkToDshSkills: true`)**:
  - Automatically maintains symlinks in `$DSH_HOME/skills/<name>` pointing to this plugin's `assets/<bucket>/<name>` directory.
  - Never overwrites or removes user-created skill directories or symlinks pointing outside this plugin.
  - Automatically deduplicates with `@deepseek-ai/dsh-skill-filesystem` when both are active.
- **English Original Prompts Preserved**:
  - Retains the original English `SKILL.md` prompts and Leading Words (`design tree`, `ubiquitous language`, `deep modules`, `seam`, etc.) with surgical DSH tool/path adaptations.
- **3-Color Spacious Settings & Skill Explorer UI**:
  - Configure buckets, toggle individual skills, search by keyword, and preview original English `SKILL.md` files directly in DSH Plugins.
