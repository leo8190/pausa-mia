import type { AppStep } from '../types';
import {
  FLOW_STEP_TOTAL,
  flowProgressPercent,
  getFlowStepInfo,
} from '../lib/stepProgress';

interface StepProgressProps {
  step: AppStep;
}

/**
 * Indicador compacto del recorrido guiado.
 * Se oculta en bienvenida y sesión borrada; usa semántica de progreso accesible.
 */
export function StepProgress({ step }: StepProgressProps) {
  const info = getFlowStepInfo(step);
  if (info.hideProgress) return null;

  const pct = flowProgressPercent(info.index);
  const valueText = `${info.label}, paso ${info.index} de ${FLOW_STEP_TOTAL}`;
  const fillClass = info.isBranch
    ? 'progress-fill progress-fill--branch'
    : 'progress-fill';

  return (
    <nav className="progress" aria-label="Progreso de la pausa">
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={FLOW_STEP_TOTAL}
        aria-valuenow={info.index}
        aria-valuetext={valueText}
      >
        <div className={fillClass} style={{ width: `${pct}%` }} aria-hidden="true" />
      </div>
      <p className="progress-label">
        <span aria-current="step">{info.label}</span>
        {' · '}
        paso {info.index} de {FLOW_STEP_TOTAL}
      </p>
    </nav>
  );
}
