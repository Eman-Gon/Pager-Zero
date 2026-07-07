import { useEffect, useState, type ReactNode } from 'react';

export type StepState = 'pending' | 'active' | 'done' | 'error';

export interface ProgressStep {
  id: string;
  label: string;
  detail: string;
}

interface ActionProgressProps {
  steps: ProgressStep[];
  active: boolean;
  done?: boolean;
  error?: boolean;
  title?: string;
}

export function ActionProgress({ steps, active, done, error, title }: ActionProgressProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setActiveIdx(0);
      setElapsed(0);
      return;
    }
    const t0 = Date.now();
    const tick = setInterval(() => setElapsed(Date.now() - t0), 250);
    const advance = setInterval(() => {
      setActiveIdx((i) => Math.min(i + 1, steps.length - 1));
    }, 2800);
    return () => {
      clearInterval(tick);
      clearInterval(advance);
    };
  }, [active, steps.length]);

  if (!active && !done) return null;

  const states: StepState[] = steps.map((_, i) => {
    if (error && i === activeIdx) return 'error';
    if (done) return 'done';
    if (i < activeIdx) return 'done';
    if (i === activeIdx) return active ? 'active' : 'done';
    return 'pending';
  });

  const pct = done ? 100 : Math.round(((activeIdx + 0.35) / steps.length) * 100);

  return (
    <div className={`action-progress ${active ? 'action-progress-live' : ''}`}>
      {title && <div className="action-progress-title">{title}</div>}
      <div className="progress-bar-track">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-meta">
        <span className="spinner" aria-hidden />
        {active ? `Running… ${(elapsed / 1000).toFixed(1)}s` : done ? 'Complete' : ''}
      </div>
      <ol className="step-list">
        {steps.map((step, i) => (
          <li key={step.id} className={`step-item step-${states[i]}`}>
            <span className="step-icon">
              {states[i] === 'done' && '✓'}
              {states[i] === 'active' && '●'}
              {states[i] === 'pending' && '○'}
              {states[i] === 'error' && '✕'}
            </span>
            <span className="step-body">
              <span className="step-label">{step.label}</span>
              <span className="step-detail">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ResultBadge({
  kind,
  children,
}: {
  kind: 'ok' | 'warn' | 'bad' | 'info';
  children: ReactNode;
}) {
  return <span className={`result-badge result-${kind}`}>{children}</span>;
}
