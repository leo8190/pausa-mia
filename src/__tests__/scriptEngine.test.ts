import { describe, expect, it } from 'vitest';
import {
  buildClosingBlock,
  generateScript,
  getFocusPhraseTexts,
  validateScriptQuality,
  ConsentRequiredError,
} from '../lib/scriptEngine';
import { createEmptyCheckIn } from '../lib/session';
import { isDurationWithinTolerance } from '../lib/durationEstimator';
import { extractWordSequences } from '../lib/sensitiveOverlap';
import { createContextSource } from '../lib/contextSources';
import type { Duration, Intention, MeditationStyle, VoiceVariant } from '../types';

const ARGENTINE_MARKERS =
  /(^|[^a-záéíóúñ])(vos|podés|notá|volvé|seguí|llevá|permití)([^a-záéíóúñ]|$)/i;

function duplicateTexts(texts: string[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const text of texts) {
    const key = text.trim().toLowerCase();
    if (seen.has(key)) duplicates.push(text);
    seen.add(key);
  }
  return duplicates;
}

describe('scriptEngine', () => {
  const baseCheckIn = () => {
    const checkIn = createEmptyCheckIn();
    checkIn.name = 'María';
    checkIn.moment = 'pausa-laboral';
    checkIn.recentSituation = 'Reunión intensa esta mañana con mucha presión';
    checkIn.perceivedState = 'acelerado';
    checkIn.intention = 'calmar-ritmo';
    checkIn.experience = 'basica';
    checkIn.style = 'respiracion-natural';
    checkIn.duration = 5;
    checkIn.voiceVariant = 'es-neutro';
    return checkIn;
  };

  const genOpts = { sessionProcessing: true };

  it('rejects generation without session processing consent', () => {
    expect(() =>
      generateScript(baseCheckIn(), new Set(), { sessionProcessing: false }),
    ).toThrow(ConsentRequiredError);
  });

  it('generates a script with at least two concrete details', () => {
    const script = generateScript(baseCheckIn(), new Set(), genOpts);
    expect(script.usedDetails.length).toBeGreaterThanOrEqual(2);
    expect(script.segments.length).toBeGreaterThan(0);
    expect(script.fullText.length).toBeGreaterThan(100);
  });

  it('uses categorical situation reference without literal user text', () => {
    const script = generateScript(baseCheckIn(), new Set(), genOpts);
    expect(script.fullText).not.toContain('Reunión intensa esta mañana');
    expect(script.fullText).toMatch(/ocupa espacio|tramo de la jornada/i);
    expect(script.fullText).not.toMatch(/relacionado con/i);
    expect(script.fullText).not.toMatch(/diagnóstico|trastorno|depresión/i);
    for (const detail of script.usedDetails) {
      expect(detail).not.toContain('Reunión');
    }
  });

  it('uses argentine variant phrasing', () => {
    const checkIn = baseCheckIn();
    checkIn.voiceVariant = 'es-AR';
    const script = generateScript(checkIn, new Set(), genOpts);
    expect(script.fullText).toMatch(/Podés|podés|Volvé|volvé/);
  });

  it('respects excluded fields', () => {
    const excluded = new Set(['name', 'recentSituation']);
    const script = generateScript(baseCheckIn(), excluded, genOpts);
    expect(script.fullText).not.toContain('María');
    expect(script.fullText).not.toContain('Reunión intensa');
  });

  it('filters avoided topics from script', () => {
    const checkIn = baseCheckIn();
    checkIn.avoidTopics = 'reunión';
    const script = generateScript(checkIn, new Set(), genOpts);
    expect(script.fullText.toLowerCase()).not.toContain('reunión');
  });

  it('passes quality validation', () => {
    const script = generateScript(baseCheckIn(), new Set(), genOpts);
    const quality = validateScriptQuality(script);
    expect(quality.valid).toBe(true);
    expect(quality.issues).toHaveLength(0);
  });

  it('estimatedMinutes is not just the selected duration option', () => {
    const script = generateScript(baseCheckIn(), new Set(), genOpts);
    expect(script.estimatedMinutes).toBeGreaterThan(0);
    expect(typeof script.estimatedMinutes).toBe('number');
    expect(script.targetDuration).toBe(5);
  });

  it('calibrates duration within tolerance for 3/5/10 minutes', () => {
    for (const duration of [3, 5, 10] as const) {
      const checkIn = baseCheckIn();
      checkIn.duration = duration;
      const script = generateScript(checkIn, new Set(), genOpts);
      expect(isDurationWithinTolerance(script.estimatedMinutes, duration)).toBe(true);
    }
  });

  it('produces different segment counts for different durations', () => {
    const short = baseCheckIn();
    short.duration = 3;
    const long = baseCheckIn();
    long.duration = 10;
    const scriptShort = generateScript(short, new Set(), genOpts);
    const scriptLong = generateScript(long, new Set(), genOpts);
    expect(scriptLong.segments.length).toBeGreaterThanOrEqual(
      scriptShort.segments.length,
    );
  });

  it('includes pause markers separate from text', () => {
    const script = generateScript(baseCheckIn(), new Set(), genOpts);
    for (const seg of script.segments) {
      expect(seg.pauseAfterMs).toBeGreaterThan(0);
      expect(seg.text.length).toBeGreaterThan(0);
    }
  });

  it('records engine type as local by default', () => {
    const script = generateScript(baseCheckIn(), new Set(), genOpts);
    expect(script.engine).toBe('local');
  });
});

