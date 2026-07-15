import { Button } from '../ui/Button';

interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  questions?: Array<{ id: string; text: string }>;
  answers?: Record<string, string>;
  onNavigateToQuestion?: (step: number) => void;
}

export function WizardNavigation({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  isFirstStep,
  isLastStep,
  questions,
  answers,
  onNavigateToQuestion,
}: WizardNavigationProps) {
  const hasDropdown = questions && questions.length > 0 && onNavigateToQuestion;

  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
      <div>
        {!isFirstStep && (
          <Button variant="outline" onClick={onPrevious}>
            Previous
          </Button>
        )}
      </div>

      {hasDropdown ? (
        <div className="flex items-center gap-2">
          <label htmlFor="question-nav" className="text-sm text-gray-500">
            Question:
          </label>
          <select
            id="question-nav"
            value={currentStep}
            onChange={(e) => onNavigateToQuestion(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:border-indigo-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {questions.map((q, idx) => {
              const isAnswered = answers?.[q.id] !== undefined && answers?.[q.id] !== '';
              
              return (
                <option key={q.id} value={idx}>
                  {idx + 1}{isAnswered ? ' ✓' : ''}
                </option>
              );
            })}
          </select>
          <span className="text-sm text-gray-500">of {totalSteps}</span>
        </div>
      ) : (
        <div className="text-sm text-gray-500">
          {currentStep + 1} / {totalSteps}
        </div>
      )}

      <Button variant="primary" onClick={onNext}>
        {isLastStep ? 'Review Answers' : 'Next'}
      </Button>
    </div>
  );
}
