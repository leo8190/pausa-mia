# Arquitectura de cuentas y conectores

Estado: **IMPLEMENTACIÓN PARCIAL (fase local server-side)**.

Fecha: 19 de agosto de 2026.

Este archivo no autoriza OAuth real, claves de proveedor, una base externa de
producción, pagos ni despliegue. Desde 2026-08-19 existe una **fase local** en
`server/` con persistencia de cuenta/sesión y contrato de conectores aún
desconfigurados. El prototipo sigue en modo demostración local, sin enviar datos a
terceros por conectores.

Los alcances de producto y el texto de consentimiento por fuente están en
`docs/DATA_CONNECTOR_CONSENT_PLAN.md`. Este documento fija el modelo de datos, el
modo invitado, dónde vivirían los tokens y las condiciones para salir de la fase
de diseño.

## Qué se puede hacer con este documento

| Acción | Ahora | Cuando Leonardo autorice implementación |
| ------ | ----- | --------------------------------------- |
| Completar una pausa sin cuenta | Ya existe | Sigue siendo el camino por defecto |
| Crear `users` / OAuth / DB | No | Sólo tras los criterios de salida |
| Guardar tokens en el navegador | Nunca | Nunca |
| Conectar Calendar / Drive / redes | UI deshabilitada | Un proveedor por vez, opt-in |

## Principios

1. La sesión funciona completa **sin cuenta**. Conectar un servicio es opt-in por
   fuente, nunca un requisito de entrada.
2. La cuenta es opcional: un `user` puede existir sin ningún `linked_account`.
3. Tokens de proveedor: sólo backend, cifrados en reposo, revocables. Nunca
   `localStorage`, cookies de frontend, IndexedDB, analítica ni el bundle del
   cliente.
4. Un consentimiento no se reutiliza para otra fuente ni para otra finalidad.
5. Calendar y Drive primero; redes sociales después, una por una. Gmail queda
   excluido.
6. Toda lectura o escritura futura filtra por `user_id`. Un usuario no ve ni
   gasta cuota de otro.

## Modo invitado (sin cuenta)

Es el único modo del prototipo actual y debe seguir existiendo.

Qué hace la persona hoy, sin registrarse:

- Check-in, diario u archivo local, revisión del guion y audio en el dispositivo.
- Omitir cualquier campo sensible.
- Borrar la sesión (limpia estado en memoria y preferencias locales).

Qué **no** ocurre en invitado:

- No hay fila en `users`.
- No hay `linked_accounts` ni refresh tokens.
- El diario y el estado emocional no se persisten por defecto.
- No hay OAuth, sync ni llamadas a Google / redes.

Si más adelante existe backend: la sesión de invitado vive en memoria del
cliente (como ahora). Una fila `sessions` con `user_id` nulo es opcional y
efímera; se borra al cerrar o al pulsar “Borrar esta sesión”. No se crea cuenta
en silencio al generar audio.

## Cuenta opcional

Crear cuenta es un paso **posterior**, explícito y separado del consentimiento
de sesión.

Reglas:

1. Generar y reproducir una pausa no exige registro.
2. El alta no pide correo por defecto. Un email, si existiera, sería sólo para
   recuperar la cuenta y requiere un consentimiento aparte (`purpose =
   account_recovery`).
3. No se copia el nombre ni el avatar de Google a `users` sin que la persona lo
   elija.
4. Al crear cuenta a mitad de una sesión, las fuentes locales de **esa sesión**
   pueden copiarse a `context_items` sólo si la persona confirma. Nada se
   sincroniza en silencio.
5. Preferencias ya guardadas en `localStorage` (variante, duración, estilo) se
   copian a `users` sólo con confirmación.
6. Desconectar un proveedor no borra la cuenta ni las sesiones pasadas.
7. Borrar la cuenta no impide volver a usar el producto como invitado.

La cuenta no habilita conectores por sí sola. Cada proveedor se activa después,
con su propio consentimiento.

## Modelo de datos (futuro)

Esquema lógico, no un motor concreto. Campos mínimos. Cualquier implementación
posterior debe poder migrar estas tablas sin cambiar el contrato de la UI.

Tipos sugeridos: UUID opacos para todos los `id`. No usar el correo ni el
subject de Google como clave primaria.

### `users`

