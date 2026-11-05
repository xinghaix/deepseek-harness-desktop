Pacote nativo de skills para DeepSeek Harness portado de [`mattpocock/skills`](https://github.com/mattpocock/skills) (`v1.3.2`), preservando os prompts `SKILL.md` originais em inglês com adaptações para as ferramentas do DSH:

- **38 skills em 4 categorias**: `engineering` (20) e `productivity` (7) ativados por padrão; `in-progress` (7) e `misc` (4) opcionais no painel abaixo.
- **Sincronização automática em `~/.dsh/skills`**: Mantém symlinks gerenciados sem sobrescrever skills do usuário, com deduplicação automática via `@deepseek-ai/dsh-skill-filesystem`.
- **Explorador interativo**: Alterne categorias ou skills individuais, filtre por palavra-chave e pré-visualize os arquivos `SKILL.md` abaixo.
