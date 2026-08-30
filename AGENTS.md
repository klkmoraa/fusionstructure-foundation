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
