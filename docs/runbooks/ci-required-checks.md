# Checks requeridos en branch protection

> Tarea `LAB-003`. Describe qué comprobaciones de [`ci.yml`](../../.github/workflows/ci.yml)
> deben marcarse como obligatorias en la protección de rama de `main`, y por qué.
>
> **Esta configuración es manual y remota**: se aplica en GitHub, no desde el repositorio.
> Requiere permisos de administración y **no** la realiza ninguna tarea automáticamente.

## 1. Checks a exigir hoy

En *Settings → Branches → Branch protection rules* para `main`, activar
«Require status checks to pass before merging» y marcar:

| Check | Job en `ci.yml` | Qué garantiza |
|---|---|---|
| `quality` | `quality` | Lint, tipos y las pruebas unitarias, incluidas las de paridad dorada de `LAB-002` |
| `e2e-core` | `e2e-core` | Los flujos principales funcionan sobre el **build real**, en escritorio y móvil |

El job `build` no se marca como requerido por sí mismo: `e2e-core` depende de él
(`needs: build`), de modo que si el build o la auditoría de secretos fallan, `e2e-core`
nunca llega a ejecutarse y queda en rojo. Exigir `e2e-core` ya cubre ambos.

Conviene activar también «Require branches to be up to date before merging», porque los
tres jobs validan el commit de la rama, no el resultado de fusionarla.

## 2. Checks previstos, todavía inexistentes

No marcar como requeridos hasta que el workflow correspondiente exista, o `main` quedaría
bloqueado a la espera de un check que nadie publica:

| Check | Cuándo | Tarea |
|---|---|---|
| `supabase-tests` | Cuando exista `supabase-ci.yml` con migraciones y pruebas de RLS | Pendiente (divergencia D6) |
| `dependency-review` | Al endurecer la cadena de suministro | `LAB-004` |
| `bundle` | Al fijar el presupuesto de bundle | `LAB-008` |

## 3. Lo que esta configuración **no** cubre todavía

El despliegue a GitHub Pages sigue siendo un workflow independiente:
[`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml) dispara en `push` a `main`
**sin depender de CI**. Es decir, la protección de rama impide fusionar un PR roto, pero
no impide que un push directo a `main` se publique mientras CI está en rojo.

Cerrar ese hueco es el paso 4 de `LAB-004` («hacer deploy dependiente del SHA validado») y
es uno de los dos criterios que faltan para superar la puerta **G0**. Hasta entonces, la
protección de rama es la única barrera, y solo actúa sobre pull requests.

## 4. Comprobación local antes de abrir un PR

Los mismos comandos que ejecuta CI, en el mismo orden:

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:e2e
```

`npm run test:e2e` construye la aplicación y la sirve con `vite preview` en
`127.0.0.1:4173`. En CI no reconstruye: descarga el `dist` que ya produjo y auditó el job
`build`, de modo que las pruebas end-to-end se ejecutan sobre exactamente el mismo
artefacto.
