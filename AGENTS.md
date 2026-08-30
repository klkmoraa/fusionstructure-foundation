# FusionStructure — reglas persistentes

Este archivo describe **este** repositorio (`github.com/klkmoraa/FusionStructure`),
no StructureCo ni Copia-web, de los que salió. Una regla que nadie puede
verificar no es una regla, es un deseo: lo que queda aquí tiene un gate que lo
respalde o una razón comprobable.

## Qué manda, y en qué orden

1. El código, las pruebas y los gates ejecutables (`npm run check`).
2. La documentación canónica (`docs/README.md` es el índice).
3. El historial de Git.

Ante una discrepancia gana lo de más arriba. Un plan, una especificación o un
reporte antiguo **no prueban** que algo esté implementado — sólo el código y
`npm run check` lo prueban.

## Sin fronteras protegidas

StructureCo y Copia-web congelan `src/engine/**`, `src/workers/**`,
`src/data/**`, `src/store/ProjectContext.tsx` y `src/types.ts` detrás de un
checksum (`npm run verify:protected`): tocarlos exige autorización explícita.
**FusionStructure no hereda esa política.** El dominio entero —solver, motor,
schema, persistencia, workers, Space 3D— sigue siendo experimental mientras
dure la fusión, y la única regla real sobre esa frontera es que no hay
frontera: todo es movible, rediseñable o sustituible sin pedir permiso
especial. No existe un `verify:protected` en este repositorio y no hay que
añadir uno por costumbre heredada.

Eso no es licencia para romper sin cuidado. Lo que sostiene la calidad aquí no
es un archivo intocable, es lo que se puede ejecutar:

- `npm run check` — lint, typecheck, pruebas y build. Ver
  [`docs/estado-de-la-fusion.md`](docs/estado-de-la-fusion.md) para qué cubren
  hoy las pruebas y qué queda deliberadamente sin cubrir, y por qué.
- `src/design-system/designSystem.test.ts` — la única superficie que sí es una
  guarda estricta: la identidad visual (minimalismo acromático, sin
  claymorphism, sin capa de parches). Ver
  [`docs/sistema-visual.md`](docs/sistema-visual.md).

Si algún día una pieza concreta necesita protegerse de verdad (por ejemplo, el
solver una vez que deje de ser experimental), la forma correcta es la misma
que usan los repos de origen: un gate ejecutable con una razón escrita al
lado, no una convención de palabra.

## Flujo de trabajo: Superpowers

[`obra/superpowers`](https://github.com/obra/superpowers) es una metodología
de desarrollo de software para agentes de código, empaquetada como un
conjunto de skills instalables. No viene activada por defecto en toda sesión
— se instala como plugin (en Claude Code: `/plugin install
superpowers@claude-plugins-official`) y su skill de arranque,
`using-superpowers`, es la que hace que las demás se invoquen solas según lo
que el agente esté haciendo. Sin ese arranque, las skills están en disco pero
nunca se disparan.

Cuando está disponible, propone siete fases:

1. **Brainstorming** — refinar la idea con preguntas antes de escribir código.
2. **Using Git Worktrees** — aislar el trabajo en una rama/worktree nueva.
3. **Writing Plans** — descomponer en tareas de 2-5 minutos con criterios
   exactos.
4. **Subagent-Driven Development** — despachar subagentes por tarea, con
   revisión en dos etapas.
5. **Test-Driven Development** — RED → GREEN → REFACTOR obligatorio.
6. **Requesting Code Review** — verificar el resultado contra el plan antes
   de seguir.
7. **Finishing a Development Branch** — decidir merge/PR y limpiar.

Las catorce skills del repositorio, agrupadas como las agrupa el propio
proyecto:

| Categoría | Skills |
|---|---|
| Meta | `using-superpowers` (arranque), `writing-skills` |
| Colaboración | `brainstorming`, `writing-plans`, `executing-plans`, `dispatching-parallel-agents`, `subagent-driven-development`, `requesting-code-review`, `receiving-code-review`, `using-git-worktrees`, `finishing-a-development-branch` |
| Pruebas | `test-driven-development` |
| Depuración | `systematic-debugging`, `verification-before-completion` |

Ninguna de estas skills está instalada en este repositorio ni se asume
disponible en toda sesión que lo trabaje: es una referencia de proceso, no
una dependencia. Cuando esté disponible, es el flujo a seguir; cuando no,
`npm run check` y un mensaje de commit que explique el porqué siguen siendo
lo mínimo obligatorio (ver "Antes de cerrar" más abajo).

## Identidad visual

`src/design-system/tokens.css` es la fuente única de color, forma, materia y
tipografía; `src/design-system/material.css` reparte la materia por
`data-level`. El resto del CSS consume roles, nunca literales. Ver
[`docs/sistema-visual.md`](docs/sistema-visual.md).

## Antes de cerrar

- `npm run check` (lint · typecheck · pruebas · build). No se declara éxito
  sin haberlo ejecutado y leído. Si algo falla, se dice qué falla.
- No se hace push sin que el usuario lo pida en esa sesión.
- No se abre Pull Request salvo petición explícita.
