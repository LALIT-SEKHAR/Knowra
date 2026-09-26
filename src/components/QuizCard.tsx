import { useState } from 'react';
import clsx from 'clsx';
import { api, ApiError } from '../services/api';
import type { TutorQuiz } from '../types';

type QuizCardProps = {
  quiz: TutorQuiz;
  onScored: (quiz: TutorQuiz) => void;
};

export function QuizCard({ quiz, onScored }: QuizCardProps) {
  const scored = quiz.attempt;
  const [picks, setPicks] = useState<number[]>(() =>
    scored ? scored.answers : quiz.questions.map(() => -1),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = picks.every((pick) => pick >= 0);

  async function onSubmit() {
    if (!ready || scored || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.submitQuiz(quiz.id, picks);
      onScored(res.quiz);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not score this quiz.');
    } finally {
      setBusy(false);
    }
  }

  const focus = scored?.focus.filter((topic) => topic.misses > 0) ?? [];

  return (
    <section className="mt-3 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-[var(--color-ink-muted)]">Quiz</p>
      <h3 className="mt-1 text-sm font-medium text-[var(--color-ink)]">{quiz.title}</h3>
      <ol className="mt-3 space-y-4">
        {quiz.questions.map((question, index) => {
          const result = scored?.results[index];
          return (
            <li key={`${quiz.id}-${index}`}>
              <p className="text-sm text-[var(--color-ink)]">
                {index + 1}. {question.prompt}
              </p>
              <div className="mt-2 space-y-1.5" role="group" aria-label={`Question ${index + 1}`}>
                {question.choices.map((choice, choiceIndex) => {
                  const selected = picks[index] === choiceIndex;
                  const isAnswer = Boolean(result && choiceIndex === result.correctIndex);
                  const missed = Boolean(result && selected && !result.correct);
                  return (
                    <label
                      key={`${index}-${choiceIndex}`}
                      className={clsx(
                        'flex items-start gap-2 rounded-[12px] border px-2.5 py-2 text-sm',
                        isAnswer && 'border-[var(--color-ink)] bg-[var(--color-accent-soft)]',
                        missed && 'border-[var(--color-danger)]',
                        !isAnswer && !missed && 'border-[var(--color-line)]',
                        !scored && 'cursor-pointer',
                      )}
                    >
                      <input
                        type="radio"
                        className="mt-1"
                        name={`${quiz.id}-${index}`}
                        checked={selected}
                        disabled={Boolean(scored) || busy}
                        onChange={() =>
                          setPicks((current) =>
                            current.map((pick, pickIndex) => (pickIndex === index ? choiceIndex : pick)),
                          )
                        }
                      />
                      <span>{choice}</span>
                    </label>
                  );
                })}
              </div>
              {result ? (
                <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                  {result.correct ? 'Correct. ' : 'Not quite. '}
                  {result.explanation}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {scored ? (
        <div className="mt-4 text-sm">
          <p className="font-medium">
            {scored.correctCount} of {scored.total} correct
          </p>
          {focus.length ? (
            <p className="mt-1 text-[var(--color-ink-muted)]">
              Practice next: {focus.map((topic) => topic.topic).join(', ')}
            </p>
          ) : (
            <p className="mt-1 text-[var(--color-ink-muted)]">These topics are in good shape.</p>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {error ? <p className="mb-2 text-sm text-[var(--color-danger)]">{error}</p> : null}
          <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={() => void onSubmit()}>
            {busy ? 'Checking…' : 'Check answers'}
          </button>
        </div>
      )}
    </section>
  );
}
