import z from "@deepseek-ai/schemastery";

export const name = "dsh-enhancements";

export const Config = z.object({
  archiveManager: z.boolean().default(true).volatile(),
});

export function apply(ctx) {
  ctx.inject(["settings"], (scope) => {
    scope.effect(() => scope.settings.configure({ auto: false }, ctx.fiber));
  });
}