Identidad de producto, no del proveedor. Los invitados **no** tienen fila.

| Campo          | Tipo mínimo                         | Uso |
| -------------- | ----------------------------------- | --- |
| `id`           | UUID                                | Identificador interno opaco |
| `created_at`   | timestamptz                         | Alta |
| `display_name` | texto nullable                      | Nombre elegido; no se copia de Google |
| `locale`       | `es-AR` \| `es-neutro`              | Variante de voz / copy |
| `status`       | `active` \| `deleted`               | Baja lógica hasta el borrado duro |

Sin `password_hash` en este diseño: si hay autenticación futura, se define en un
documento aparte. Sin `email` en la tabla base.

### `linked_accounts`

Una fila por persona × proveedor × cuenta externa. No guarda el contenido de
calendario, Drive ni redes.

| Campo                  | Tipo mínimo                                      | Uso |
| ---------------------- | ------------------------------------------------ | --- |
| `id`                   | UUID                                             | Identificador |
| `user_id`              | UUID → `users.id`                                | Dueña; obligatorio |
| `provider`             | enum                                             | `google_calendar`, `google_drive`; redes después |
| `provider_account_ref` | texto opaco                                      | Subject/id del proveedor, no el correo mostrado |
| `scopes`               | texto[]                                          | Lista exacta concedida, no un “acceso Google” |
| `status`               | `active` \| `revoked` \| `expired` \| `error`    | Estado visible al cliente |
| `token_ciphertext`     | bytes                                            | Refresh (y access si hace falta) cifrados; **sólo servidor** |
| `token_kid`            | texto                                            | Clave de cifrado usada |
| `connected_at`         | timestamptz                                      | Primera vinculación |
| `revoked_at`           | timestamptz nullable                             | Nulo mientras esté activa |

Única clave `(user_id, provider, provider_account_ref)` entre filas `active`.

El navegador **nunca** recibe `token_ciphertext`, `token_kid` ni
`provider_account_ref` crudo. El cliente sólo ve: desconectada / conectada /
error / revocada, más una etiqueta elegida por la persona (p. ej. “Agenda
laboral”).

### `consents`

Cada permiso es una fila, no un bit genérico. Sin casillas premarcadas.

| Campo               | Tipo mínimo                         | Uso |
| ------------------- | ----------------------------------- | --- |
| `id`                | UUID                                | Identificador |
| `user_id`           | UUID nullable                       | Nulo en consentimientos de sesión invitada (sólo memoria) |
| `linked_account_id` | UUID nullable → `linked_accounts`   | Nulo para consentimiento local de sesión |
| `provider`          | enum nullable                       | Fuente; nulo si es sólo sesión local |
| `purpose`           | texto                               | Ver lista cerrada abajo |
| `scopes`            | texto[]                             | Vacío si no hay OAuth |
| `granted_at`        | timestamptz                         | Marca temporal |
| `revoked_at`        | timestamptz nullable                | Nulo si sigue vigente |
| `expires_at`        | timestamptz nullable                | “Sólo esta sesión” vence al cerrar |
| `evidence`          | texto                               | Copy exacto que la persona vio al aceptar |

`purpose` cerrado:

- `session_script` — usar respuestas actuales para esta pausa
- `calendar_freebusy` — densidad de agenda, sin títulos
- `drive_file` — un archivo elegido con Picker
- `retain_copy` — recordar el recorte para otro día
- `account_recovery` — email de recuperación, si alguna vez se pide

Cinco decisiones por fuente (conectar, elegir, revisar, usar, revocar): ver
`DATA_CONNECTOR_CONSENT_PLAN.md`. “Recordar para otro día” es siempre un
`purpose` distinto de “usar en esta sesión”.

### `context_items`

Fragmentos que pueden entrar al guion. Sustituyen el estado efímero de
`contextSources` cuando hay cuenta **y** la persona pide conservarlos.

| Campo         | Tipo mínimo                                      | Uso |
| ------------- | ------------------------------------------------ | --- |
| `id`          | UUID                                             | Identificador |
| `user_id`     | UUID → `users.id`                                | Dueña; obligatorio si la fila existe |
| `session_id`  | UUID nullable → `sessions`                       | Origen; nulo si se guardó a pedido |
| `source_type` | enum                                             | `journal`, `local_file`, `calendar`, `drive`, `social` |
| `label`       | texto                                            | Etiqueta visible |
| `content`     | texto                                            | Recorte que la persona revisó y seleccionó |
| `selected`    | boolean                                          | Si entra o puede entrar a un guion |
| `origin`      | `typed` \| `local_file` \| `connector`           | Procedencia |
| `discard_at`  | timestamptz nullable                             | Borrado programado si no hubo `retain_copy` |

