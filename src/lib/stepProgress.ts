import type { AppStep } from '../types';

/** Pasos principales del flujo guiado (orden de descubrimiento). */
export const FLOW_STEP_TOTAL = 8;

export const DEFAULT_DOCUMENT_TITLE = 'Pausa Mía · Meditación a Medida';

export interface FlowStepInfo {
  /** Índice 1-based dentro del flujo principal (1…FLOW_STEP_TOTAL). */
  index: number;
  /** Etiqueta corta en español para la UI de progreso. */
  label: string;
  /** Título de documento para lectores de pantalla / pestaña. */
  documentTitle: string;
  /** Rama de seguridad u otro desvío (estilo visual distinto). */
  isBranch?: boolean;
  /** Ocultar el indicador compacto (bienvenida y borrado). */
  hideProgress?: boolean;
}

/**
 * Mapea cada AppStep al progreso esperado:
 * Bienvenida → Permiso → Tu pausa → Contexto → Resumen → Revisar → Escuchar → Cierre.
 * ai-consent y safety se anclan cerca de Resumen; no inventan pasos extra en el contador.
 */
export function getFlowStepInfo(step: AppStep): FlowStepInfo {
  switch (step) {
    case 'welcome':
      return {
        index: 1,
        label: 'Bienvenida',
        documentTitle: DEFAULT_DOCUMENT_TITLE,
        hideProgress: true,
      };
    case 'consent':
      return {
        index: 2,
        label: 'Permiso',
        documentTitle: 'Permiso · Pausa Mía',
      };
    case 'checkin':
      return {
        index: 3,
        label: 'Tu pausa',
        documentTitle: 'Tu pausa · Pausa Mía',
      };
    case 'context':
      return {
        index: 4,
        label: 'Contexto',
        documentTitle: 'Contexto · Pausa Mía',
      };
    case 'summary':
      return {
        index: 5,
        label: 'Resumen',
        documentTitle: 'Resumen · Pausa Mía',
      };
    case 'ai-consent':
      return {
        index: 5,
        label: 'Resumen',
        documentTitle: 'Resumen · Pausa Mía',
      };
    case 'safety':
      return {
        index: 5,
        label: 'Aviso',
        documentTitle: 'Aviso · Pausa Mía',
        isBranch: true,
      };
    case 'review':
      return {
        index: 6,
        label: 'Revisar',
        documentTitle: 'Revisar · Pausa Mía',
      };
    case 'playback':
      return {
        index: 7,
        label: 'Escuchar',
        documentTitle: 'Escuchar · Pausa Mía',
      };
    case 'feedback':
      return {
        index: 8,
        label: 'Cierre',
        documentTitle: 'Cierre · Pausa Mía',
      };
    case 'deleted':
      return {
        index: 8,
        label: 'Sesión borrada',
        documentTitle: 'Sesión borrada · Pausa Mía',
        hideProgress: true,
      };
  }
}

export function flowProgressPercent(index: number): number {
  const clamped = Math.min(FLOW_STEP_TOTAL, Math.max(1, index));
  return Math.round((clamped / FLOW_STEP_TOTAL) * 100);
}
