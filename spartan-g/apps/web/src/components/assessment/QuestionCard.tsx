import type { AssessmentQuestion } from '@spartan-g/shared-types';

interface QuestionCardProps {
  question: AssessmentQuestion;
  selectedAnswer: string | undefined;
  onAnswer: (value: string) => void;
  isDisabled?: boolean;
  /** 1-based position of this question within the current section (shown to the student). */
  questionNumber?: number;
  totalQuestions?: number;
}

/**
 * One selectable answer row, built on a native radio input so it works with the keyboard
 * (arrow keys / Tab), screen readers and the browser's form semantics.
 */
function ChoiceRow({
  name,
  value,
  label,
  checked,
  disabled,
  onSelect,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <label
      className={`flex min-h-[3.25rem] cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-medium transition-all duration-150 focus-within:ring-2 focus-within:ring-[var(--color-primary)] focus-within:ring-offset-2 ${
        checked
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-text)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-bg-alt)]'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          checked ? 'border-[var(--color-primary)]' : 'border-[var(--color-text-muted)]'
        }`}
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-primary)]" />}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
    </label>
  );
}

export function QuestionCard({
  question,
  selectedAnswer,
  onAnswer,
  isDisabled,
  questionNumber,
  totalQuestions,
}: QuestionCardProps) {
  const groupName = `question-${question.id}`;
  const number = questionNumber ?? question.order;

  function renderMultipleChoice() {
    return (
      <div className="space-y-3">
        {question.options?.map((option) => (
          <ChoiceRow
            key={option.id}
            name={groupName}
            value={option.id}
            label={option.label}
            checked={selectedAnswer === option.id}
            disabled={isDisabled}
            onSelect={onAnswer}
          />
        ))}
      </div>
    );
  }

  function renderTrueFalse() {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {['True', 'False'].map((label) => {
          const value = label.toLowerCase();
          return (
            <ChoiceRow
              key={value}
              name={groupName}
              value={value}
              label={label}
              checked={selectedAnswer === value}
              disabled={isDisabled}
              onSelect={onAnswer}
            />
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
        className="block w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:bg-[var(--color-bg-alt)]"
        aria-label="Short answer"
      />
    );
  }

  return (
    <fieldset className="m-0 min-w-0 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-card sm:p-6">
      <legend className="sr-only">{question.text}</legend>

      {/* Question header: same numbering as the progress bar (1-based) */}
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]" aria-hidden="true">
        Question {number}
        {totalQuestions ? ` of ${totalQuestions}` : ''}
      </p>

      {/* Question text */}
      <h3 className="mb-6 text-lg font-semibold leading-relaxed text-[var(--color-text)]">{question.text}</h3>

      {/* Answer input */}
      {question.type === 'multiple_choice'
        ? renderMultipleChoice()
        : question.type === 'true_false'
        ? renderTrueFalse()
        : renderShortAnswer()}
    </fieldset>
  );
}
