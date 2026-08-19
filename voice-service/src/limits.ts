export type JsonErrorBody = {
  error: string;
  code: string;
};

export function jsonError(code: string, error: string): JsonErrorBody {
  return { error, code };
}

export function validateText(
  text: unknown,
  maxChars: number,
): { ok: true; text: string } | { ok: false; body: JsonErrorBody } {
  if (typeof text !== 'string') {
    return { ok: false, body: jsonError('invalid_body', 'Se espera JSON { "text": string }.') };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, body: jsonError('empty_text', 'El texto está vacío.') };
  }
  if (trimmed.length > maxChars) {
    return {
      ok: false,
      body: jsonError(
        'text_too_long',
        `El texto supera el límite de ${maxChars} caracteres.`,
      ),
    };
  }
  return { ok: true, text: trimmed };
}
