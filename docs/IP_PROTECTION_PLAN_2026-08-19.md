# Plan de protección de propiedad intelectual — Pausa Mía

Fecha de corte: 2026-08-19
Estado: **PREPARADO — no presentado, no pagado, no concedido**

Este documento es una estrategia operativa, no asesoramiento jurídico. Antes de
presentar una patente o contestar una observación conviene consultar a un agente de
la propiedad industrial o abogado argentino.

## Veredicto ejecutivo

| Activo | Protección recomendada | Prioridad | Estado |
|---|---|---:|---|
| Nombre comercial `PAUSA MÍA` | Marca denominativa en Argentina | Alta | Titular operativo: Leonardo Apollonio; búsqueda y presentación pendientes |
| Logo final | Marca figurativa o mixta | Media | El logo aún no está congelado |
| Código fuente y arquitectura | Derecho de autor; depósito de software en DNDA | Alta | Archivo de código preparado localmente |
| Guiones, plantillas y textos originales | Derecho de autor como obra escrita, según trámite DNDA aplicable | Media | Corpus en revisión editorial |
| Audios propios futuros | Derecho de autor/fonograma y contratos de voz | Media | No hay voces propias fijadas en esta fase |
| Interfaz visual | Derecho de autor; diseño industrial sólo si aparece un diseño visual realmente novedoso | Baja | No presentar todavía |
| Algoritmo de personalización actual | No presentar patente | — | Rechazo estratégico: software y método no técnicos |
| Mejora técnica futura | Patente sólo después de informe de estado de la técnica | Condicional | No existe aún una reivindicación defendible |
| Prompts, reglas de seguridad y evaluación | Secreto comercial mientras no se publiquen | Alta | Separar del repositorio público |

## 1. Marca que conviene solicitar

La marca principal a proteger es **PAUSA MÍA**, como marca denominativa. El nombre
`Meditación a Medida` describe el servicio y sería una base marcaria más débil; lo
usaría como descripción, no como la marca principal.

### Clases preliminares

- **Clase 42:** servicio de software como servicio (SaaS) para generar y reproducir
  sesiones de bienestar personalizadas. Es la clase prioritaria para la versión web.
- **Clase 9:** sólo cuando comercialicemos una aplicación descargable o software
  descargable como producto separado.
- **Clase 41:** evaluar si el negocio efectivamente ofrece contenidos o formación de
  meditación como servicio, además del software.
- **Clase 44:** no usar en esta fase: el producto se presenta como bienestar general,
  no como servicio médico, psicológico o terapéutico.

Antes de presentar hay que hacer búsqueda por caracteres idénticos, variantes y una
búsqueda fonética profesional. El INPI recomienda la base oficial, TMView y, para una
decisión más completa, la búsqueda fonética arancelada.

## 2. Código y contenido

El derecho de autor nace con la creación; el registro no crea el derecho, pero aporta
una fecha y una prueba más fáciles de usar. Para el software que ya es público, la
DNDA pide copia completa de la obra, datos de autor/titular y comprobantes de pago.

Se preparó el archivo local:

- `artifacts/ip/pausa-mia-software-v0.1.0-2026-08-19.zip`
- `artifacts/ip/pausa-mia-software-v0.1.0-2026-08-19.zip.sha256`

Todavía faltan, y no deben inventarse:

1. datos declarables del titular operativo: Leonardo Apollonio;
2. autoría y porcentajes de cualquier colaborador humano;
3. CUIL/CUIT y domicilio que se declararán;
4. comprobante de pago y presentación TAD/DNDA.

El repositorio público y la publicación del prototipo son evidencia de divulgación,
no una cesión de derechos. Conviene conservar los commits, el historial y este hash.

## 3. Por qué no corresponde patentar la versión actual

La Ley 24.481 excluye los programas de computación como tales y los métodos de
actividad intelectual. Las directrices del INPI sólo dejan una vía cuando el conjunto
aporta una solución a un problema técnico, con efecto técnico, novedad, actividad
inventiva y aplicación industrial.

El prototipo actual es una aplicación web que toma respuestas consentidas, arma un
guion modular y lo reproduce con voz del navegador. Eso describe una función de
producto y un método de contenido, no una mejora técnica demostrada del funcionamiento
del procesador, del audio o de un dispositivo.

Además, la búsqueda preliminar encontró antecedentes cercanos sobre generación
automática de audio de meditación, sesiones modulares dinámicas y personalización con
datos del usuario. Esto no es una opinión definitiva de patentabilidad, pero hace
imprudente gastar en una solicitud amplia sin un agente y una búsqueda de estado de la
técnica.

