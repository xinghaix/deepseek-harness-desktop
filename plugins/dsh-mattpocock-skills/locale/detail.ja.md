[`mattpocock/skills`](https://github.com/mattpocock/skills)（`v1.3.2`）から移植された DeepSeek Harness ネイティブスキルパック。英語原文の `SKILL.md` プロンプトを維持しつつ DSH ツール向けに最適化されています：

- **4 カテゴリ・全 38 スキル**：`engineering`（20）と `productivity`（7）は既定で有効、`in-progress`（7）と `misc`（4）は下部パネルから切り替え可能。
- **`~/.dsh/skills` 自動シンボリックリンク同期**：ユーザー作成スキルを上書きせずに管理対象リンクを維持し、`@deepseek-ai/dsh-skill-filesystem` と自動重複排除。
- **スキル管理＆プレビュー**：カテゴリや個別スキルの切り替え、キーワード検索、`SKILL.md` のプレビューに対応。
