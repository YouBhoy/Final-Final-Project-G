import type { AssessmentQuestionDocument, AssessmentResponseValue } from "@spartan-g/shared-types";

interface TemplateQuestionCardProps {
  question: AssessmentQuestionDocument & { id: string };
  selectedAnswer: AssessmentResponseValue | undefined;
  onAnswer: (value: AssessmentResponseValue) => void;
  isDisabled?: boolean;
}

export function TemplateQuestionCard({
  question,
  selectedAnswer,
  onAnswer,
  isDisabled,
}: TemplateQuestionCardProps) {
  function renderShortText() {
    return (
      <input
        type="text"
        value={(selectedAnswer as string) ?? ""}
        onChange={(e) => onAnswer(e.target.value)}
        disabled={isDisabled}
        placeholder="Type your answer here..."
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
        aria-label="Short text answer"
      />
    );
  }

  function renderLongText() {
    return (
      <textarea
        value={(selectedAnswer as string) ?? ""}
        onChange={(e) => onAnswer(e.target.value)}
        disabled={isDisabled}
        placeholder="Type your detailed answer here..."
        rows={5}
        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
        aria-label="Long text answer"
      />
    );
  }

  function renderSingleChoice() {
    return (
      <div className="space-y-3">
        {question.options?.map((option, idx) => {
          const isSelected = selectedAnswer === option;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onAnswer(option)}
              disabled={isDisabled}
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-all ${
                isSelected
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-600"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
              aria-pressed={isSelected}
            >
              <span
                className={`mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-300 text-gray-500"
                }`}
              >
                {String.fromCharCode(65 + idx)}
              </span>
              {option}
            </button>
          );
        })}
      </div>
    );
  }

  function renderMultiChoice() {
    const selectedArray: string[] = Array.isArray(selectedAnswer)
      ? selectedAnswer
      : selectedAnswer
      ? [selectedAnswer as string]
      : [];

    function toggleOption(option: string) {
      const exists = selectedArray.includes(option);
      const updated = exists
        ? selectedArray.filter((o) => o !== option)
        : [...selectedArray, option];
      onAnswer(updated);
    }

    return (
      <div className="space-y-3">
        {question.options?.map((option, idx) => {
          const isSelected = selectedArray.includes(option);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => toggleOption(option)}
              disabled={isDisabled}
              className={`w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-all ${
                isSelected
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-600"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
              aria-pressed={isSelected}
            >
              <span
                className={`mr-3 inline-flex h-6 w-6 items-center justify-center rounded border text-xs font-semibold ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-300 text-gray-500"
                }`}
              >
                ✓
              </span>
              {option}
            </button>
          );
        })}
      </div>
    );
  }

  function renderScale(max: number) {
    return (
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: max }, (_, i) => i + 1).map((value) => {
          const strValue = String(value);
          const isSelected = selectedAnswer === strValue;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onAnswer(strValue)}
              disabled={isDisabled}
              className={`flex h-12 w-12 items-center justify-center rounded-lg border text-base font-semibold transition-all ${
                isSelected
                  ? "border-indigo-600 bg-indigo-600 text-white ring-2 ring-indigo-600"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              } disabled:opacity-60 disabled:cursor-not-allowed`}
              aria-pressed={isSelected}
            >
              {value}
            </button>
          );
        })}
      </div>
    );
  }

  function renderYesNo() {
    return (
      <div className="flex gap-4">
        {["Yes", "No"].map((label) => {
          const isSelected = selectedAnswer === label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onAnswer(label)}
              disabled={isDisabled}
              className={`flex-1 rounded-lg border px-6 py-4 text-center text-base font-semibold transition-all ${
                isSelected
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-600"
                  : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
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

  const typeLabel: Record<string, string> = {
    short_text: "Short text",
    long_text: "Long text",
    single_choice: "Single choice",
    multi_choice: "Multi choice",
    scale_1_5: "Scale 1–5",
    scale_1_10: "Scale 1–10",
    yes_no: "Yes / No",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* Question header */}
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Question {question.order}
        </span>
        <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
          {typeLabel[question.type] ?? question.type}
        </span>
      </div>

      {/* Question prompt */}
      <h3 className="mb-6 text-lg font-semibold leading-relaxed text-gray-900">
        {question.prompt}
      </h3>

      {/* Answer input */}
      {question.type === "short_text"
        ? renderShortText()
        : question.type === "long_text"
        ? renderLongText()
        : question.type === "single_choice"
        ? renderSingleChoice()
        : question.type === "multi_choice"
        ? renderMultiChoice()
        : question.type === "scale_1_5"
        ? renderScale(5)
        : question.type === "scale_1_10"
        ? renderScale(10)
        : question.type === "yes_no"
        ? renderYesNo()
        : null}
    </div>
  );
}