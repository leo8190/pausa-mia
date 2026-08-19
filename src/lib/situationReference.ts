/**
 * Frase categórica para reconocer presencia de situación reciente
 * sin insertar ni parafrasear texto libre del usuario.
 */
export function buildSituationRecognitionPhrase(
  variant: 'es-AR' | 'es-neutro',
): string {
  if (variant === 'es-AR') {
    return 'Hay algo reciente que todavía ocupa espacio. No hace falta contarlo de nuevo ni resolverlo durante esta pausa.';
  }
  return 'Hay algo reciente que todavía ocupa espacio. No hace falta contarlo de nuevo ni resolverlo durante esta pausa.';
}
