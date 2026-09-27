# Métricas de Pausa Mía: auditoría y primera fase local

> Registro histórico de la primera fase. La implementación posterior con
> consentimiento público y API está en `PRODUCT_FUNNEL_RELEASE_2026-09-26.md`;
> los estados "pendiente" de este documento describen aquella fase, no el
> estado actual de la rama ni del sitio publicado.

Fecha: 26/09/2026. Base auditada: main remoto `2c28166`.
Estado: IMPLEMENTADO LOCALMENTE, NO PUBLICADO. Sin servidor nuevo ni analítica
remota activada. No es todavía un panel de tráfico real ni un embudo histórico.

## Datos reales disponibles y su interpretación

Marketing informó una lectura de `/api/visitors/count` en producción el 26/09
a las 08:07 ART: **81 identificadores únicos, 94 pageviews y 5 session_complete**.
Son cifras comunicadas por ese operador; Desarrollo no repitió esa consulta ni
generó visitas públicas en esta fase. No representan 81 personas ni cinco audios
escuchados completos. No se asignan nuevas cifras a eventos antes inexistentes.

| Campo existente  | Definición que respalda el código                                                        | Lo que no demuestra                                                |
| ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| uniqueVisitors   | Hash de UUID del navegador visto en cualquier POST válido; UUID persiste en localStorage | Personas únicas, cuentas ni visitantes externos excluyendo pruebas |
| pageviews        | Cantidad de eventos pageview aceptados; cliente los limita a una carga de módulo         | Sesiones de meditación, lectura efectiva ni visitas humanas        |
| sessionCompletes | Eventos enviados al final natural del reproductor **o al montar la pantalla de cierre**  | Audio iniciado, escuchado entero, feedback respondido ni pago      |

La deduplicación anterior de session_complete es una bandera en memoria que se
reinicia con Nueva sesión. El servidor inserta cada evento recibido sin clave de
idempotencia: reenvíos o clientes manipulados pueden inflar los conteos. CORS no
autentica personas ni elimina bots. Cambiar navegador, borrar almacenamiento o
compartir dispositivo impide equivalencia entre identificador y persona.

Fuentes revisadas: `src/main.tsx`, `src/lib/visitorPing.ts`, `FeedbackStep.tsx`,
`PlaybackStep.tsx`, `server/accountServer.mjs`, `server/visitors.mjs`, ambos stores
y `server/store/schema.sql`. El endpoint sólo devuelve totales, aunque las tablas
históricas tienen first_seen_at/created_at. No hay campo de campaña ni fecha en su
respuesta pública. No se consultó contenido de ninguna base de producción.

## Privacidad y retención anteriores: pendientes reales

- El ping anterior sale desde main antes de obtener consentimiento de analítica.
  El consentimiento para crear una meditación no cubre ese propósito distinto.
- El payload analítico anterior contiene id/event, no cuestionario ni textos.
  Persiste hash y fechas, sin IP en esas tablas. Un hash persistente es un
  identificador seudónimo; no garantiza anonimato por sí mismo.
- No se encontró caducidad/purga automática para esas dos tablas ni borrado de
  esos eventos al borrar una cuenta. No tienen vínculo con el usuario de cuenta.
  El UUID en localStorage tampoco tiene caducidad propia. No se borró información
  histórica como parte de este trabajo.
- HTTP expone necesariamente una dirección de red al servidor/proxy. Que no esté
  en el payload/tablas no acredita ausencia de logs de IP del proveedor. Logs,
  backups, acceso administrativo y retención de infraestructura no se auditaron.
- Pruebas propias históricas no están etiquetadas: no pueden restarse con precisión
  ni presentarse como testers. Los totales no prueban las diez visitas externas.

## Implementado: observador local opt-in, sin transmisión

En esta rama se retiran los llamados automáticos al contador anterior desde main,
cierre y reproductor. El backend y sus datos permanecen intactos. **Publicar esta
rama tal como está detendría los nuevos pings de este cliente, no reemplazaría aún
el contador por métricas remotas.** Por eso no se publicó ni se cambió la web real.
Clientes viejos podrían seguir enviando al endpoint anterior hasta una migración.

`productFunnel.ts` acepta únicamente nombres cerrados de eventos y día UTC. No
acepta valores de respuestas, textos, errores crudos, guiones, audio, cuenta,
correo, URLs, referrer, query/UTM, IP, cookies, IDs publicitarios ni identificadores
persistentes. No usa fetch, sendBeacon ni almacenamiento del navegador.

El permiso separado inicia desmarcado; sólo existe en desarrollo cuando se inicia
`VITE_PRODUCT_FUNNEL_PREVIEW=true npm run dev`. Un build de producción no habilita
esta prueba aun si se proporciona esa variable. La vista de desarrollo muestra
los pasos observados para QA, nunca un supuesto total de personas reales.