### Candidato futuro, si realmente lo construimos

Sólo tendría sentido estudiar una patente si desarrollamos una solución técnica
novedosa y medible, por ejemplo un mecanismo propio de adaptación de audio en el
dispositivo que resuelva un problema concreto de latencia, privacidad, sincronización
o consumo de recursos. Antes de divulgarlo habría que congelar una memoria técnica,
reivindicaciones y dibujos, y pedir un informe profesional de estado de la técnica.

Argentina contempla una declaración de divulgación dentro del año anterior para una
solicitud nacional, pero eso no garantiza la misma situación en otros países. No se
debe asumir que la publicación pública conserva derechos internacionales.

## 4. Lo que conviene mantener secreto

No publicar en el repositorio ni en campañas:

- prompts de producción y reglas internas completas;
- conjuntos de evaluación editorial y umbrales antifuga;
- detalles de seguridad, moderación y telemetría que no sean necesarios para explicar
  el producto;
- arquitectura futura de almacenamiento, selección de contexto y proveedores;
- contratos, precios negociados y datos de testers.

Lo ya publicado deja de ser secreto comercial. El repositorio público actual debe
tratarse como código divulgado.

## 5. Orden de ejecución recomendado

1. Mantener como titular operativo a Leonardo Apollonio mientras dure la validación;
   si más adelante se constituye una sociedad, documentar la cesión o licencia antes
   de transferir activos.
2. Congelar `PAUSA MÍA` como nombre comercial y ejecutar búsquedas oficiales y
   fonéticas en las clases elegidas.
3. Presentar primero la marca denominativa en clase 42; agregar clase 9 cuando exista
   distribución descargable y clase 41 sólo si la oferta final lo justifica.
4. Registrar el software público ante DNDA con el archivo y hash preparados.
5. Registrar por separado el corpus de guiones cuando esté congelado y se confirme el
   trámite DNDA aplicable.
6. Obtener una opinión de agente sobre una posible invención técnica antes de gastar
   en patente. Si la opinión es negativa, mantener secreto industrial y derecho de
   autor; no presentar una patente especulativa.
7. Registrar dominios y asegurar contratos escritos de cesión/licencia para cualquier
   colaborador humano o proveedor de voz.

## Evidencia de búsqueda ejecutada

El buscador público del portal INPI se consultó el 2026-08-19:

- `Pausa Mia`, denominación que empieza con, clase 42, sólo vigentes: **no se
  encontraron registros**.
- `Pausa`, denominación que contiene, todas las clases, sólo vigentes: **no se
  encontraron registros**.

Esto es una señal preliminar favorable, no un certificado de disponibilidad. El mismo
INPI recomienda revisar variantes y, antes de presentar, una búsqueda fonética
arancelada de antecedentes solicitados y registrados.

## Acciones que requieren autorización y datos del titular

No se realizó ninguna presentación ni pago. Para avanzar a una presentación legal se
necesitan el titular elegido, sus datos declarables, la cuenta autenticada en ARCA/TAD
y una confirmación expresa del arancel antes de pagar. La concesión de una marca o
patente tampoco puede prometerse: la decide el organismo luego del examen y, en marcas,
eventuales oposiciones.

## Fuentes oficiales y antecedentes consultados

- INPI — [registrar una marca](https://www.argentina.gob.ar/inpi/marcas/registrar-una-marca)
- INPI — [búsqueda de marcas](https://www.argentina.gob.ar/inpi/marcas/averigua-si-tu-marca-esta-registrada)
- INPI — [clasificación de marcas](https://www.argentina.gob.ar/inpi/marcas/clasificacion-de-marcas)
- DNDA — [registrar software público](https://www.argentina.gob.ar/node/37071)
- INPI — [patentes y modelos de utilidad](https://www.argentina.gob.ar/inpi/patentes-de-invencion-y-modelos-de-utilidad)
- INPI — [directrices para programas de computación](https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-318-2012-206352/texto)
- INPI — [aranceles vigentes](https://www.argentina.gob.ar/node/373434)
- OMPI — [propiedad intelectual de aplicaciones móviles](https://www.wipo.int/en/web/mobile-apps/index)
- Antecedente de generación automática de meditación: [US20060189878A1](https://patents.google.com/patent/US20060189878A1/en)
- Antecedente de sesiones dinámicas personalizadas: [WO2021195634A1](https://patents.google.com/patent/WO2021195634A1/en)
