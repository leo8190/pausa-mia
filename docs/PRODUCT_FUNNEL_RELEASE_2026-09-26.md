# Métricas voluntarias: entrega y límites

Fecha de implementación: 26/09/2026. Estado de publicación: pendiente de
verificación remota en este documento; no inferir producción por un commit.

## Qué se mide

Cada permiso explícito abre un recorrido nuevo. La casilla empieza desmarcada
y no condiciona la meditación. Se registra como máximo una vez cada nombre:
`entry`, `questionnaire_started`, `script_generated`, `audio_started`,
`audio_finished`, `closing_reached`, `feedback_given`, `script_error`,
`audio_error`. `entry` significa **permiso concedido**, no una visita a la web.
`audio_finished` exige callbacks de inicio y fin de todos los segmentos en
orden; no prueba escucha humana. Los errores son genéricos, sin mensaje ni causa.
Los valores de feedback, preferencias y estados no viajan en la métrica.

El navegador sólo envía el token aleatorio del recorrido, nombre de evento y,
al abrirlo, fuente de una lista cerrada (`instagram`, `tiktok`, `okara`,
`newsletter`, `shared` o `unattributed`) y marca de prueba opcional `qa`.
No envía diario, respuestas, guion, audio, nombre, cuenta, cookies, URL,
referrer ni parámetros libres. La API requiere el origen permitido, rechaza
campos adicionales y limita cuerpos y altas por minuto. CORS y ese límite no
demuestran que cada recorrido sea una persona ni detienen a un actor que falsifique
solicitudes; los números son indicativos para producto, no auditados contra fraude.

En la base de cuentas ya existente se agregan **dos tablas separadas** de las
cuentas y del contador viejo: `funnel_runs` y `funnel_events`. Guarda hash SHA-256
con pepper del token efímero, fuente, bandera QA, fechas y nombres cerrados. No
guarda token crudo; deduplica por token+evento. Un recorrido acepta eventos por
24 horas. El informe suma por día UTC, fuente y evento, excluyendo QA y
revocados. Sólo se ejecuta por consola privada en la máquina del servidor:

```bash
fly ssh console -a pausa-mia-api -C 'node /app/server/funnelReport.mjs'
```

No hay reporte HTTP público. Los totales del endpoint anterior `/api/visitors/count`
son históricos, de otra definición, mezclan pruebas propias sin identificar y
no deben sumarse ni compararse con estos. Los clientes viejos aún pueden mandar
al endpoint anterior. El nuevo cliente deja de hacerlo y no muestra esos números
al usuario final.

## Consentimiento, revocación y retención

Retirar el permiso o borrar sesión envía una orden de eliminación de todos los
recorridos creados en la pestaña mientras siga abierta. El servidor borra sus
eventos y deja un marcador temporal para rechazar envíos tardíos. La interfaz
espera la respuesta: si falla, informa y ofrece reintento. Si la pestaña se
cierra sin conexión antes de confirmar, no hay token guardado para reintentar:
es una limitación deliberada de no persistir identificadores en el navegador.
Un recorrido de una pestaña cerrada no se puede revocar por este control.

La API purga filas activas con más de 30 días al iniciar y en cada escritura o
lectura del informe; con la máquina detenida, la purga ocurre al despertar. No
se verificó la retención de backups del proveedor ni de logs de conexión; HTTP
necesariamente expone metadatos de red al host. No prometer borrado completo de
copias externas en 30 días ni ausencia de IP en infraestructura. La base vieja
de visitantes no se borró ni migró, porque eso sería otra decisión y alcance.

## Despliegue y comprobación

Orden: desplegar primero la API con las nuevas tablas aditivas, comprobar salud
y un recorrido sintético `qa:true`; después publicar el cliente en Pages y
verificar el artefacto. No reconfigurar volumen, cuentas, secretos ni servicio de
voz. En el reporte privado, el recorrido QA debe quedar excluido. En la API,
un evento duplicado debe conservar un solo conteo y la revocación debe dar 204;
un envío tardío del mismo token debe dar 410. La prueba nunca usa textos reales.

Pruebas locales: contrato de campos, origen, idempotencia, revocación, exclusión
QA, expiración, purga, migración aditiva de SQLite viejo, motor JSON, callbacks
de audio, permiso y transportes. Registrar aquí los resultados y la evidencia
remota antes de afirmar que la versión está publicada.
