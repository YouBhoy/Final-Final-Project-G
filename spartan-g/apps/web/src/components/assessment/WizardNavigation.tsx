import { Button } from '../ui/Button';

interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export function WizardNavigation({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  isFirstStep,
  isLastStep,
}: WizardNavigationProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
      <div>
        {!isFirstStep && (
          <Button variant="outline" onClick={onPrevious}>
            Previous
          </Button>
        )}
      </div>

      <div className="text-sm text-gray-500">
        {currentStep + 1} / {totalSteps}
      </div>

      <Button variant="primary" onClick={onNext}>
        {isLastStep ? 'Review Answers' : 'Next'}
      </Button>
    </div>
  );
}