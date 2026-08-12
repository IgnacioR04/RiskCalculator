# Runbook: qué capacidades del Laboratorio se publican

> Cómo encender o apagar una capacidad en el sitio publicado, y por qué la lista vive donde
> vive. Complementa [`pages-deploy-failure.md`](./pages-deploy-failure.md).

## 1. Dónde se decide

En una sola línea de [`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml), dentro
del `env:` del paso de build:

```yaml
VITE_LAB_FLAGS: labShell,labIpsV2,labStabilityV2,labLookThrough
```

El catálogo cerrado de capacidades está en
[`src/lib/features/flags.ts`](../../src/lib/features/flags.ts). Un nombre que no esté ahí no
activa nada.

**No está en una variable del repositorio a propósito.** Encender una capacidad es una
decisión de release: tiene que verse en un diff, poder revisarse y poder revertirse con otro
commit. Una variable de repositorio cambiaría lo publicado sin dejar rastro en la historia, y
nadie podría decir, mirando el código de una fecha, qué había visible ese día.

## 2. Encender una capacidad

1. Comprobar que su pantalla existe. Si la ruta cae en `LabPlaceholderPage`, encender la
   capacidad solo publica un «todavía no está construido».
2. Añadir el nombre a la lista del workflow, respetando mayúsculas: la comparación es exacta.
3. Si la capacidad pertenece a una fase posterior a la última construida, subir también
   `FASE_MAXIMA_CONSTRUIDA` en
   [`deployFlags.test.ts`](../../src/lib/features/deployFlags.test.ts). Las dos cosas cambian
   en el mismo diff a propósito: es el momento de mirar si de verdad hay algo que enseñar.
4. Abrir PR. CI comprueba la lista; el despliegue solo ocurre después de que CI pase sobre
   `main`.

## 3. Apagar una capacidad

Quitar su nombre de la lista y fusionar. El siguiente despliegue la oculta. No hace falta
revertir código: para eso existe la bandera.

Para apagar **todo** el Laboratorio de golpe, basta con quitar `labShell`: el resto de la
sección cuelga de ella en [`App.tsx`](../../src/App.tsx).

## 4. Lo que estas banderas no son

**No son autorización.** El valor acaba en el bundle público, así que cualquiera puede
activar una capacidad en su propio navegador editando el JavaScript servido. Lo que protege
datos privados es la RLS de Supabase y la verificación dentro de la Edge Function, nunca esta
lista. Ver [`ADR-001`](../adr/ADR-001-lab-architecture.md).

**No son un secreto.** Añadirla al `env:` del build no expone nada que no estuviera ya
destinado a viajar al cliente.

## 5. El fallo que motivó el guardián

Durante las fases 1 a 4 el workflow definía `DEPLOY_TARGET` y las variables de Supabase, pero
**no `VITE_LAB_FLAGS`**. El sitio publicado sirvió durante semanas un bundle con todo el
Laboratorio invisible, y nada falló ni avisó: `parseLabFlags` tiene un default seguro, de modo
que la ausencia de la variable es indistinguible de «no quiero publicar nada».

Un default seguro protege de publicar de más, no de publicar de menos. La segunda mitad la
cubre ahora [`deployFlags.test.ts`](../../src/lib/features/deployFlags.test.ts), que lee el
workflow en CI y falla si la variable no está, si está vacía, si un nombre es una errata, si
falta `labShell` o si se publica una fase sin construir.

## 6. Comprobar qué se publicó de verdad

La lista viaja al bundle, así que se puede leer desde el sitio en producción:

```bash
curl -s https://ignacior04.github.io/RiskCalculator/ | grep -o 'assets/index-[^"]*\.js'
```

y buscar los nombres de capacidad en ese fichero. Más rápido: abrir el sitio y ver si la
sección **Laboratorio** aparece en la navegación — si está, `labShell` viajó.
