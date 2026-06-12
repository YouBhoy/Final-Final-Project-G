import type { AssessmentQuestion } from '@spartan-g/shared-types';

interface QuestionCardProps {
  question: AssessmentQuestion;
  selectedAnswer: string | undefined;
  onAnswer: (value: string) => void;
  isDisabled?: boolean;
}

export function QuestionCard({ question, selectedAnswer, onAnswer, isDisabled }: QuestionCardProps) {
  function renderMultipleChoice() {
    return (
      <div className="space-y-3">
        {question.options?.map((option) => {
          const isSelected = selectedAnswer === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onAnswer(option.id)}
              disabled={isDisabled}
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-all ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-600'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
              aria-pressed={isSelected}
            >
              <span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-300 text-gray-500'
              }">
                {option.id.toUpperCase()}
              </span>
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderTrueFalse() {
    return (
      <div className="flex gap-4">
        {['True', 'False'].map((label) => {
          const value = label.toLowerCase();
          const isSelected = selectedAnswer === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onAnswer(value)}
              disabled={isDisabled}
              className={`flex-1 rounded-lg border px-6 py-4 text-center text-base font-semibold transition-all ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-600'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
              aria-pressed={isSelected}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderShortAnswer() {
    return (
      <textarea
        value={selectedAnswer ?? ''}
        onChange={(e) => onAnswer(e.target.value)}
        disabled={isDisabled}
        placeholder="Type your answer here..."
        rows={4}
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
        aria-label="Short answer"
      />
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* Question header */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Question {question.order}
        </span>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
          {question.points} {question.points === 1 ? 'point' : 'points'}
        </span>
      </div>

      {/* Question text */}
      <h3 className="mb-6 text-lg font-semibold leading-relaxed text-gray-900">
        {question.text}
      </h3>

      {/* Answer input */}
      {question.type === 'multiple_choice'
        ? renderMultipleChoice()
        : question.type === 'true_false'
        ? renderTrueFalse()
        : renderShortAnswer()}
    </div>
  );
}