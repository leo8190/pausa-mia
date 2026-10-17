import { useEffect } from 'react';
import type { AppStep } from '../types';
import { DEFAULT_DOCUMENT_TITLE, getFlowStepInfo } from '../lib/stepProgress';

/** Sincroniza `document.title` con el paso actual del flujo guiado. */
export function useDocumentTitle(step: AppStep): void {
  useEffect(() => {
    const { documentTitle } = getFlowStepInfo(step);
    document.title = documentTitle;
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, [step]);
}
