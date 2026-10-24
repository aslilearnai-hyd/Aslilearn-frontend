import { Fragment } from 'react';
import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { formatClassroomScienceText } from '@/lib/exam-text-normalize';

type Props = { text: string; className?: string };

const MATH_SEGMENTS = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;

const MATH_FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lim', 'max', 'min', 'exp', 'det', 'gcd', 'deg', 'arg', 'mod']);
const SHORT_WORDS = new Set(['of', 'is', 'at', 'in', 'on', 'to', 'be', 'by', 'an', 'as', 'if', 'or', 'so', 'it', 'we']);

/**
 * Word equations and uploaded papers often put ordinary words inside $…$
 * ("$Find a + b.$", "$x-$axis"). KaTeX drops spaces in maths, so the words
 * ran together. Words of 3+ letters (and common short words) become \text{…}
 * with their spaces kept; single letters stay maths variables.
 */
export function keepWordsSpacedInMath(expression: string): string {
  return expression.replace(/(\s*)\b([A-Za-z]{2,})\b(\s*)/g, (match, lead: string, word: string, trail: string, offset: number, all: string) => {
    const before = all[offset + lead.length - 1];
    if (before === '\\' || before === '{') return match;
    const lower = word.toLowerCase();
    const isWord = (word.length >= 3 && !MATH_FUNCTIONS.has(lower)) || SHORT_WORDS.has(lower);
    if (!isWord) return match;
    return `\\text{${lead ? ' ' : ''}${word}${trail ? ' ' : ''}}`;
  });
}

export default function ExamMathText({ text, className }: Props) {
  // V2/six-section records frequently contain classroom ASCII such as
  // `sqrt(144)` and `x^2` outside LaTeX delimiters.  The legacy exam viewer
  // already normalises that text, but this shared renderer previously did not,
  // so the same saved question rendered differently depending on its viewer.
  const displayText = formatClassroomScienceText(text);
  const parts = displayText.split(MATH_SEGMENTS).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        const dollarMath = part.startsWith('$') && part.endsWith('$');
        const parenMath = part.startsWith('\\(') && part.endsWith('\\)');
        const bracketMath = part.startsWith('\\[') && part.endsWith('\\]');
        if (!dollarMath && !parenMath && !bracketMath) return <Fragment key={index}>{part}</Fragment>;
        const expression = dollarMath
          ? part.replace(/^\$\$?/, '').replace(/\$\$?$/, '')
          : part.slice(2, -2);
        return <InlineMath key={index} math={keepWordsSpacedInMath(expression)} renderError={() => <>{expression}</>} />;
      })}
    </span>
  );
}
