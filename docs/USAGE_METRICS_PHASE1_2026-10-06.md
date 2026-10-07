# Métricas de uso — fase1 — 06/10/2026

## Alcance y estado

Petición humana transmitida por Pausa · Marketing: implementar y publicar métricas
reales persistentes y un informe privado. La cola de voz propia, su aprobación y
bloqueo de acceso se conservan. Esta fase desarrolla **código local**, no restaura
servicios, recupera bases borradas, despliega ni recibe eventos reales.

Base reutilizada: `pausa-mia-comentarios-20260924`, rama
`codex/voice-memory-20261005`, HEAD previo `2f9760a`. Su árbol publicado corresponde
a `07202c7`. No reset/rebase del original divergente ni cambios de otros operadores.
Codex implementa: la vigencia paga de Cursor no está acreditada y su registro
canónico autoriza este fallback; no se renueva ni despacha Cursor/Dropbot.

## Implementado en esta fase

- Reutiliza las tablas y nueve eventos existentes, con permiso opcional por
  práctica, token efímero y vocabulario cerrado. Sin nuevos identificadores,
  datos de cuenta, respuestas, diarios, guiones, audio, IP o cabeceras guardadas.
- Informe privado por la consola del servidor, sin endpoint ni clave de
  administración en frontend. Lectura SQLite read-only, transacción consistente,
  sin creación/migración/purga desde el informe ni fallback silencioso a JSON.
  JSON queda como motor explícito de desarrollo; producción exige SQLite.
- Base ausente/corrupta/incompleta: salida `dataStatus: unavailable`, `counts: null`
  y código de salida1. Nunca se convierte en cero usuarios ni imprime un error
  crudo/ruta/datos. Una base válida vacía se distingue con
  `available_no_consented_events`.
- Conteos de eventos por día ART y fuente permitida. Conserva `counts` UTC para
  consumidores antiguos, sin mezclar el contador histórico.
- Conversiones por el mismo recorrido y cohorte de entrada ART, con etapas en
  orden. No divide eventos de personas/recorridos/días diferentes. Ratios sin
  denominador son `null`, no un cero inventado.
- Recorridos todavía activos separados de vencidos con error. Los vencidos
  incompletos sin error registrado muestran la última etapa observada; esto no
  demuestra intención de abandono. Evidencia posterior a etapas ausentes o
  fuera de orden se clasifica `partialCoverageRuns`, no abandono: se puede dar
  consentimiento después del cuestionario. Los conteos de callbacks permanecen
  separados de la conversión del recorrido completo.
- Exclusión de QA, revocados, duplicados, fuera de30d, fechas inválidas/futuras y
  vocabulario desconocido. Marcadores QA SQLite distintos de0/1 son inválidos,
  no tráfico real. No reconstruye registros perdidos desde Markdown.
- DNT/GPC impiden IDs/envíos de este embudo y POST del servidor. Revocación,
  estados de borrado y reintentos siguen disponibles aunque cambie la preferencia.
  No elimina ni reescribe el contador legado; la UI actual no lo usa.

## Uso privado, cuando exista el servidor

`node /app/server/funnelReport.mjs`, dentro de la consola/SSH autenticada de la
máquina existente. `ACCOUNT_DB_PATH` apunta a la base real. No abrir un endpoint
público para facilitar su lectura ni devolver hashes/token/filas individuales.
El comando sólo lee; el borrado por retención sigue en el inicio/uso de la API.

La ventana solicitada es30d; el período observado informa primera/última recepción
presente. No acredita uptime completo, todas las visitas ni ausencia de pérdida
histórica. Audio terminado significa callbacks de reproducción, no escucha humana
verificada. Origen significa `pm_source` permitido, no atribución de Meta/Google.

## Pendientes del entregable completo

La cobertura declara explícitamente **no instrumentados**, no ceros: nuevos y
recurrentes, cuestionario completado, latencia de generación, audio preparado y
latencia, pausas, segundos realmente reproducidos, fin explícito de sesión,
valoración numérica voluntaria, retorno y campaña. Tampoco se agregaron logs
técnicos nuevos ni un tablero web privado en esta fase.

El cliente continúa local como invitado si la API no responde. Para completar:
extender contrato y consentimiento específicos sólo con campos mínimos, pruebas
de lifecycle y reproducción, almacenamiento idempotente y cobertura explícita;
restaurar servicio/persistencia y respaldo fuera del volumen con prevención de
borrado. Respetar revocación y retención también en respaldos. Después verificar
recorrido público end-to-end con QA excluido y lectura privada. No anunciar
recepción real por una prueba local o un deploy.

Acceso: último contador registrado1Password06/10,20:18ART,1000/1000 y0 disponibles.
No se repite, extraen secretos por otra vía, crean cuentas/servicios pagos ni se
contrata un plan. No hay presupuesto nuevo de hosting: los ARS20000 son pauta,
no hosting. Costo/provisión y disponibilidad de claves pendientes de verificar
por sus flujos canónicos; no se promete monto ni reinicio exacto.

Histórico y cobertura externa: `app-meditacion-personalizada/docs/GROWTH_DASHBOARD.md`.
Fly informó borrado de API y volúmenes02/10, sin recuperación disponible del
proveedor. Este desarrollo no repite la investigación ni recupera esos datos.

## Verificación

Pruebas sintéticas locales: ART cruzando medianoche, orden por recorrido,
consentimiento tardío, QA/revocación/duplicados, estado activo/error/vencido,
persistencia reabierta, corrupción/esquema incompleto/base ausente, no mutación
del archivo leído, diagnóstico cerrado y exclusión DNT/GPC con borrado disponible.
Resultado final de pruebas/lint/build y auditoría se registra al cerrar en el
MD canónico de Desarrollo. No generación de voz, escucha, QA físico ni cambios
de producción por estas pruebas.
