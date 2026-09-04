# Extracción de Foundation

Este repositorio se separó con `git filter-repo` desde `klkmoraa/FusionStructure` usando el tag `monolith-cutover-20260904` como punto de corte.

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
