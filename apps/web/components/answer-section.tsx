import type { AnswerEntry } from '@/lib/content/answers/types';

interface AnswerSectionProps {
  title?: string;
  answers: readonly AnswerEntry[];
}

export function AnswerSection({ title = 'Common questions', answers }: AnswerSectionProps) {
  if (answers.length === 0) {
    return null;
  }

  return (
    <section
      className="mx-auto max-w-3xl px-6 py-16 lg:px-8"
      aria-labelledby="answer-section-heading"
    >
      <h2 id="answer-section-heading" className="text-2xl font-bold text-tamiym-blue">
        {title}
      </h2>
      <dl className="mt-8 space-y-8">
        {answers.map((answer) => (
          <div key={answer.id} data-answer-id={answer.id} data-evidence-owner={answer.owner}>
            <dt className="text-lg font-semibold text-tamiym-blue">{answer.question}</dt>
            <dd className="mt-2 space-y-2 text-sm leading-relaxed text-black">
              <p>{answer.directAnswer}</p>
              {answer.details?.map((detail) => (
                <p key={detail}>{detail}</p>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
