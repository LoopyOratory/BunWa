/**
 * Guided prompt builder.
 *
 * The admin can either paste a finished prompt or answer a short set of
 * questions. The answers are composed into a deterministic prompt so the
 * result is editable and reviewable before the agent is created.
 */

export interface BuilderQuestion {
  id: string;
  question: string;
  hint?: string;
  required?: boolean;
}

export const BUILDER_QUESTIONS: BuilderQuestion[] = [
  {
    id: 'name',
    question: 'What is the agent called?',
    hint: 'A short display name, e.g. “Vei’s Support”.',
    required: true,
  },
  {
    id: 'role',
    question: 'What does it do in one sentence?',
    hint: 'e.g. “Helps customers choose the right product and place an order.”',
    required: true,
  },
  {
    id: 'audience',
    question: 'Who is it talking to?',
    hint: 'e.g. “New customers on WhatsApp in Ghana.”',
    required: true,
  },
  {
    id: 'tone',
    question: 'What tone should it use?',
    hint: 'e.g. “Warm, direct, and never pushy.”',
    required: true,
  },
  {
    id: 'goals',
    question: 'What are the top three things it should achieve?',
    hint: 'One per line is fine.',
    required: true,
  },
  {
    id: 'boundaries',
    question: 'What must it never do?',
    hint: 'e.g. “Never invent prices or promise delivery dates.”',
  },
  {
    id: 'fallback',
    question: 'What should it say when it does not know?',
    hint: 'e.g. “I’ll check with the team and come back to you.”',
  },
  {
    id: 'language',
    question: 'Which language or languages should it speak?',
    hint: 'e.g. “English, with Ghanaian phrasing.”',
  },
];

export interface BuilderAnswers {
  name?: string;
  role?: string;
  audience?: string;
  tone?: string;
  goals?: string;
  boundaries?: string;
  fallback?: string;
  language?: string;
}

function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

export function composePrompt(answers: BuilderAnswers): string {
  const name = clean(answers.name) || 'the assistant';
  const role = clean(answers.role) || 'help the person on the other end';
  const audience = clean(answers.audience) || 'customers';
  const tone = clean(answers.tone) || 'warm, clear, and concise';
  const goals = clean(answers.goals);
  const boundaries = clean(answers.boundaries);
  const fallback = clean(answers.fallback) || 'I’ll check with the team and come back to you.';
  const language = clean(answers.language) || 'English';

  const lines = [
    `You are ${name}.`,
    `You ${role}.`,
    `You are speaking to ${audience}.`,
    `Use a ${tone} tone.`,
    `Always respond in ${language}.`,
  ];

  if (goals) {
    lines.push('', 'Your priorities:');
    for (const goal of goals.split(/\n+/).map((line) => line.replace(/^[-*]\s*/, '').trim()).filter(Boolean)) {
      lines.push(`- ${goal}`);
    }
  }

  if (boundaries) {
    lines.push('', 'Never do this:');
    for (const boundary of boundaries.split(/\n+/).map((line) => line.replace(/^[-*]\s*/, '').trim()).filter(Boolean)) {
      lines.push(`- ${boundary}`);
    }
  }

  lines.push(
    '',
    `If you do not know something, say: “${fallback}”`,
    'Keep replies short enough to be spoken naturally. Never use markdown, bullet points, or emoji in a voice call.',
  );

  return lines.join('\n');
}

export function nextQuestion(answers: BuilderAnswers): BuilderQuestion | null {
  for (const question of BUILDER_QUESTIONS) {
    const value = answers[question.id as keyof BuilderAnswers];
    if (question.required && !clean(value)) return question;
  }
  return null;
}

export function isComplete(answers: BuilderAnswers): boolean {
  return nextQuestion(answers) === null;
}