describe('duración sin relleno repetido', () => {
  const genOpts = { sessionProcessing: true };

  const buildEvalCase2 = () => {
    const checkIn = createEmptyCheckIn();
    checkIn.moment = 'antes-de-dormir';
    checkIn.perceivedState = 'disperso';
    checkIn.intention = 'descansar';
    checkIn.experience = 'habitual';
    checkIn.style = 'atencion-abierta';
    checkIn.duration = 10;
    checkIn.voiceVariant = 'es-neutro';
    checkIn.avoidTopics = 'relájate';
    return checkIn;
  };

  it('caso 2 alcanza diez minutos sin repetir texto ni desbordar el cierre', () => {
    const checkIn = buildEvalCase2();
    const script = generateScript(checkIn, new Set(), genOpts);
    const texts = script.segments.map((segment) => segment.text);

    expect(script.estimatedMinutes).toBeGreaterThanOrEqual(9);
    expect(script.estimatedMinutes).toBeLessThanOrEqual(11);

    expect(duplicateTexts(texts)).toEqual([]);

    expect(script.fullText).not.toMatch(ARGENTINE_MARKERS);
    expect(script.fullText.toLowerCase()).not.toContain('relájate');
    expect(script.fullText).toMatch(/práctica habitual/i);
    expect(script.fullText).toMatch(/seguir el hilo de tu práctica/i);

    const closing = buildClosingBlock(checkIn, 'es-neutro');
    expect(texts.slice(-2)).toEqual(closing.map((segment) => segment.text));
    expect(texts.indexOf(closing[0].text)).toBe(texts.length - 2);

    const maxPauseCount = script.segments.filter(
      (segment) => segment.pauseAfterMs === 12000,
    ).length;
    expect(maxPauseCount * 2).toBeLessThan(script.segments.length);

    const quality = validateScriptQuality(script);
    expect(quality.issues).toEqual([]);
    expect(quality.valid).toBe(true);
  });

  it('cumple duración, unicidad y cierre final en 3/5/10 por variante y estilo', () => {
    const durations: Duration[] = [3, 5, 10];
    const variants: VoiceVariant[] = ['es-AR', 'es-neutro'];
    const styles: MeditationStyle[] = [
      'respiracion-natural',
      'recorrido-corporal',
      'atencion-abierta',
      'autocompasion',
    ];

    for (const duration of durations) {
      for (const voiceVariant of variants) {
        for (const style of styles) {
          const checkIn = createEmptyCheckIn();
          checkIn.name = 'Ana';
          checkIn.moment = 'ahora';
          checkIn.perceivedState = 'cansado';
          checkIn.intention = 'volver-al-cuerpo';
          checkIn.experience = 'basica';
          checkIn.style = style;
          checkIn.duration = duration;
          checkIn.voiceVariant = voiceVariant;

          const label = `${duration}/${voiceVariant}/${style}`;
          const script = generateScript(checkIn, new Set(), genOpts);
          const texts = script.segments.map((segment) => segment.text);

          expect(
            isDurationWithinTolerance(script.estimatedMinutes, duration),
            `${label} fuera de tolerancia: ${script.estimatedMinutes}`,
          ).toBe(true);
          expect(script.segments.length, label).toBeGreaterThanOrEqual(3);
          expect(script.segments.length, label).toBeLessThanOrEqual(40);
          expect(duplicateTexts(texts), label).toEqual([]);

          for (const segment of script.segments) {
            expect(segment.pauseAfterMs, label).toBeGreaterThanOrEqual(3000);
            expect(segment.pauseAfterMs, label).toBeLessThanOrEqual(12000);
          }

          expect(texts.join('\n\n'), label).toBe(script.fullText);

          const closing = buildClosingBlock(checkIn, voiceVariant);
          expect(texts.slice(-2), label).toEqual(
            closing.map((segment) => segment.text),
          );

          const maxPauseCount = script.segments.filter(
            (segment) => segment.pauseAfterMs === 12000,
          ).length;
          expect(maxPauseCount * 2, label).toBeLessThan(script.segments.length);

          expect(validateScriptQuality(script).issues, label).toEqual([]);
        }
      }
    }
  });

  it('alcanza diez minutos sin estilo ni datos opcionales y sin repetir texto', () => {
    const checkIn = createEmptyCheckIn();
    checkIn.duration = 10;
    checkIn.voiceVariant = 'es-neutro';

    const script = generateScript(checkIn, new Set(), genOpts);
    const texts = script.segments.map((segment) => segment.text);

    expect(isDurationWithinTolerance(script.estimatedMinutes, 10)).toBe(true);
    expect(duplicateTexts(texts)).toEqual([]);
    expect(script.segments.length).toBeLessThanOrEqual(40);
    expect(texts.slice(-2)).toEqual(
      buildClosingBlock(checkIn, 'es-neutro').map((segment) => segment.text),
    );
  });

  it('no agrega indicaciones después del cierre en la duración más larga', () => {
    const checkIn = createEmptyCheckIn();
    checkIn.moment = 'al-despertar';
    checkIn.perceivedState = 'disperso';
    checkIn.intention = 'concentrarse';
    checkIn.experience = 'habitual';
    checkIn.style = 'recorrido-corporal';
    checkIn.duration = 10;
    checkIn.voiceVariant = 'es-AR';

    const script = generateScript(checkIn, new Set(), genOpts);
    const closing = buildClosingBlock(checkIn, 'es-AR');
    const texts = script.segments.map((segment) => segment.text);

    expect(texts.slice(-2)).toEqual(closing.map((segment) => segment.text));
    expect(texts.filter((text) => text === closing[0].text)).toHaveLength(1);
    expect(texts.filter((text) => text === closing[1].text)).toHaveLength(1);
    expect(script.fullText).not.toMatch(/Seguí con esta práctica, a tu propio ritmo/);
  });
});

