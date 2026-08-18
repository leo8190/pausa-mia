/**
 * Frase categórica para reconocer presencia de situación reciente
 * sin insertar ni parafrasear texto libre del usuario.
 */
export function buildSituationRecognitionPhrase(
  variant: 'es-AR' | 'es-neutro',
): string {
  if (variant === 'es-AR') {
    return 'Traés una situación reciente que elegiste tener en cuenta. No hace falta nombrarla ni resolverla durante esta pausa.';
  }
  return 'Traes una situación reciente que elegiste tener en cuenta. No hace falta nombrarla ni resolverla durante esta pausa.';
}
