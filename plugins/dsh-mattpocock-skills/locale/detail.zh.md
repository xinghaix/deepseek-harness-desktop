移植自 [`mattpocock/skills`](https://github.com/mattpocock/skills)（`v1.3.2`）的 DeepSeek Harness 原生技能包，保留英文原版 `SKILL.md` 提示词与核心术语，并针对 DSH 工具链做最小化适配：

- **4 大分组共 38 项技能**：默认启用 `engineering`（20 项）与 `productivity`（7 项）核心技能；`in-progress`（7 项）与 `misc`（4 项）可在下方按需开启。
- **自动软链同步**：开启后自动维护 `~/.dsh/skills/<name>` 受管软链，不覆盖用户自建技能目录，并与 `@deepseek-ai/dsh-skill-filesystem` 自动去重。
- **可视化配置与预览**：支持在下方面板按分组或单技能开关、关键词检索及查看原版 `SKILL.md`。