No se guardan JSON de Takeout, feeds enteros ni archivos binarios: sólo el
recorte seleccionado tras la vista previa. El diario y la emoción no se copian
aquí sin `retain_copy`.

### `sessions`

Una pausa concreta. Invitado: `user_id` nulo (memoria o fila efímera). Con
cuenta: `user_id` obligatorio.

| Campo           | Tipo mínimo                         | Uso |
| --------------- | ----------------------------------- | --- |
| `id`            | UUID                                | Identificador |
| `user_id`       | UUID nullable → `users.id`          | Nulo en invitado |
| `created_at`    | timestamptz                         | Inicio |
| `deleted_at`    | timestamptz nullable                | Borrado de sesión |
| `check_in`      | jsonb mínimo                        | Campos no íntimos que la persona no excluyó |
| `script_engine` | `local` \| `ai`                     | Motor usado |
| `voice_variant` | `es-AR` \| `es-neutro`              | Voz |
| `safety_stop`   | boolean                             | Se detuvo por el detector de peligro |

El diario y el estado emocional **no** van en `check_in`. Si se conservan, van a
`context_items` con consentimiento de conservación.

## Tokens OAuth: sólo backend, nunca el navegador

Prohibido en cliente, ahora y después:

- `localStorage`, `sessionStorage`, cookies legibles por JS, IndexedDB, Service
  Worker cache y el estado de React.
- Query strings, logs de frontend y analítica.
- Variables `VITE_*` con client secret, refresh token o access token.

Flujo futuro (no implementar ahora):

1. El navegador pide “conectar Calendar” al **propio backend**. El backend arma
   el `state` anti-CSRF y redirige al proveedor.
2. El callback llega al backend. El backend intercambia el código, cifra el
   refresh token con una clave de servidor (`token_kid`) y guarda sólo el
   ciphertext en `linked_accounts`.
3. El access token vive en memoria de proceso o en caché cifrada de corta vida.
   No se persiste en claro.
4. El cliente pide “datos preparados para esta sesión”. El servidor llama al
   proveedor, recorta al mínimo y devuelve texto ya revisable. Nunca reenvía el
   token.
5. Al refrescar, se reescribe `token_ciphertext`. Al revocar, se borra el
   ciphertext, se llama al endpoint de revocación del proveedor si existe y
   `status` pasa a `revoked`.

El prototipo no crea client id, secret, consent screen ni proyecto en Google
Cloud. Aunque existan `VITE_OAUTH_CONNECTOR_ENABLED` o `VITE_OAUTH_CLIENT_ID`,
`onlineConnector` permanece inactivo a propósito.

## Orden de integraciones

Alineado al plan de consentimiento. No hay conector genérico “todas tus redes”.

| Orden | Proveedor | `linked_accounts.provider` | Cuándo |
| ----- | --------- | -------------------------- | ------ |
| 1 | Google Calendar | `google_calendar` | Primera conexión cobrable, si se autoriza |
| 2 | Google Drive (un archivo) | `google_drive` | Segunda, independiente |
| 3+ | Redes, una por una | p. ej. `spotify`, `youtube` | Después de valor demostrado y al menos un pago real |
| — | Gmail | — | Excluido de forma permanente en este diseño |
| — | Perfil Google (`openid profile`) | no es un conector de contenido | Sólo si hace falta identidad de cuenta, no para personalizar el guion |

Hasta que exista backend autorizado, Calendar / Drive / redes siguen siendo
importación local (JSON, CSV o texto), como en el prototipo.

Interfaz común (contrato futuro, no código):

- `connect(user, scopes)` → `linked_accounts` + `consents`
- `fetchPreview(account, query)` → candidatos a `context_items`, sin persistir
- `revoke(account)` → invalida token, marca consentimientos, borra derivados

## Consentimiento por proveedor y scopes mínimos

