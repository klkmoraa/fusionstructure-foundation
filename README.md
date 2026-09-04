# `@fusionstructure/foundation`

Foundation es el paquete neutral del ecosistema FusionStructure. Contiene contratos versionables, sin imports desde una aplicación, solver o superficie visual. La versión estable del corte es `0.1.1`:

- `@fusionstructure/foundation/foundation`: unidades canónicas y álgebra lineal.
- `@fusionstructure/foundation/project-format`: envelope neutral v0.1, validación, hashing, migración no destructiva y preservación de extensiones opacas.
- `@fusionstructure/foundation/compatibility`: digest reproducible de artefactos de compatibilidad con normalización EOL.
- `schemas/project-format-0.1.schema.json`: esquema Draft 2020-12 ejecutable por consumidores.

Estado: **Experimental / prerelease**. La API es un contrato inicial, no certifica exactitud estructural ni prepara por sí sola un modelo para obra. Los motores FStructure 2D y Space3D siguen siendo responsables de sus hipótesis, resultados y validaciones de dominio.

## Desarrollo

```bash
npm ci
npm run check
npm pack --dry-run
```

La fuente se extrajo del monolito `FusionStructure` en el tag `monolith-cutover-20260904`. Las pruebas de formato conservan la compatibilidad explícita con el portable 2D legado: la migración requiere un adaptador externo y no renombra silenciosamente el formato.
