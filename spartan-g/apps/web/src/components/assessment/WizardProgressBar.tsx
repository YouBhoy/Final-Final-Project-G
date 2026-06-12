interface WizardProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

export function WizardProgressBar({ currentStep, totalSteps }: WizardProgressBarProps) {
  const percentage = totalSteps > 0 ? Math.round(((currentStep + 1) / totalSteps) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">
          Question {currentStep + 1} of {totalSteps}
        </span>
        <span className="text-sm text-gray-500">{percentage}% complete</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-gray-200"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Question ${currentStep + 1} of ${totalSteps}`}
      >
        <div
          className="h-full rounded-full bg-indigo-600 transition-all duration-300 ease-in-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}