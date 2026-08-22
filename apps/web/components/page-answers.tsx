import { AnswerSection } from '@/components/answer-section';
import { JsonLd } from '@/components/json-ld';
import { getAnswersForPath } from '@/lib/content/answers/registry';
import { buildFaqPageJsonLd } from '@/lib/structured-data/builders';

interface PageAnswersProps {
  path: string;
  title?: string;
}

export function PageAnswers({ path, title }: PageAnswersProps) {
  const answers = getAnswersForPath(path);
  const faqJsonLd = buildFaqPageJsonLd(answers, path);

  return (
    <>
      {faqJsonLd ? <JsonLd data={faqJsonLd} /> : null}
      <AnswerSection title={title} answers={answers} />
    </>
  );
}
