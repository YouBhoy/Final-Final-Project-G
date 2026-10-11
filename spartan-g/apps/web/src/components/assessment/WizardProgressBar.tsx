interface WizardProgressBarProps {
  currentStep: number;
  totalSteps: number;
  /** Number of questions answered in this section. Completion is based on this, not on the current position. */
  answeredCount?: number;
}

export function WizardProgressBar({ currentStep, totalSteps, answeredCount = 0 }: WizardProgressBarProps) {
  const answered = Math.min(answeredCount, totalSteps);
  const percentage = totalSteps > 0 ? Math.round((answered / totalSteps) * 100) : 0;
  const position = Math.min(currentStep + 1, totalSteps);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium text-[var(--color-text)]">
          Question {position} of {totalSteps}
        </span>
        <span className="text-sm text-[var(--color-text-muted)]">
          {answered} of {totalSteps} answered · {percentage}% complete
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${answered} of ${totalSteps} questions answered`}
      >
        <div
          className="h-full rounded-full bg-[var(--color-primary)] transition-all duration-300 ease-in-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