const SYNTHETIC_WORK_SITUATION =
  'Tuve varias reuniones seguidas y todavía me quedan tareas por cerrar antes del viernes';

const SYNTHETIC_ARGUMENT_STORY =
  'Ayer tuvimos una discusión larga que empezó por algo menor y terminó con reproches viejos. ' +
  'Se dijeron cosas que ninguno de los dos pensaba del todo, y después vino un silencio incómodo ' +
  'que duró toda la tarde. Me quedé repasando la conversación una y otra vez, buscando el momento ' +
  'exacto en que se torció, y sin poder decidir si conviene volver a hablarlo hoy o esperar unos ' +
  'días a que baje la intensidad. Todavía tengo el cuerpo tenso y la sensación de que quedó algo ' +
  'sin resolver entre nosotros dos.';

function buildCase1() {
  const checkIn = createEmptyCheckIn();
  checkIn.moment = 'pausa-laboral';
  checkIn.recentSituation = SYNTHETIC_WORK_SITUATION;
  checkIn.perceivedState = 'acelerado';
  checkIn.intention = 'calmar-ritmo';
  checkIn.experience = 'primera-vez';
  checkIn.style = 'respiracion-natural';
  checkIn.duration = 3;
  checkIn.voiceVariant = 'es-AR';
  return checkIn;
}

function buildCase2() {
  const checkIn = createEmptyCheckIn();
  checkIn.moment = 'antes-de-dormir';
  checkIn.perceivedState = 'disperso';
  checkIn.intention = 'descansar';
  checkIn.experience = 'habitual';
  checkIn.style = 'atencion-abierta';
  checkIn.duration = 10;
  checkIn.voiceVariant = 'es-neutro';
  checkIn.avoidTopics = 'relájate';
  return checkIn;
}

function buildCase3() {
  const checkIn = createEmptyCheckIn();
  checkIn.moment = 'ahora';
  checkIn.recentSituation = SYNTHETIC_ARGUMENT_STORY;
  checkIn.perceivedState = 'sensible';
  checkIn.intention = 'aceptar-emocion';
  checkIn.experience = 'basica';
  checkIn.style = 'autocompasion';
  checkIn.duration = 5;
  checkIn.voiceVariant = 'es-neutro';
  return checkIn;
}

