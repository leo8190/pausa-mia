# Métricas voluntarias: entrega y límites

Fecha de implementación: 26/09/2026. Estado comprobado el 26/09 a las 23:07 ART:
**API publicada y verificada; publicación del cliente en curso**.
No inferir producción del cliente por el despliegue del servidor.

## Entrega del servidor — 26/09/2026, 23:07 ART

Resuelto el bloqueo: el constructor existente `fly-builder-golden-leaf-3783`
ejecutaba BuildKit (`:1234`), mientras los intentos anteriores sin `--buildkit`
buscaban Docker (`:2375`). La vía correcta reutilizó exactamente ese constructor
mediante `--buildkit --buildkit-addr fly-builder-golden-leaf-3783.flycast:1234`
y `--depot=false`; sin crear servicios ni contratar un plan. La conclusión previa
de necesitar Colima o un constructor nuevo queda superada. El hosting existente
mantiene sus costos; no se afirma gratuidad.

Publicada la API desde `a6739599beea3949c3ba309c759bee53409eeeed`, actualizando
sólo la máquina `6837939a09e398`. Imagen
`registry.fly.io/pausa-mia-api:deployment-01M3G9SNEAMSJ5T7QRD9GTR2CY`, digest
`sha256:f812ceb755ab2cdf9bb16033f7f064893ec666c609d34bb6d93592a4e4332c3a`.
Se conservan volumen, secretos, CPU/memoria, región y autostop. Voz sin cambios.

Verificación pública y privada con un token sintético `qa:true`:

- Salud HTTP200; dos envíos de `entry` y uno de `audio_started`, HTTP204.
- SQLite confirma exactamente un evento de cada tipo: deduplicación real.
- Informe privado `counts: []`: la prueba queda fuera de las cifras de producto.
- Revocación HTTP204; evento tardío del mismo token HTTP410 `FUNNEL_RUN_GONE`.
- Respuestas de métricas con `Cache-Control: no-store`; ningún dato personal usado.

`origin/main` verificado aún en `e0d3ec56b0b6d765ba8b764ca0737bdeac540201`
antes de integrar. Build con las mismas variables de Pages: `index-gzhA623Z.js`,
SHA256 `d96acfe391ba2d080149550b2ebad512056fd07e2eaabde1ef465c378e3129f7`.
Resta comprobar la ejecución de Pages y el artefacto público antes de declarar
terminada la entrega de la web.

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

### Historial de preparación y bloqueos ya superados

Resultado local: 433/433 pruebas correctas en 47 archivos, lint, formato,
compilación de producción y revisión de diff correctos. Dos intentos de deploy
de la API con el constructor remoto Fly quedaron esperando a su daemon; se
cancelaron sin llegar a construir ni reemplazar la máquina. Un intento usando
conexión HTTPS en vez de WireGuard quedó esperando la compatibilidad del
constructor y también se canceló. No hay Docker local; GitHub no tiene un
secreto Fly configurado para desplegar por Actions. `fly doctor` pasó sus
chequeos, pero eso no resolvió el constructor. No repetir el mismo despliegue
sin cambio comprobable en el constructor/conectividad o una vía autorizada.

Tras los intentos, la API pública respondió saludable y conservó la imagen
`sha256:b7bfb0a3408f0b139a0ff3723cfcff1423aa295eed9544e53571a2d0725df660`;
`origin/main` siguió en `e0d3ec56b0b6d765ba8b764ca0737bdeac540201`.
**No subir la rama a main ni activar Pages hasta verificar primero el backend.**

Continuación manual 26/09, 22:52 ART: `origin/main` y la imagen Fly siguen
iguales. Se investigó una alternativa oficial de build local: Fly documenta
[`--local-only`](https://www.fly.io/docs/launch/deploy/) con un daemon Docker,
y [Colima](https://colima.run/docs/installation/) documenta instalar Colima y
el cliente Docker por Homebrew. Ambos se instalaron sin suscripción ni compra;
Homebrew añadió Lima. Se intentó una VM aislada de Colima con 2 CPU, 3 GiB de
memoria y perfil exclusivo `pausa-mia-deploy`, sin servicio de inicio automático
ni cambiar el contexto Docker principal. Su arranque quedó esperando la sesión
SSH del usuario; el log mostró además `sudo: unable to resolve host
lima-colima-pausa-mia-deploy`, sin demostrar que ésa fuera la causa. Se canceló,
se forzó la detención de esa VM y se
eliminó el perfil temporal; `colima list` confirmó que no queda ninguna VM activa.
Los programas Homebrew quedan instalados, inactivos. No se construyó imagen ni
se hizo deploy. La API pública conserva el digest anterior.
Hay [reportes en el proyecto Colima](https://github.com/abiosoft/colima/issues/1307)
del mismo paso de inicio atascado; no prueban la causa en esta Mac.

Una tercera vía de Fly (`--buildkit`) existe, pero el costo vigente para esta
cuenta no se pudo verificar en la [tabla oficial](https://fly.io/docs/about/pricing/);
por el límite de no generar
cargos adicionales no se usó. Siguiente paso seguro: diagnosticar la inicialización
de Colima y demostrar `docker info` local antes de desplegar, o esperar
que Fly confirme un constructor remoto operativo sin costo extra. No repetir
el inicio colgado ni el deploy anterior sin cambio técnico comprobable.
