# Instrucciones del producto Meditación a Medida

## Alcance actual

Construir un prototipo web local, en español, que convierta un cuestionario breve y
una entrada opcional de diario en una meditación guiada reproducible como audio.

## Límites obligatorios

- Cursor es el único responsable de implementar código.
- No leer, copiar ni reutilizar datos, audios, voces, credenciales o estados del canal
  de YouTube ni de otros proyectos.
- No conectar cuentas reales, Google, Gmail, Calendar, Drive ni redes sociales.
- Mostrar esas integraciones sólo como funciones futuras, separadas y desactivadas.
- No crear OAuth, claves, cuentas, pagos, publicaciones ni despliegues.
- No persistir la entrada de diario ni el estado emocional por defecto.
- No enviar datos a terceros en modo demostración.
- No afirmar que el producto es terapia, psicología, tratamiento o diagnóstico.
- No prometer curar, reducir o resolver ansiedad, depresión, insomnio, trauma u otra
  condición.
- Si el texto sugiere peligro inmediato o autolesión, no generar una meditación:
  mostrar una pausa de seguridad que recomiende contactar a una persona de confianza,
  un profesional o los servicios locales de emergencia.
- No pedir ni inferir datos de menores; el prototipo es sólo para mayores de 18 años.

## Experiencia

- Interfaz serena, cálida y simple; una decisión principal por pantalla.
- Explicar siempre qué dato se usa y para qué.
- La persona puede omitir cualquier campo sensible.
- Cada sesión debe reflejar al menos dos detalles concretos elegidos por la persona,
  sin interpretar sus causas ni decir que la aplicación "la conoce".
- El usuario puede revisar el guion antes de reproducirlo.
- Incluir controles de reproducir, pausar, detener y reiniciar.
- Variantes visibles: español argentino y español neutro.

## Calidad y verificación

- Mantener un modo demostración completamente funcional sin claves.
- Agregar pruebas unitarias para consentimiento, descarte de datos, selección de voz,
  generación del guion y pausa de seguridad.
- Ejecutar formato, análisis estático, pruebas y compilación antes de declarar listo.
- Documentar comandos, decisiones, limitaciones y evidencia real en el README.
