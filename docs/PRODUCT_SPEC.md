# Especificación del prototipo

## Hipótesis

Un adulto que llega cargado por una situación concreta valora más una práctica de
cinco minutos que reconoce su contexto, preferencias y experiencia que una grabación
genérica de una biblioteca.

## Usuario inicial

Mayores de 18 años, hispanohablantes, con experiencia nula o básica en meditación,
que buscan una pausa breve para ordenar la atención durante un día normal. No se
diseña esta primera versión para crisis, tratamiento clínico ni menores.

## Flujo mínimo

1. **Bienvenida y límites:** explicar que es bienestar general, no terapia, y que la
   primera sesión no guarda ni conecta información.
2. **Consentimiento de sesión:** permitir usar únicamente las respuestas actuales
   para crear el guion y el audio. Sin aceptar, no se procesa nada.
3. **Check-in:** nombre opcional, cómo llega, qué pasó recientemente, qué necesita de
   esta pausa, experiencia, estilo, temas a evitar, duración y variante de español.
4. **Resumen editable:** mostrar exactamente qué información se usará y permitir
   quitar cualquier dato.
5. **Generación:** producir un guion local mediante reglas y componentes modulares.
6. **Revisión:** mostrar título, intención, duración estimada y texto completo.
7. **Audio:** reproducir el guion con una voz disponible en el dispositivo.
8. **Cierre:** valoración simple y pregunta de disposición a pagar, sin cobro real.
9. **Borrado:** ofrecer “Borrar esta sesión” y confirmar que los campos quedaron
   vacíos.

## Campos del check-in

- Nombre o apodo: opcional.
- Momento: ahora, antes de dormir, al despertar o pausa laboral.
- Situación reciente: texto libre, opcional, máximo 600 caracteres.
- Estado percibido: tranquilo, acelerado, disperso, cansado, sensible u otro.
- Intención: calmar el ritmo, concentrarse, descansar, aceptar una emoción o volver al
  cuerpo.
- Experiencia: primera vez, básica o habitual.
- Estilo: respiración natural, recorrido corporal, atención abierta o autocompasión.
- Temas o palabras a evitar: texto corto, opcional.
- Duración: tres, cinco o diez minutos; cinco por defecto.
- Voz: español argentino o español neutro.

## Motor de guiones

El guion se arma en cinco bloques y conserva marcadores de pausa separados del texto:

1. Llegada y permiso para detenerse.
2. Reconocimiento literal de la situación, sin diagnóstico ni interpretación.
3. Práctica principal adaptada a experiencia, estilo e intención.
4. Recordatorio personalizado cuando la atención se distrae.
5. Regreso gradual y cierre sin promesas.

Reglas de calidad:

- Usar dos o tres detalles concretos y nunca repetir datos íntimos innecesariamente.
- No inventar recuerdos, causas, relaciones ni emociones.
- No usar dependencia emocional: evitar “sólo yo te entiendo” o equivalentes.
- Evitar imperativos físicos fuertes; preferir invitaciones y respiración natural.
- No usar retenciones de aire, hiperventilación ni técnicas intensas.
- Variar aperturas, anclajes, metáforas y cierres para reducir sensación de plantilla.
- Cada párrafo debe poder narrarse lentamente y contener una sola acción.
- Nunca decir que un resultado está garantizado.

## Voz y audio en esta fase

- Modo sin costo: síntesis de voz disponible en el navegador, priorizando una voz
  `es-AR` para Argentina y una `es-MX`, `es-US` o `es-419` natural para neutral.
- Si no existe la voz solicitada, informar el reemplazo antes de reproducir.
- Mantener una interfaz de proveedor desacoplada para integrar una voz comercial más
  adelante sin cambiar el motor de guiones.
- El prototipo no reutiliza muestras ni credenciales de otros proyectos.

## Consentimiento y privacidad

- Consentimiento separado para procesar la sesión, guardar preferencias y, en fases
  futuras, cada fuente externa.
- Nada de casillas preseleccionadas.
- Google perfil, Google Calendar, diario persistente y cada red social serán permisos
  incrementales independientes, apagados por defecto.
- No se propone acceso general a Gmail, Drive o redes para el producto mínimo.
- Debe existir uso completo sin conectar ninguna cuenta.
- Antes de almacenar diarios o señales de salud en un servidor se requiere revisión
  legal y de seguridad específica.

## Pausa de seguridad

Un detector conservador de frases de peligro inmediato detiene la generación y
muestra un mensaje humano, no alarmista. No intenta evaluar riesgo, diagnosticar ni
resolver la situación. Ofrece borrar el texto y buscar ayuda humana inmediata.

## Fuera de alcance

- Login, cuentas, sincronización, Google, redes sociales y diario en la nube.
- Pagos reales, suscripciones y publicación.
- Música de fondo, binaurales, video, clonación de voz y voces de terceros.
- Recomendaciones clínicas o sustitución de profesionales.

## Criterios de aceptación

- El flujo completo funciona localmente y sin credenciales.
- Se puede generar y escuchar una sesión en las dos variantes de español.
- El guion usa detalles reales sin inventar ni diagnosticar.
- La pausa de seguridad impide generar audio ante texto de peligro inmediato.
- “Borrar esta sesión” elimina todos los datos de sesión comprobables.
- Las integraciones futuras no solicitan permisos ni simulan que ya están conectadas.
- Pruebas, análisis estático y compilación pasan.

