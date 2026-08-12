# ADR-004 — Proveedor de clasificaciones y holdings

- **Estado:** aceptada
- **Fecha:** 2026-08-12
- **Tarea:** `LAB-401`
- **Evidencia:** [`docs/research/data-provider-evaluation.md`](../research/data-provider-evaluation.md)

## Contexto

El look-through necesita saber qué lleva dentro cada fondo. La Fase 4 no podía
avanzar sin decidir de dónde salen esos datos, y la decisión resultó estar
gobernada por la licencia, no por la técnica.

## Decisión

**No se adopta ningún proveedor externo de holdings.** La composición de fondos
entra por tres vías, en este orden de preferencia:

1. **Entrada manual del usuario.** Única vía disponible hoy para UCITS europeos.
   El usuario consulta la web del emisor y anota lo que ve: es uso personal, no
   redistribución.
2. **SEC EDGAR (N-PORT)**, cuando se implemente `LAB-406`. Dominio público, sin
   clave, sin restricción de redistribución. Cubre solo fondos estadounidenses.
3. **Proveedor con licencia**, si algún día se contrata. El contrato mandaría
   sobre qué se puede cachear y mostrar.

**La identidad canónica se resuelve dentro de la cartera del usuario**, con el
ISIN y el mercado que el propio activo ya trae (`LAB-402`), sin catálogo global.

**La clasificación sectorial** se queda en el campo `sector` que ya existe en el
activo. No se adopta ninguna taxonomía externa.

## Motivos

- **iShares y Vanguard prohíben redistribuir sus holdings.** Publicar un dato no
  es licenciarlo. Una instantánea versionada en este repositorio y servida desde
  GitHub Pages sería redistribución, y sería un incumplimiento.
- **Ningún plan gratuito de API incluye holdings** (Twelve Data, FMP, Finnhub,
  Alpha Vantage). Es justo el dato por el que cobran.
- **EDGAR es limpio pero no cubre a los usuarios de esta aplicación**: los ETF
  que compra un particular en España son irlandeses o luxemburgueses.
- **El listado consolidado de ISIN no es gratuito.** OpenFIGI sí lo es y permite
  redistribuir el identificador, pero exige red y capa de servicio, y no hace
  falta para el caso real: distinguir homónimos **dentro de una cartera**.

## Consecuencias

**Aceptadas:**

- La cobertura de look-through depende de lo que el usuario se moleste en
  anotar. La pantalla lo declara: enseña la cobertura antes que las cifras.
- El solapamiento calculado es un **suelo**, no una medida exacta.
- Sin catálogo global, dos usuarios distintos pueden escribir el mismo valor de
  formas distintas. Irrelevante mientras los datos no se compartan.

**De diseño:**

- `lookThrough` es **agnóstico de proveedor**: recibe composiciones y no sabe de
  dónde vienen. Añadir EDGAR o un proveedor de pago no toca el cálculo.
- Si se contratara un proveedor, su clave sería un **secreto de servidor** en la
  Edge Function, nunca una variable `VITE_*`.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Instantánea mensual de holdings en el repositorio | Redistribución prohibida por iShares y Vanguard |
| Twelve Data u otra API gratuita | Holdings fuera del plan gratuito |
| Scraping de las webs de los emisores | Misma prohibición, y además frágil |
| Estimar la composición desde el índice que replica el fondo | Sería inventar datos. Prohibido por `CLAUDE.md` §3 |
| Repartir el valor no cubierto entre lo conocido | Inflaría las exposiciones conocidas fingiendo precisión donde menos hay |

## Revisión

Reabrir esta decisión si: aparece una fuente con licencia de redistribución para
UCITS, se contrata un proveedor de pago, o EDGAR pasa a cubrir fondos europeos.
