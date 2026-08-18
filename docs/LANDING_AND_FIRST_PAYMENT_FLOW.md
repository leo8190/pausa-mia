# Landing y camino al primer pago

Estado: **PREPARADO, NO PUBLICADO, NO COBRADO**.

## Promesa principal

**Una meditación creada para cómo llegás hoy.**

Contás sólo lo que querés. La aplicación prepara en el momento una práctica guiada
con el tono, la duración y la voz que elegís, sin diagnosticarte ni reemplazar atención
profesional.

Llamada principal: **Probar una sesión completa gratis**.

## Por qué probarla

- Se adapta a tu momento, intención y experiencia con meditación.
- Puede usar notas o diario únicamente cuando los seleccionás y autorizás.
- Ofrece voz argentina y español neutro.
- Antes de generar, muestra exactamente qué información se utilizará.
- Podés editar, excluir o borrar todo en cualquier momento.

## Cómo funciona

1. Elegís qué querés compartir.
2. Revisás y autorizás la información de esa sesión.
3. Recibís una meditación en audio creada para ese momento.

## Mensaje de privacidad

Tus datos íntimos no se usan para publicidad. Ninguna cuenta, red social, diario ni
servicio de Google se conecta sin un permiso específico y revocable. La primera prueba
funciona sin conectar cuentas externas.

## Oferta inicial a validar

- Primera sesión completa: gratis.
- Paquete fundador de cinco sesiones: **USD 2,99**.
- Plan fundador mensual: **USD 7,99**.

Son precios experimentales. No deben presentarse como definitivos hasta habilitar un
checkout autorizado y comprobar moneda, impuestos, comisiones y condiciones.

## Pantalla posterior a la primera sesión

Pregunta: **¿Cuál opción elegirías para volver a usarla?**

- Cinco sesiones por USD 2,99.
- Acceso mensual por USD 7,99.
- Seguiría sólo con una opción gratuita.
- No la volvería a usar.

Esta elección mide intención, no pago.

## Camino verificable al primer cobro

1. Corregir y aprobar los criterios críticos de privacidad y calidad del guion.
2. Completar cinco pruebas moderadas con datos sintéticos o poco sensibles.
3. Alcanzar los umbrales definidos en `VALIDATION_PROTOCOL.md`.
4. Pedir autorización explícita de Leonardo antes de publicar, contactar o habilitar
   checkout.
5. Habilitar una única oferta fundadora con condiciones, precio final y política de
   devolución visibles.
6. Verificar el pago en el panel del procesador. Sólo entonces registrar `PAGADO`.

## Embudo mínimo

Registrar únicamente eventos no sensibles:

1. `landing_view`
2. `session_start`
3. `session_complete`
4. `price_choice`
5. `checkout_open`
6. `payment_confirmed`

No enviar texto del cuestionario, diario, guion, intención, estado emocional ni voz a
analítica o publicidad.

## Prueba de mensaje

Versión principal:

> Una pausa creada para cómo llegás hoy.

Versión alternativa:

> No otra meditación genérica: una práctica que usa sólo lo que elegís compartir.

Medir inicio y finalización de sesión. No optimizar anuncios con información de salud,
estado emocional o dificultades personales.

## Criterio de decisión

- Si las personas terminan y valoran la sesión, pero no eligen pagar, cambiar oferta,
  precio o segmento antes de integrar Google o redes sociales.
- Si no terminan o el guion no alcanza el umbral de calidad, mejorar la experiencia
  antes de invertir en adquisición.
- Un clic, una selección de precio o una promesa no equivalen a ingreso.
