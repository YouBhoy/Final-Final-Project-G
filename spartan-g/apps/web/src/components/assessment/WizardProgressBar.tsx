interface WizardProgressBarProps {
  currentStep: number;
  totalSteps: number;
  answeredCount?: number;
}

export function WizardProgressBar({ currentStep, totalSteps, answeredCount }: WizardProgressBarProps) {
  const percentage = totalSteps > 0
    ? Math.round(((answeredCount ?? currentStep + 1) / totalSteps) * 100)
    : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text)]">
          Question {currentStep + 1} of {totalSteps}
        </span>
        <span className="text-sm text-[var(--color-text-muted)]">{percentage}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Question ${currentStep + 1} of ${totalSteps}`}
      >
        <div
          className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300 ease-in-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}