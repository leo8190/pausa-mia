# Plan de conexiones y consentimiento

Estado: **CUENTAS LOCALES IMPLEMENTADAS; OAUTH DE PROVEEDORES PENDIENTE**.

Actualizado: 18 de agosto de 2026.

## Decisión de producto

No ofrecer una conexión genérica a “todas tus redes”. Cada fuente debe ser una función
independiente, voluntaria y explicada por su beneficio concreto. La primera versión
cobrable debe seguir funcionando sin conectar ninguna cuenta.

## Orden recomendado

### Etapa cero — prototipo actual

- Cuestionario de sesión.
- Diario escrito o archivo importado localmente.
- Selección explícita de cada fragmento.
- Vista exacta de lo que se enviará antes de generar.
- Sin OAuth todavía, sincronización pasiva ni almacenamiento de tokens.

### Etapa uno — Google con permisos mínimos

#### Perfil de Google

- Permiso propuesto: `openid profile`.
- Uso permitido: nombre elegido por la persona y avatar de cuenta.
- El correo no se pide para personalizar. Sólo se agregaría `email` si más adelante es
  indispensable para gestionar una cuenta.
- No pedir edad, contactos, ubicación ni otros permisos de perfil.

Google documenta `openid profile` para información básica y `email` como permiso
adicional separado: <https://developers.google.com/identity/openid-connect/openid-connect>.

#### Calendario de Google

Primera opción: `https://www.googleapis.com/auth/calendar.freebusy`.

- Uso: calcular localmente densidad de bloques, tiempo libre y cercanía del próximo
  compromiso.
- No leer títulos, descripciones, invitados, enlaces, ubicaciones ni notas.
- Ejemplo mostrado a la persona: “Hoy tuviste cuatro bloques seguidos y quedan dos”.

Sólo si usuarios reales demuestran que los nombres de eventos mejoran sustancialmente
el guion, evaluar `calendar.events.readonly` mediante un consentimiento nuevo y separado.
Google recomienda pedir el alcance más limitado posible y lista ambos permisos:
<https://developers.google.com/workspace/calendar/api/auth>.

#### Diario en Google Drive

- Permiso propuesto: `https://www.googleapis.com/auth/drive.file`.
- Abrir Google Picker y dejar que la persona elija un archivo concreto.
- No usar `drive.readonly` ni acceso general al Drive.
- Antes de usarlo, mostrar archivo, fragmentos extraídos y casillas de inclusión.
- Procesar sólo los fragmentos seleccionados y descartarlos al terminar la sesión, salvo
  consentimiento separado de conservación.

Google recomienda `drive.file` junto con Google Picker por dar acceso por archivo y una
verificación más simple:
<https://developers.google.com/workspace/drive/api/guides/api-specific-auth>.

### Etapa dos — fuentes opcionales

Estas conexiones se evalúan sólo después de demostrar valor y al menos un pago real.

#### Spotify

- Beneficio posible: adaptar ritmo o referencias sensoriales a preferencias musicales.
- Permisos candidatos: `user-top-read` o `user-read-recently-played`.
- No controlar reproducción, modificar biblioteca ni leer listas privadas.
- Para el producto actual de voz hablada, su valor no justifica implementarlo todavía.

Referencia oficial de permisos:
<https://developer.spotify.com/documentation/web-api/concepts/scopes>.

#### YouTube

- Único permiso candidato: `https://www.googleapis.com/auth/youtube.readonly`.
- No pedir permisos de edición, comentarios, listas o publicación.
- Primero validar si el historial o preferencias aportan más que una pregunta manual.
- Pedir acceso de manera incremental, únicamente al activar la función.

Referencia oficial:
<https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps>.

#### Instagram, Facebook y LinkedIn

- No integrarlos en la primera versión.
- Ofrecer únicamente pegar o importar un fragmento que la persona selecciona.
- No leer mensajes privados, contactos ni actividad completa.
- LinkedIn exige revisión para varias funciones sociales y actualmente mantiene cerrado
  el permiso de lectura de publicaciones de miembros `r_member_social`; por eso no es una
  base confiable para el prototipo:
  <https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview>.
- Revalidar las interfaces y políticas oficiales de Meta justo antes de diseñar cualquier
  integración; no asumir acceso disponible.

## Fuentes excluidas

### Gmail

No pedir acceso a Gmail. Sus permisos amplios son restringidos, pueden requerir revisión
y evaluación anual de seguridad cuando los datos pasan por servidores de terceros. Los
casos admitidos publicados por Google se centran en clientes de correo, productividad y
mejoras de la experiencia de correo; usar emails para una meditación no es un encaje
suficientemente claro.

Referencias:

- <https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification>
- <https://developers.google.com/workspace/workspace-api-user-data-developer-policy>

## Consentimiento por capas

Cada fuente debe completar estas cinco decisiones, sin casillas premarcadas:

1. **Conectar:** qué servicio y qué permiso técnico se solicita.
2. **Elegir:** qué calendario, archivo o período se usará.
3. **Revisar:** vista legible y JSON técnico exacto de los datos preparados.
4. **Usar:** autorización para esta sesión; “recordar” debe ser una decisión separada.
5. **Revocar:** desconectar, invalidar token y borrar derivados desde la aplicación.

Texto base:

> Esta fuente es opcional. Usaremos únicamente lo que ves seleccionado para crear esta
> meditación. Podés editarlo, excluirlo o continuar sin conectarla.

## Reglas técnicas obligatorias

- Autorización incremental: pedir cada permiso cuando la persona activa esa función.
- Validar `state` y usar protección contra falsificación de solicitudes.
- No guardar tokens en almacenamiento local del navegador.
- Guardar un refresh token sólo si existe consentimiento explícito de sincronización
  continua; cifrado, revocable y separado del contenido íntimo.
- No enviar tokens, nombres de eventos, texto de diario ni identificadores a analítica.
- No entrenar modelos con estos datos.
- No reutilizar la autorización de una fuente para otra finalidad.
- Eliminar contenido crudo y derivados al borrar la sesión o revocar el permiso.

## Umbral para implementar

No encargar OAuth a Cursor hasta que:

1. la privacidad y calidad del guion actual estén verdes;
2. cinco pruebas moderadas confirmen valor sin cuentas conectadas;
3. al menos tres personas pidan espontáneamente la misma fuente;
4. exista evidencia de que esa fuente mejora la sesión;
5. Leonardo autorice crear credenciales, aceptar condiciones y comenzar la revisión de
   la plataforma.

La primera conexión recomendada sería Google Calendar mediante `calendar.freebusy`; la
segunda, un archivo concreto de Google Drive mediante Picker y `drive.file`.
