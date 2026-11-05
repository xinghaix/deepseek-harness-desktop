Paquete nativo de skills para DeepSeek Harness portado de [`mattpocock/skills`](https://github.com/mattpocock/skills) (`v1.3.2`), conservando los prompts `SKILL.md` originales en inglés adaptados a las herramientas de DSH:

- **38 skills en 4 categorías**: `engineering` (20) y `productivity` (7) activados por defecto; `in-progress` (7) y `misc` (4) opcionales en el panel inferior.
- **Sincronización automática en `~/.dsh/skills`**: Mantiene enlaces simbólicos gestionados sin sobrescribir skills propios y deduplica con `@deepseek-ai/dsh-skill-filesystem`.
- **Explorador interactivo**: Activa o desactiva categorías o skills individuales, filtra por palabra clave y previsualiza los archivos `SKILL.md` abajo.
