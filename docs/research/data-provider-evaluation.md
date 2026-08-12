# Evaluación de proveedores de clasificación y holdings

> `LAB-401`. Qué datos pueden **obtenerse, mostrarse, cachearse y redistribuirse**
> para el look-through y la clasificación sectorial. Fecha de la evaluación:
> 2026-08-12. La decisión que sale de aquí está en
> [`ADR-004`](../adr/ADR-004-classification-holdings-provider.md).

## 1. La pregunta que bloqueaba la fase

El motor de exposición real necesita saber **qué lleva dentro cada fondo**. La
idea de partida era la obvia: los emisores publican esa lista, así que
descargarla periódicamente y guardar una instantánea en el repositorio.

Esa idea no es viable, y el motivo no es técnico.

## 2. Licencia: lo que impide la vía obvia

| Emisor | ¿Publica holdings? | ¿Permite redistribuirlos? |
|---|---|---|
| iShares (BlackRock) | Sí, CSV diario por fondo | **No.** Los términos del sitio prohíben la redistribución y el uso comercial de los datos descargados |
| Vanguard | Sí, en la ficha de cada fondo | **No.** Mismo tipo de restricción |
| Amundi / Lyxor | Sí, PDF y XLS mensual | Sin permiso explícito de redistribución |
| SPDR (State Street) | Sí, XLS diario | Sin permiso explícito de redistribución |

Publicar un dato **no** es licenciarlo. Que un CSV sea descargable sin registro
no autoriza a incorporarlo a otro producto y servirlo a terceros, que es
exactamente lo que haría una instantánea versionada en este repositorio y
desplegada en GitHub Pages.

**Conclusión:** el snapshot en el repositorio queda descartado. No por
prudencia: por incumplimiento.

## 3. APIs: lo que no cubre el plan gratuito

| Proveedor | Plan gratuito | ¿Incluye holdings de ETF? | Notas |
|---|---|---|---|
| Twelve Data | 800 req/día, 8/min | **No.** `etfs/world/composition` es de pago | El usuario tiene cuenta. Sirve para precios y series, que ya se usan |
| Financial Modeling Prep | 250 req/día | **No.** `etf-holder` es de pago | |
| Finnhub | 60 req/min | **No.** El endpoint de ETF profile/holdings es premium | |
| Alpha Vantage | 25 req/día | No tiene endpoint de holdings | El límite lo hace inviable igualmente |
| EOD Historical Data | Sin plan gratuito real | Sí, de pago | Descartado por coste |

Ninguna capa gratuita incluye composición de fondos. Es el dato por el que
cobran, precisamente porque los emisores no lo licencian de balde.

## 4. SEC EDGAR: público, pero incompleto para esta cartera

Los formularios **N-PORT** de la SEC son **dominio público**, sin restricción de
redistribución, accesibles por API sin clave. Es la única fuente legalmente
limpia que se ha encontrado.

Su límite es de cobertura, no de licencia:

- cubre fondos **registrados en Estados Unidos**;
- **no** cubre los UCITS europeos, que es lo que compra un inversor particular
  en España — IWDA, VWCE, SXR8 y compañía son irlandeses o luxemburgueses;
- se publica con retardo trimestral, con hasta 60 días de demora.

Para esta aplicación, eso significa que EDGAR resolvería una minoría de las
carteras reales de su público objetivo.

## 5. Identidad de instrumentos

Problema aparte y previo: un ticker no identifica una empresa. `SAN` es
Santander en Madrid y Sandstorm Gold en Toronto. Los proveedores resuelven esto
con un identificador propio o con ISIN/FIGI.

- **ISIN**: la asignación la hacen las agencias nacionales de numeración; el
  listado consolidado **no es gratuito**.
- **OpenFIGI** (Bloomberg): API gratuita, sin clave para volúmenes bajos, y
  **permite redistribuir** el identificador FIGI. Es la única vía abierta a un
  catálogo canónico.

No se ha adoptado todavía porque exige red y una capa de servicio, y porque
`LAB-402` puede resolver el caso real —la cartera del propio usuario— sin salir
de la aplicación: el ISIN y el mercado que el usuario ya introduce bastan para
distinguir homónimos dentro de su cartera.

## 6. Alcance reducido, explícito

De la matriz anterior sale lo que la aplicación **puede** hacer hoy:

| Necesidad | Vía elegida | Estado |
|---|---|---|
| Composición de fondos | **Entrada manual del usuario** | Implementado (`LAB-404b`) |
| Composición automática de fondos EE. UU. | SEC EDGAR (N-PORT) | Diseñado, no implementado (`LAB-406`) |
| Composición de UCITS europeos | Ninguna vía legal gratuita | **Pospuesto sin fecha** |
| Identidad canónica dentro de la cartera | ISIN + mercado del propio activo | Implementado (`LAB-402`) |
| Catálogo canónico global | OpenFIGI | **Pospuesto** |
| Clasificación sectorial | Campo `sector` que ya existe en el activo | Sin proveedor externo |

Un usuario puede consultar las posiciones de sus propios fondos en la web del
emisor y anotarlas: eso es uso personal y no es redistribución. Con las diez o
quince mayores ya se ve el solapamiento, que es la pregunta que la pantalla
existe para contestar.

## 7. Consecuencia de diseño

Todo lo anterior justifica que el motor sea **agnóstico de proveedor**:
`lookThrough` recibe composiciones y no sabe de dónde vienen. Cambiar de fuente
—añadir EDGAR, contratar un proveedor con licencia— no toca una línea del
cálculo. Es la única forma de construir sobre una decisión de datos que hoy no
se puede cerrar.
