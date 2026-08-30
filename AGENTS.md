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

## Flujo de trabajo: spec → plan → ejecutar → verificar → reporte

Este repositorio hereda de StructureCo/Copia-web la convención de trabajo de
las skills `superpowers:*` (no instaladas por defecto en toda sesión; cuando
estén disponibles, éste es el flujo a seguir — y cuando no, sigue siendo la
forma de organizar el trabajo aunque se ejecute a mano):

1. **Spec** — para un cambio no trivial, un documento de diseño en
   `docs/superpowers/specs/YYYY-MM-DD-slug-design.md`: qué se va a construir,
   qué queda fuera explícitamente, y con qué contrato. Usa
   `superpowers:brainstorming` (o la conversación equivalente) para llegar a
   esa forma antes de escribir código.
2. **Plan** — `docs/superpowers/plans/YYYY-MM-DD-slug.md`: tareas concretas
   con casillas (`- [ ]`), cada una con sus archivos y su criterio de
   verificación. La cabecera declara la sub-skill requerida para ejecutarlo:

   ```
   > **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
   > to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax
   > for tracking.
   ```

   Cuando las tareas del plan son independientes entre sí, se prefiere
   `superpowers:subagent-driven-development` (recomendado) sobre
   `superpowers:executing-plans` para paralelizarlas.
3. **Ejecutar** — TDD estricto (`superpowers:test-driven-development`): la
   prueba se escribe primero, se confirma que falla por la razón esperada
   (`RED`), y sólo entonces se implementa lo mínimo para pasarla (`GREEN`).
   Cada tarea del plan marca su casilla al cerrarse.
4. **Verificar antes de cerrar** — `superpowers:verification-before-completion`:
   ejecutar `npm run check` y leer la salida, no asumir que pasó. No se
   declara un cambio terminado sin haberlo comprobado.
5. **Reporte** — tras un cambio relevante, un documento corto en
   `reports/YYYY-MM-DD-HHmm-slug.md` que explique qué cambió y por qué, y se
   commitea junto con el cambio. Es el puente con cualquier otra sesión o
   agente que trabaje este repositorio sin ver esta conversación.

Un cambio pequeño y autocontenido no necesita las cinco etapas — spec y plan
son para lo que vale la pena planear antes de tocar código. `npm run check` y
un mensaje de commit que explique el porqué siguen siendo obligatorios siempre.

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