function buildCase8() {
  const checkIn = createEmptyCheckIn();
  checkIn.moment = 'ahora';
  checkIn.perceivedState = 'cansado';
  checkIn.intention = 'volver-al-cuerpo';
  checkIn.experience = 'basica';
  checkIn.style = 'recorrido-corporal';
  checkIn.avoidTopics = 'respirar profundo';
  checkIn.duration = 5;
  checkIn.voiceVariant = 'es-AR';
  return checkIn;
}

function buildCase9() {
  const checkIn = createEmptyCheckIn();
  checkIn.moment = 'ahora';
  checkIn.intention = 'concentrarse';
  checkIn.experience = 'basica';
  checkIn.style = 'atencion-abierta';
  checkIn.duration = 5;
  checkIn.voiceVariant = 'es-neutro';
  return checkIn;
}

describe('calidad editorial del guion', () => {
  const genOpts = { sessionProcessing: true };

  const countFocus = (checkIn: ReturnType<typeof createEmptyCheckIn>) => {
    const script = generateScript(checkIn, new Set(), genOpts);
    const focus = new Set(getFocusPhraseTexts(checkIn));
    return script.segments.filter((segment) => focus.has(segment.text)).length;
  };

  it('no lee los datos del check-in como metadatos de formulario', () => {
    for (const build of [buildCase1, buildCase2, buildCase3, buildCase8, buildCase9]) {
      const script = generateScript(build(), new Set(), genOpts);
      expect(script.fullText).not.toMatch(/contexto para comenzar/i);
      expect(script.fullText).not.toMatch(/suficiente contexto/i);
      expect(script.fullText).not.toMatch(/orienta la práctica/i);
      expect(script.fullText).not.toMatch(/sin prometer un resultado/i);
      expect(script.fullText).not.toMatch(/tu intención para esta pausa es/i);
      expect(script.fullText).not.toMatch(/ya conoces? la base de esta práctica/i);
      expect(script.fullText).not.toMatch(/eso alcanza para empezar/i);
      expect(script.fullText).not.toMatch(/lo tomamos como contexto/i);
    }
  });

  it('caso 1 integra jornada, ritmo y primera vez con voseo y cierre laboral', () => {
    const checkIn = buildCase1();
    const script = generateScript(checkIn, new Set(), genOpts);
    const texts = script.segments.map((segment) => segment.text);

    expect(isDurationWithinTolerance(script.estimatedMinutes, 3)).toBe(true);
    expect(duplicateTexts(texts)).toEqual([]);

    expect(script.fullText).toMatch(/jornada/i);
    expect(script.fullText).toMatch(/acelerado/i);
    expect(script.fullText).toMatch(/el ritmo afloje/i);
    expect(script.fullText).toMatch(/primera vez/i);
    expect(script.fullText).toMatch(/podés|dejá|tomate|permitite|buscá|contá/i);

    expect(script.fullText).not.toMatch(/contexto para comenzar/i);
    expect(script.fullText).not.toMatch(/orienta la práctica/i);
    expect(script.fullText).not.toMatch(/suficiente contexto/i);

    for (const sequence of extractWordSequences(SYNTHETIC_WORK_SITUATION)) {
      expect(script.fullText.toLowerCase()).not.toContain(sequence);
    }

    expect(texts.slice(-2).join(' ')).toMatch(
      /lo que estabas haciendo|la jornada sigue donde la dejaste/i,
    );
    expect(validateScriptQuality(script).issues).toEqual([]);
  });

  it('caso 2 sostiene atención abierta y descanso con cierre nocturno', () => {
    const checkIn = buildCase2();
    const script = generateScript(checkIn, new Set(), genOpts);
    const texts = script.segments.map((segment) => segment.text);

    expect(script.estimatedMinutes).toBeGreaterThanOrEqual(9);
    expect(script.estimatedMinutes).toBeLessThanOrEqual(11);
    expect(duplicateTexts(texts)).toEqual([]);
    expect(script.fullText).not.toMatch(ARGENTINE_MARKERS);
    expect(script.fullText.toLowerCase()).not.toContain('relájate');
    expect(script.fullText).not.toMatch(/\btú\b/);

    expect(countFocus(checkIn)).toBeGreaterThanOrEqual(8);

    expect(script.fullText).not.toMatch(/resto del día/i);
    expect(script.fullText).not.toMatch(/retomar/i);
    expect(texts.slice(-2).join(' ')).toMatch(/sueño|noche|descanso|apagando/i);

    const maxPauseCount = script.segments.filter(
      (segment) => segment.pauseAfterMs === 12000,
    ).length;
    expect(maxPauseCount * 2).toBeLessThan(script.segments.length);
    expect(validateScriptQuality(script).issues).toEqual([]);
  });

  it('caso 3 adapta experiencia básica y sostiene la autocompasión', () => {
    const checkIn = buildCase3();
    const script = generateScript(checkIn, new Set(), genOpts);

    expect(isDurationWithinTolerance(script.estimatedMinutes, 5)).toBe(true);
    expect(script.fullText).toMatch(/algo de práctica/i);
    expect(script.fullText).toMatch(/quédate con ella unos instantes/i);
    expect(script.fullText).not.toMatch(/primera vez/i);
    expect(script.fullText).not.toMatch(/práctica habitual/i);
    expect(script.fullText).not.toMatch(/ya conoces? la base de esta práctica/i);
    expect(script.usedDetails).toContain('experience');

    expect(countFocus(checkIn)).toBeGreaterThanOrEqual(4);

    expect(script.fullText).not.toContain(SYNTHETIC_ARGUMENT_STORY);
    for (const sequence of extractWordSequences(SYNTHETIC_ARGUMENT_STORY)) {
      expect(script.fullText.toLowerCase()).not.toContain(sequence);
    }
    expect(script.fullText).not.toMatch(
      /culpa|la otra persona|tu pareja|él siente|ella siente/i,
    );
    expect(validateScriptQuality(script).issues).toEqual([]);
  });

  it('caso 8 recorre el cuerpo sin nombrar la respiración', () => {
    const checkIn = buildCase8();
    const script = generateScript(checkIn, new Set(), genOpts);

    expect(isDurationWithinTolerance(script.estimatedMinutes, 5)).toBe(true);
    expect(script.fullText).not.toMatch(/respir/i);
    expect(script.fullText).not.toMatch(/inhal|exhal|aire que entra/i);
    expect(script.fullText).not.toMatch(/cargan el día entero|suelen cargar el día/i);

    const zones = [/pies/i, /piernas/i, /manos/i, /espalda/i, /rostro/i, /cadera/i];
    const zoneSegments = script.segments.filter((segment) =>
      zones.some((zone) => zone.test(segment.text)),
    );
    expect(zoneSegments.length).toBeGreaterThanOrEqual(3);

    expect(script.fullText).toMatch(/ojos abiertos/i);
    expect(script.fullText).toMatch(/ancla de atención/i);
    expect(script.fullText).toMatch(/detenerte/i);
    expect(validateScriptQuality(script).issues).toEqual([]);
  });

  it('caso 9 resuelve atención abierta con concentración sin inventar intimidad', () => {
    const checkIn = buildCase9();
    const script = generateScript(checkIn, new Set(), genOpts);

    expect(isDurationWithinTolerance(script.estimatedMinutes, 5)).toBe(true);
    expect(script.usedDetails.sort()).toEqual(
      ['experience', 'intention', 'moment', 'style'].sort(),
    );
    expect(script.usedDetails).not.toContain('recentSituation:present');
    expect(script.usedDetails).not.toContain('name');
    expect(script.usedDetails).not.toContain('perceivedState');

    expect(script.fullText).toMatch(/campo amplio|conjunto es el lugar|campo entero/i);
    expect(script.fullText).not.toMatch(
      /tu intención para esta pausa es concentrarse/i,
    );
    expect(script.fullText).not.toMatch(/no hace falta elegir un foco/i);
    expect(script.fullText).not.toMatch(/elige un solo apoyo/i);
    expect(script.fullText).not.toMatch(/reunir la atención en un solo lugar/i);
    expect(script.fullText).toMatch(/una atención amplia también concentra/i);
    expect(script.fullText).toMatch(/algo de práctica/i);
    expect(script.fullText).toMatch(/quédate con ella unos instantes/i);
    expect(script.fullText).not.toMatch(/ya conoces? la base de esta práctica/i);
    expect(script.fullText).not.toMatch(/mandíbula/i);
    expect(countFocus(checkIn)).toBeGreaterThanOrEqual(4);
    expect(validateScriptQuality(script).issues).toEqual([]);
  });

  it('la práctica central cumple el mínimo de indicaciones por duración', () => {
    const styles: MeditationStyle[] = [
      'respiracion-natural',
      'recorrido-corporal',
      'atencion-abierta',
      'autocompasion',
    ];
    const intentions: Intention[] = [
      'calmar-ritmo',
      'concentrarse',
      'descansar',
      'aceptar-emocion',
      'volver-al-cuerpo',
    ];

    for (const style of styles) {
      for (const intention of intentions) {
        for (const [duration, minimum] of [
          [5, 4],
          [10, 8],
        ] as const) {
          const checkIn = createEmptyCheckIn();
          checkIn.moment = 'ahora';
          checkIn.perceivedState = 'tranquilo';
          checkIn.intention = intention;
          checkIn.experience = 'basica';
          checkIn.style = style;
          checkIn.duration = duration;
          checkIn.voiceVariant = 'es-neutro';

          const label = `${style}/${intention}/${duration}`;
          expect(countFocus(checkIn), label).toBeGreaterThanOrEqual(minimum);
        }
      }
    }
  });

  it('mantiene tres minutos aun con todos los campos completos', () => {
    const styles: MeditationStyle[] = [
      'respiracion-natural',
      'recorrido-corporal',
      'atencion-abierta',
      'autocompasion',
    ];
    const contextSources = [
      createContextSource('manual-diary', 'Diario de hoy', 'Entrada sintética breve.', {
        selected: true,
      }),
    ];

    for (const style of styles) {
      for (const voiceVariant of ['es-AR', 'es-neutro'] as const) {
        for (const intention of ['concentrarse', 'aceptar-emocion'] as const) {
          const checkIn = createEmptyCheckIn();
          checkIn.name = 'Ana';
          checkIn.moment = 'pausa-laboral';
          checkIn.recentSituation = SYNTHETIC_WORK_SITUATION;
          checkIn.perceivedState = 'acelerado';
          checkIn.intention = intention;
          checkIn.experience = 'primera-vez';
          checkIn.style = style;
          checkIn.duration = 3;
          checkIn.voiceVariant = voiceVariant;

          const label = `${style}/${voiceVariant}/${intention}`;
          const script = generateScript(checkIn, new Set(), {
            ...genOpts,
            contextSources,
          });
          expect(
            isDurationWithinTolerance(script.estimatedMinutes, 3),
            `${label}: ${script.estimatedMinutes} min`,
          ).toBe(true);
          expect(validateScriptQuality(script).issues, label).toEqual([]);
        }
      }
    }
  });

  it('el cierre cambia según el momento del día', () => {
    const moments = [
      'ahora',
      'antes-de-dormir',
      'al-despertar',
      'pausa-laboral',
    ] as const;
    const seen = new Set<string>();

    for (const moment of moments) {
      const checkIn = createEmptyCheckIn();
      checkIn.moment = moment;
      checkIn.perceivedState = 'tranquilo';
      checkIn.intention = 'descansar';
      checkIn.experience = 'basica';
      checkIn.style = 'respiracion-natural';
      checkIn.duration = 5;
      checkIn.voiceVariant = 'es-neutro';

      const script = generateScript(checkIn, new Set(), genOpts);
      const closingText = script.segments
        .slice(-2)
        .map((segment) => segment.text)
        .join(' ');
      seen.add(closingText);

      if (moment === 'antes-de-dormir') {
        expect(closingText).not.toMatch(/resto del día|retomar|mañana empiece/i);
      }
      if (moment === 'al-despertar') {
        expect(closingText).toMatch(/mañana|luz|movimiento/i);
      }
      if (moment === 'pausa-laboral') {
        expect(closingText).toMatch(/jornada|lo que estabas haciendo|lo que viene/i);
      }
    }

    expect(seen.size).toBe(moments.length);
  });

  it('varía las pausas en lugar de repetir un mismo valor mecánico', () => {
    for (const build of [buildCase2, buildCase3, buildCase8, buildCase9]) {
      const script = generateScript(build(), new Set(), genOpts);
      const counts = new Map<number, number>();
      for (const segment of script.segments) {
        counts.set(segment.pauseAfterMs, (counts.get(segment.pauseAfterMs) ?? 0) + 1);
      }
      const mostRepeated = Math.max(...counts.values());
      expect(counts.size).toBeGreaterThanOrEqual(4);
      expect(mostRepeated).toBeLessThan(script.segments.length * 0.6);
    }
  });
});
