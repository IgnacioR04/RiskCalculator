# Runbook: fallo de despliegue en GitHub Pages

> Tarea `LAB-004`. Qué hacer cuando el sitio publicado está roto, desactualizado o el
> despliegue no se dispara. Complementa [`ci-required-checks.md`](./ci-required-checks.md).

## 1. Cómo se despliega ahora

Desde `LAB-004`, [`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml) **no** se
dispara con `push`. Espera a que el workflow **CI** termine sobre `main` y solo continúa si
su conclusión fue `success`; entonces hace checkout de
`github.event.workflow_run.head_sha`, es decir **el commit exacto que CI validó**, no la
punta de `main`.

```
push a main ──> CI (quality · build · e2e-core)
                     │
                     └─ success ──> Deploy a GitHub Pages (build + deploy del SHA validado)
```

Consecuencia deliberada: si CI falla, **no hay despliegue**. Un commit roto no puede
adelantarse a su propia validación.

El build de Pages no es el artefacto que audita CI: necesita el subpath
`/RiskCalculator/` (`DEPLOY_TARGET=gh-pages`) y las variables públicas de Supabase. Es el
**mismo commit**, reconstruido para su destino.

## 2. Síntoma: el despliegue no se dispara

Comprobar en este orden:

1. **¿CI terminó en verde sobre `main`?** Si está en rojo o en curso, no hay despliegue:
   es el comportamiento esperado. Arreglar CI.
2. **¿El workflow existe en la rama por defecto?** `workflow_run` solo se activa si el
   archivo está en `main`. Mientras estos cambios vivan en una rama sin fusionar, el
   encadenado **no funciona todavía**. No es un fallo.
3. **¿El evento venía de `main`?** El filtro `branches: [main]` mira la rama de la
   ejecución de CI, así que las de pull request no despliegan, por diseño.

## 3. Síntoma: el sitio publicado está roto

Redesplegar un commit bueno conocido, sin revertir nada:

1. Localizar el último SHA con CI en verde:

```bash
gh run list --workflow CI --branch main --status success --limit 5 --json headSha,displayTitle,createdAt
```

2. Lanzar el redespliegue manual con ese SHA completo:

```bash
gh workflow run "Deploy a GitHub Pages" --ref main -f sha=<SHA_COMPLETO>
```

3. Seguir la ejecución:

```bash
gh run watch $(gh run list --workflow "Deploy a GitHub Pages" --limit 1 --json databaseId --jq '.[0].databaseId')
```

El input `sha` es obligatorio: el redespliegue manual no asume `main`, porque el objetivo es
volver a un commit concreto que ya se sabe bueno. **Quien lo lanza es responsable de que ese
SHA haya pasado CI**; el workflow no puede comprobarlo por sí mismo en el disparo manual.

## 4. Síntoma: el navegador pide chunks que no existen

Tras publicar, Pages sirve `index.html` cacheado mientras los `assets/*.js` ya han cambiado
de hash. La aplicación se recupera sola: `lazyWithReload`
([`src/lib/lazyChunk.ts`](../../src/lib/lazyChunk.ts)) recarga una vez al fallar la carga de
un chunk. Si el usuario sigue atascado, forzar recarga dura. No requiere redespliegue.

## 5. Superficie de seguridad

| Control | Estado |
|---|---|
| Actions fijadas a SHA completo con su versión anotada | Sí, en los tres workflows |
| `pull_request_target` | No se usa en ningún workflow |
| Secretos accesibles desde código de un PR no confiable | No: los únicos secretos (`VITE_SUPABASE_*`) viven en `deploy-pages.yml`, que solo se dispara por `workflow_run` sobre `main` y por despacho manual |
| Permisos por defecto del workflow de despliegue | `permissions: {}`; cada job pide lo mínimo: `contents: read` para construir, `pages: write` + `id-token: write` solo para desplegar |
| Token persistido en el runner | No: `persist-credentials: false` en todos los checkouts |
| Concurrencia de Pages | Grupo `pages` sin cancelación, para no interrumpir una publicación en curso |

Las Actions las mantiene Dependabot, que ya vigila el ecosistema `github-actions`
([`dependabot.yml`](../../.github/dependabot.yml)): fijar a SHA no las deja congeladas.

## 6. Limitación conocida

Las versiones mayores en uso van por detrás de las últimas publicadas (por ejemplo
`actions/checkout` v4 frente a v7). `LAB-004` fija a SHA la versión **en uso**; actualizar
mayores es una decisión aparte, con su propia validación, y queda fuera de esta tarea.
