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

  // Previous / jump-to / Next keep fixed positions: Previous is disabled (not removed) on the first question.
  return (
    <nav
      aria-label="Question navigation"
      className="grid grid-cols-2 items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 shadow-card sm:grid-cols-[1fr_auto_1fr] sm:px-6"
    >
      <div className="order-2 sm:order-none">
        <Button variant="outline" onClick={onPrevious} disabled={isFirstStep} className="w-full sm:w-auto">
          Previous
        </Button>
      </div>

      {hasDropdown ? (
        <div className="order-1 col-span-2 flex items-center justify-center gap-2 sm:order-none sm:col-span-1">
          <label htmlFor="question-nav" className="text-sm text-[var(--color-text-secondary)]">
            Question:
          </label>
          <select
            id="question-nav"
            value={currentStep}
            onChange={(e) => onNavigateToQuestion(Number(e.target.value))}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] shadow-sm transition-all duration-150 hover:border-[var(--color-primary)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2"
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
          <span className="text-sm text-[var(--color-text-secondary)]">of {totalSteps}</span>
        </div>
      ) : (
        <div className="order-1 col-span-2 text-center text-sm text-[var(--color-text-secondary)] sm:order-none sm:col-span-1">
          {currentStep + 1} / {totalSteps}
        </div>
      )}

      <div className="order-3 flex justify-end sm:order-none">
        <Button variant="primary" onClick={onNext} className="w-full sm:w-auto">
          {isLastStep ? 'Review Answers' : 'Next'}
        </Button>
      </div>
    </nav>
  );
}
