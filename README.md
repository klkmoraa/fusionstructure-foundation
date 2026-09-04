# FusionStructure Foundation — archivo histórico

> **Retirado y preparado para archivo. No usar como dependencia nueva ni runtime compartido.**

`v0.1.1` es el último corte histórico. El repositorio y sus tags se conservan para trazabilidad, comparación y arqueología; no reciben desarrollo de producto. Después de integrar esta nota, GitHub se configura en modo archivado. No existe un paquete publicado en npm que deba retirar o marcar como obsoleto.

Cada producto mantiene ahora su propia Foundation mínima:

- [`fstructure`](https://github.com/klkmoraa/fstructure): unidades, álgebra y tipos numéricos 2D;
- [`fusionstructure-space3d`](https://github.com/klkmoraa/fusionstructure-space3d): unidades y álgebra 3D;
- [`fusionstructure-web`](https://github.com/klkmoraa/fusionstructure-web): catálogo, identificadores y URLs públicas;
- [`FusionStructure`](https://github.com/klkmoraa/FusionStructure): Foundation completa del monolito principal, integración y compatibilidad.

Está prohibido importar `@fusionstructure/foundation` desde esos repositorios. Los formatos entre aplicaciones se intercambian como contratos versionados con copias locales soportadas, no como código runtime central.

## Contenido del último corte

El corte histórico contiene contratos neutrales sin imports desde una aplicación, solver o superficie visual:

- `@fusionstructure/foundation/foundation`: unidades canónicas y álgebra lineal.
- `@fusionstructure/foundation/project-format`: envelope neutral v0.1, validación, hashing, migración no destructiva y preservación de extensiones opacas.
- `@fusionstructure/foundation/compatibility`: digest reproducible de artefactos de compatibilidad con normalización EOL.
- `schemas/project-format-0.1.schema.json`: esquema Draft 2020-12 ejecutable por consumidores.

Estado del corte: **Experimental / histórico**. La API no certifica exactitud estructural ni prepara por sí sola un modelo para obra.

## Reproducción histórica

```bash
npm ci
npm run check
npm pack --dry-run
```

La fuente se extrajo del monolito `FusionStructure` en el tag `monolith-cutover-20260904`. Las pruebas de formato conservan la compatibilidad explícita con el portable 2D legado: la migración requiere un adaptador externo y no renombra silenciosamente el formato. Estos comandos sólo reproducen el corte; no constituyen un flujo de publicación activo.