Autorización incremental: se pide el permiso cuando la persona activa **esa**
función, no un paquete “Google”.

### Google Calendar (primero)

- Scope: `https://www.googleapis.com/auth/calendar.freebusy`
- Uso: densidad de bloques y cercanía del próximo hueco, sin leer títulos,
  descripciones, invitados ni ubicaciones.
- Copy de ejemplo: “Hoy tuviste cuatro bloques seguidos y quedan dos”.
- `calendar.events.readonly` no se pide en el diseño inicial. Si alguna vez se
  evalúa, es un consentimiento nuevo.

### Google Drive (segundo)

- Scope: `https://www.googleapis.com/auth/drive.file`
- Uso: Google Picker, un archivo concreto. No `drive.readonly` ni el Drive
  entero.
- Antes de usarlo: mostrar archivo, fragmentos y casillas de inclusión.

### Redes (después)

Misma tabla y mismo ciclo. Candidatos documentados en el plan de consentimiento
(`user-top-read` / `user-read-recently-played` en Spotify;
`youtube.readonly` en YouTube). Instagram, Facebook y LinkedIn no entran en la
primera versión cobrable: sólo pegar o importar un fragmento elegido.

Cada alta de proveedor es una migración de catálogo (`provider` enum), no un
rediseño de tablas.

## Revocación

Desde la aplicación, por proveedor, sin pasar por un admin:

1. Invalidar el token en el proveedor (endpoint de revocación si existe).
2. Borrar `token_ciphertext` y `token_kid`; `status = revoked`, `revoked_at`
   ahora.
3. Cerrar `consents` de esa `linked_account_id` (`revoked_at` ahora).
4. Borrar `context_items` con `origin = connector` derivados de esa cuenta.
5. No usar esos fragmentos en sesiones nuevas. Las sesiones ya generadas
   conservan el guion que la persona revisó, salvo que pida borrar la sesión.
6. La cuenta de producto (`users`) permanece salvo que la persona pida borrarla.

Revocar Calendar no revoca Drive. Revocar Drive no borra el diario tipeado.

Borrar la sesión de invitado no usa estas tablas: limpia estado local y cancela
audio, como hoy.

## Borrado y retención

Default: **no conservar**. Tiempos numéricos exactos se fijan al implementar,
no ahora.

| Dato | Invitado | Con cuenta, sin `retain_copy` | Con `retain_copy` |
| ---- | -------- | ----------------------------- | ----------------- |
| Check-in no íntimo | Memoria de sesión | Fin de sesión | Hasta borrar cuenta o sesión |
| Diario / emoción | No persistir | No persistir | `context_items` + `discard_at` |
| Preview de conector | No aplica | Hasta fin de sesión | Sólo el recorte seleccionado |
| Tokens | No existen | Cifrados, revocables | Igual; no son contenido íntimo |
| Guion generado | Memoria de sesión | Consentimiento aparte | Igual |

Borrar cuenta de producto:

- Borra `linked_accounts` (tras revocar tokens), `consents`, `context_items` y
  `sessions` de ese `user_id`.
- Si una obligación legal de retención lo impidiera, se anonimiza. Eso **no**
  aplica al prototipo actual: no hay base externa ni datos de cuenta.

Job futuro (no implementar): borrar filas con `discard_at <= now()` y sesiones
de invitado huérfanas. El job opera por `user_id`, nunca en lote cruzado.

## Aislamiento por usuario

Reglas para el día en que exista backend:

1. Toda query lleva `WHERE user_id = :auth_user`. Sin listados globales de
   `context_items`, tokens ni sesiones.
2. Un `linked_account` no se comparte entre usuarios. Reconectar el mismo
   Google en otra cuenta de producto crea otra fila.
3. El ciphertext de tokens es inútil sin la clave de servidor. Esa clave no
   viaja al cliente ni a logs.
4. IDs opacos, no enumerables. Un UUID de sesión ajeno responde 404, no 403
   con filtración.
5. El modo invitado no puede leer filas de un `user_id`. Crear cuenta no
   “adopta” sesiones de otros dispositivos.
6. No enviar tokens, títulos de eventos, texto de diario ni identificadores a
   analítica. No entrenar modelos con estos datos.
7. El servidor IA local del prototipo, si se usa, no recibe tokens ni
   `linked_accounts`.

