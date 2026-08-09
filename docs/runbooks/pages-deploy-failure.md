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
3. **¿El evento venía de un push a `main` de este repositorio?** El filtro
   `branches: [main]` de `workflow_run` **no** basta: compara contra `head_branch`, que es
   la rama *de origen* de la ejecución de CI, no la de destino. Como CI también corre en
   `pull_request`, un PR desde un fork cuya rama se llamara `main` lo pasaría. Por eso el
   `if:` del job de build exige además `workflow_run.event == 'push'`,
   `head_branch == 'main'` y `head_repository.full_name == github.repository`. Si el
   despliegue no arranca tras un PR, es precisamente lo esperado.

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
| Secretos accesibles desde código de un PR no confiable | No: el `if:` del job de build exige push, rama `main` y repositorio de origen propio, de modo que un PR de fork no llega a hacer checkout ni a ver los secretos |
| Permisos por defecto del workflow de despliegue | `permissions: {}`; cada job pide lo mínimo: `contents: read` y `pages: read` para construir, `pages: write` + `id-token: write` solo para desplegar |
| Token persistido en el runner | No: `persist-credentials: false` en todos los checkouts |
| SHA del redespliegue manual | Validado con `^[0-9a-f]{40}$` antes del checkout: un valor vacío haría que checkout tomara la punta de `main` |
| Concurrencia de Pages | Grupo `pages` sin cancelación, para no interrumpir una publicación en curso |

### Riesgos residuales aceptados

- **Orden de publicación.** CI no cancela ejecuciones en `main`, así que dos pushes seguidos pueden terminar en orden inverso y publicar el bundle antiguo sobre el reciente. Un «Re-run» de una ejecución antigua de CI tiene el mismo efecto. Es el comportamiento de la plantilla oficial de GitHub; si llega a molestar, añadir una comprobación de que el SHA sigue siendo la punta de `main` antes de construir.
- **La auditoría de secretos de `ci.yml` es un cinturón de seguridad débil**, no una garantía: busca el *nombre* `TWELVE_DATA_API_KEY`, no valores, y se ejecuta en el build de CI, que no recibe ningún secreto. El build que sí los recibe es el de este workflow, y ahí no hay auditoría. La protección real es que `TWELVE_DATA_API_KEY` no lleva prefijo `VITE_`, de modo que Vite nunca la expone al cliente.
- **El despacho manual no comprueba que el SHA pasara CI**: valida su forma, no su historial. Es responsabilidad de quien lo lanza.

Las Actions las mantiene Dependabot, que ya vigila el ecosistema `github-actions`
([`dependabot.yml`](../../.github/dependabot.yml)): fijar a SHA no las deja congeladas.

## 6. Limitación conocida

Las versiones mayores en uso van por detrás de las últimas publicadas (por ejemplo
`actions/checkout` v4 frente a v7). `LAB-004` fija a SHA la versión **en uso**; actualizar
mayores es una decisión aparte, con su propia validación, y queda fuera de esta tarea.
