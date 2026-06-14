import { Button } from '../ui/Button';
import type { AssessmentQuestion } from '@spartan-g/shared-types';

interface ReviewScreenProps {
  title: string;
  questions: AssessmentQuestion[];
  answers: Record<string, string>;
  onNavigateToQuestion: (step: number) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function ReviewScreen({
  title,
  questions,
  answers,
  onNavigateToQuestion,
  onSubmit,
  isSubmitting,
}: ReviewScreenProps) {
  const answeredCount = questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== '').length;
  const totalCount = questions.length;
  const hasUnanswered = answeredCount < totalCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Review Your Answers</h2>
        <p className="mt-1 text-sm text-gray-500">{title}</p>
        <div className="mt-3 flex items-center gap-2">
          <span className={`text-sm font-semibold ${hasUnanswered ? 'text-red-600' : 'text-green-600'}`}>
            {answeredCount} of {totalCount} answered
          </span>
          {hasUnanswered && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {totalCount - answeredCount} unanswered
            </span>
          )}
        </div>
      </div>

      {/* Question review list */}
      <div className="space-y-3">
        {questions.map((question, index) => {
          const answer = answers[question.id];
          const isAnswered = answer !== undefined && answer !== '';

          return (
            <div
              key={question.id}
              className={`rounded-xl border p-4 shadow-sm ${
                isAnswered ? 'border-gray-200 bg-white' : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Q{question.order}
                    </span>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {question.points} pts
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-gray-900">{question.text}</p>
                  <p className={`mt-1 text-sm ${isAnswered ? 'text-gray-600' : 'font-semibold text-red-600'}`}>
                    {isAnswered ? `Answer: ${answer}` : 'No answer'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateToQuestion(index)}
                  className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  Change
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Warning and submit */}
      {hasUnanswered && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          You have unanswered questions. You can still submit, but unanswered questions will receive no points.
        </div>
      )}

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={onSubmit}
        isLoading={isSubmitting}
      >
        Submit Assessment
      </Button>
    </div>
  );
}