Hasta que exista ese backend, el aislamiento es trivial: no hay datos de cuenta
que filtrar.

## Rate limits

Objetivo: un usuario o un conector roto no tumba el producto ni quema cuota de
otro.

Cuando exista backend, aplicar techos **por `user_id` y por `provider`**, no
globales ciegos:

| Superficie | Techo inicial sugerido | Notas |
| ---------- | ---------------------- | ----- |
| `connect` / OAuth start | 5 intentos / usuario / hora | Anti-abuso del consent screen |
| Refresh de token | 1 en vuelo por `linked_account` | Sin ráfagas |
| `calendar.freebusy` | 12 consultas / usuario / hora | Recorte de ventana (p. ej. hoy + mañana), no sync continuo |
| Drive Picker + lectura | 10 archivos / usuario / día | Un archivo por acto de consentimiento |
| `fetchPreview` | 20 / usuario / hora | Devuelve recortes, no el feed crudo |
| Generación de guion con cuenta | El mismo límite que el prototipo local | Independiente del conector |

Invitado: no hay llamadas a proveedores; no aplican estas cuotas. El rate limit
de generación local / IA local sigue siendo el del prototipo.

Si el proveedor responde 429, marcar `linked_accounts.status = error`, no
reintentar en bucle y no degradar a otro usuario. Nunca compensar una cuota
agotada leyendo más scopes.

Cifras concretas se revalidan contra las cuotas oficiales de Google el día de
la implementación, no ahora.

## Migración desde el prototipo

Orden reversible. Cada paso exige autorización explícita; ninguno corre hoy.

1. Seguir sirviendo el modo invitado **sin** estas tablas.
2. Cuando haya backend autorizado: crear el esquema vacío. No migrar diarios
   locales (hoy no se persisten).
3. Copiar preferencias de `localStorage` a `users` sólo con confirmación.
4. Si la persona crea cuenta a mitad de flujo, volcar `contextSources` de la
   sesión abierta a `context_items` con `origin = typed | local_file`.
5. Activar conectores de a uno: Calendar, Drive, después una red. Cada alta es
   una migración de enum `provider`.
6. Mantener `onlineConnector` desactivado hasta el criterio de salida del
   proveedor. El modo demostración sin claves no se retira.

Rollback: apagar el flag del proveedor deja la UI deshabilitada y no borra
`users`. Los tokens se revocan si el flag se apaga de forma permanente.

## Criterios de salida (de diseño a implementación)

No encargar OAuth, cuentas reales, claves, base externa ni despliegue hasta que
se cumplan **todos**:

1. Leonardo autoriza por escrito crear credenciales, aceptar condiciones del
   proveedor y abrir revisión de la plataforma.
2. Privacidad y calidad del guion del prototipo están verdes (ver matriz de
   cierre y rúbrica editorial vigentes).
3. Cinco pruebas moderadas confirman valor **sin** cuentas conectadas.
4. Al menos tres personas piden espontáneamente la misma fuente.
5. Hay evidencia de que esa fuente mejora la sesión (no sólo “estaría bueno”).
6. El modo demostración sigue funcionando completo sin claves.
7. Hay revisión de seguridad (y legal si se va a persistir diario o señales
   sensibles) **antes** de escribir `context_items` en un servidor.
8. Existe un entorno backend propio: los tokens no pueden vivir en este
   frontend estático.

Salida **por proveedor**, no global: cumplir los puntos para Calendar no
autoriza Drive ni redes.

Mientras no se cumpla: este documento es la preparación. El código de
conectores permanece inerte. No se crean proyectos OAuth, no se piden tarjetas,
no se abre una base externa y no se despliega un login.

## Fuera de alcance de este prototipo

- Cuentas reales, login, OAuth, client secrets, Google Cloud, Meta, Spotify.
- Base de datos externa, migraciones SQL aplicadas, jobs de `discard_at`.
- Pagos, suscripciones, publicación y canal de YouTube.
- Simular en la UI que Calendar, Drive o una red ya están conectados.
- Pedir o inferir datos de menores; el producto es sólo para mayores de 18.

Referencia de producto: `docs/PRODUCT_SPEC.md` (login y sincronización fuera de
alcance). Referencia de consentimiento y scopes: `docs/DATA_CONNECTOR_CONSENT_PLAN.md`.
