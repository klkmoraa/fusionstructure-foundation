# Extracción histórica de Foundation

> Este repositorio se archiva después de `v0.1.1`. No debe consumirse como dependencia. Cada producto conserva una Foundation mínima local y los contratos entre aplicaciones viajan como formatos versionados.

Este repositorio se separó con `git filter-repo` desde `klkmoraa/FusionStructure` usando el tag `monolith-cutover-20260904` como punto de corte. La primera etiqueta `v0.1.0` dejó la API raíz funcionando; `v0.1.1` corrigió el empaquetado de las tres subrutas públicas y queda como último corte histórico.

## Incluido

- `src/foundation`: unidades y álgebra lineal neutrales.
- `src/project-format`: contrato de proyecto, validación y migración.
- `src/compatibilityArtifactDigest.ts`: digest de corpus estable frente a CRLF/LF.
- `schemas/project-format-0.1.schema.json`: esquema ejecutable.
- pruebas originales de unidades, álgebra y formato.

## Deliberadamente excluido

No se trasladan aplicaciones, React, workers, motores 2D/3D, persistencias ni rutas de UI. La prueba `linearAlgebra.boundary.test.ts` del monolito verificaba fronteras entre productos y por eso permanece en el repositorio de gobierno, no en este paquete.

## Compatibilidad

`PROJECT_FORMAT_VERSION` sigue en `0.1`. El portable 2D de FStructure se identifica como legado y devuelve `external-adapter-required`; Foundation no embebe modelos de dominio ni elimina bytes de extensiones desconocidas.
