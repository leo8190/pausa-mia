# Métricas — tiempo de generación — 06/10/2026

## Fase local, sin despliegue

Pedido de Leonardo: resolver pendientes y usar su clon aprobado de los cursos.
Desarrollo conserva voz/acceso en sus operadores ya activos, sin duplicarlos:
iPhone busca únicamente Fly con el permiso específico existente; Android integra
el clon Orca aprobado, no crea otro ni usa una voz distinta. Esta fase avanza el
pendiente independiente de métricas, sobre la base local `e856d63`.

Se extiende el embudo existente con `elapsedMs` opcional únicamente en
`script_generated` y `script_error`: entero entre0y300000. No admite strings,
campos extra, objetos libres, diario, guion, audio, mensajes de error, cuentas,
URL completa, IP, cookies o cabeceras almacenadas. El consentimiento visible
incluye explícitamente el tiempo que tarda en prepararse el guion.

El cliente mide con reloj monotónico desde generación hasta validación del guion,
tanto para el atajo local como para el proveedor asíncrono. No mide el tiempo
previo de completar el cuestionario ni promete latencia del servidor. Duraciones
inválidas/fuera de rango se omiten, no se recortan ni se convierten en0.
Captures/epochs, permiso, cancelación y borrado impiden eventos tardíos. DNT/GPC
y la opción de no compartir siguen vigentes; tampoco se crean IDs antes de aceptar.

Sólo se conserva el primer resultado por tipo de evento y recorrido consentido.
Un error y un éxito en el mismo recorrido son categorías distintas; no es un
conteo de todos los intentos ni de personas únicas. Falla sin red no bloquea la
meditación local. No retrocargar ni inventar tiempos para eventos históricos.

Orden de entrega: backend nuevo/migración primero, QA excluido y reporte privado
verificados; recién después habilitar `VITE_PRODUCT_FUNNEL_TIMING_ENABLED=true`
en el build público. Sin esa habilitación (default), el transporte conserva el
contrato anterior sin `elapsedMs`: no pierde eventos contra un colector antiguo
que rechaza campos extra. La preview de desarrollo permite la medición local.

Backend: campo nullable, migración de arranque compatible con la base anterior,
contrato cerrado y deduplicación original. El informe privado read-only admite
esquema anterior sin migrarlo y declara tiempo ausente, no cero. Para muestras
válidas presenta cantidad, mínimo/media/p50/p95/máximo en milisegundos, excluyendo
QA, revocados, fuera de retención y resultados duplicados. Percentiles nearest-rank.
Sin muestras, valores temporales `null`. Sin base legible, `unavailable/counts:null`.

## No logrado por esta fase

No publicación, restauración de API/volumen, claves leídas, síntesis nueva, costo,
instalación móvil o QA público end-to-end. No significa que el clon esté activo en
la web. No se crean goals, chats, planes, compras, recargas ni reservas paralelas
de acceso. La autorización anterior de buscar Fly no se transforma en permisos
ampliados, copia de otras bóvedas ni lectura de secretos por canales alternativos.

Quedan las demás métricas de la fase1: nuevos/recurrentes con permiso específico,
cuestionario completo, audio preparado/latencia, pausas/segundos efectivamente
reproducidos, fin de sesión, valoración voluntaria, retorno y campaña; logs
técnicos mínimos, tablero privado, respaldo externo/retención y prevención de
borrado. Despliegue con acceso/costo verificados; nunca se recuperan eventos desde
las cifras de `app-meditacion-personalizada/docs/GROWTH_DASHBOARD.md`.

La verificación final y continuidad se registran en `MOBILE_STORES_COORDINATION.md`.
Pruebas incluyen payload cerrado, consentimiento, deduplicación, cancelación,
tiempos inválidos/fuera de rango, éxito y error reales del hook con datos
sintéticos, persistencia/migración y reporte privado sin identidades.