| Evento local          | Disparo y límites                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| entry                 | Se habilita la observación voluntaria en esta página; no es toda entrada anónima a la web                |
| questionnaire_started | Se entra al cuestionario; no asegura que se haya contestado                                              |
| script_generated      | Generación finalizó y pasó validación; no el clic en generar                                             |
| audio_started         | onstart real de Web Speech o playing de HTMLAudioElement; no play(), preparación ni estado visual        |
| audio_finished        | Todos los segmentos comenzaron y terminaron en orden, más su pausa final; sin cancelación, seek ni error |
| closing_reached       | Se montó la pantalla de cierre, independientemente del audio                                             |
| feedback_given        | Se eligió valoración o Sí/No; no guarda valor, no incluye clic mailto ni acredita correo recibido        |
| script_error          | Fallo de generación/validación; sin causa, mensaje ni texto privado                                      |
| audio_error           | Fallo de preparación, síntesis o reproducción; sin causa ni texto privado                                |

Una visita/página, una sesión de meditación y un evento son unidades diferentes.
Esta fase observa **un recorrido consentido local**, no identifica visitantes ni
cuentas. Deduplica cada nombre de evento por recorrido: volver a pantallas, pausar,
continuar, regenerar o cambiar valoración no suman repeticiones. No cuenta intentos
ni cantidad total de errores: sólo presencia de cada hito/error en el recorrido.
No es obligatorio recorrer todos los pasos ni ocurren siempre en el mismo orden.

Retención exacta: sólo memoria, máximo nueve entradas; se borra al retirar permiso,
borrar sesión, Nueva sesión o destruir/recargar la página. Nueva sesión requiere
otro opt-in. No hay cola para enviar después ni respaldo. La captura de permiso
por operación descarta resultados tardíos anteriores a revocar o volver a aceptar;
no reconstruye eventos previos a aceptar. Reabrir/reanudar una pestaña conservada
por el navegador puede conservar su memoria hasta cualquiera de esos reinicios.

Finalización es evidencia técnica de callbacks, **no prueba de audición humana**:
volumen silenciado, salida física o atención no se pueden certificar. Un seek
descarta finalización de ese intento aunque luego se retome; se prefiere omitir
un caso dudoso a inflarlo. Si el navegador omite callbacks puede subcontar.
El bloqueo de autoplay no cuenta como comienzo/error hasta el resultado real.
Pausas de seguridad no se clasifican ni se registran como error de salud.

## Verificación y límites

Suite completa: **408/408 casos en 45 archivos**. Después de añadir captura del
fallo de preparación y dos regresiones, **42/42 casos focales** correctos
(410 casos distintos cubiertos, no se volvió a ejecutar toda la suite intacta).
Lint, formato, build de producción con el flag de preview activado y diff check
correctos. El test de producción confirma que el flag no basta para activar el
observador. La búsqueda de imports de visitorPing fuera de tests no encontró usos.

Pruebas sintéticas de consentimiento, sin persistencia/red, deduplicación, esquema
cerrado, borrado, callbacks tardíos, cierre separado, preparación fallida, autoplay
y todos los segmentos. Integración con los hooks de voz neutra y argentina
local/remota usando medios simulados. No se descargaron modelos, llamó a servicios
de voz, usó un iPhone físico ni realizó una escucha humana en esta fase.
El resto de la app conserva sus llamadas funcionales y permisos propios: la
ausencia de transporte del observador no significa que toda la app sea offline.
No es aún un capturador general de errores de cuentas/conectores ni un medidor de
latencia. No hubo QA visual de la nueva vista de desarrollo en navegador físico.

## Siguiente fase, aún NO implementada ni autorizada para publicación

1. Acordar/revisar contrato first-party: consentimiento público separado,
   identificador efímero de recorrido, idempotencia, exclusión de QA y acceso
   restringido a resultados. No reutilizar UUID de visitante persistente sin
   revisión. Definir población consentida: los no consentidores no son ceros.
2. Definir retención de eventos/agregados, borrado/revocación y backups con
   revisión de privacidad. No afirmar plazos de producción que todavía no existen.
3. Implementar colector y agregación por fecha, distinguiendo recorridos únicos,
   eventos y repeticiones. Fuente de campaña sólo con claves cerradas aprobadas,
   nunca guardar UTM libre, URL o referrer que puedan incluir datos personales.
4. Migrar el contador legado y probar límites, permisos, deduplicación, borrado,
   fallos de red y ambos motores de almacenamiento. Conservar historia como legado,
   no reinterpretar session_complete como audio_finished.
5. Revisión de privacidad y autorización específica de Leonardo antes de publicar
   servidor/web. Esta restricción es del encargo de Leonardo transmitido por
   Marketing, no una imposibilidad de la herramienta. iOS/Android/L04 aparte.

Hasta esa fase sólo se pueden leer los tres totales públicos anteriores y los
pasos de una prueba local consentida. No hay nuevos totales reales por audio,
errores, fecha o campaña que Desarrollo pueda presentar como ya disponibles.
