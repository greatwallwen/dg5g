import type { Activity, ActivityQuestion, Task } from '@/platform/models';

export function questionsForActivity(activity: Activity | undefined, task: Task): ActivityQuestion[] {
  if (activity?.questions?.length) return activity.questions;
  const activityId = activity?.activityId ?? task.taskId;
  return [
    {
      id: `${activityId}-q1`,
      type: 'single-choice',
      prompt: '本页判断优先依赖哪类证据？',
      options: [task.evidenceFrom, '只看口头描述', '等待教师补充', '不需要现场证据'],
      correctAnswer: task.evidenceFrom,
      explanation: '先确认可复核的证据来源，后续判断才有依据。',
    },
    {
      id: `${activityId}-q2`,
      type: 'true-false',
      prompt: `判断：证据应能支撑“${task.conclusion}”。`,
      options: ['正确', '错误'],
      correctAnswer: '正确',
      explanation: '教材练习优先使用选择题和判断题，确保反馈及时且可评分。',
    },
    {
      id: `${activityId}-q3`,
      type: 'single-choice',
      prompt: '哪一项最适合作为可交付结论？',
      options: [task.conclusion, '资料已经看过，可以继续', '现场情况比较复杂', '等待下一页再判断'],
      correctAnswer: task.conclusion,
      explanation: '结论要能直接进入复核或课堂讲评。',
    },
  ];
}

export function buildAnswerSlots(count: number, values?: string[]) {
  return Array.from({ length: count }, (_, index) => values?.[index] ?? '');
}

export function updateAnswerSlot(values: string[], count: number, index: number, value: string) {
  const next = buildAnswerSlots(count, values);
  next[index] = value;
  return next;
}

export function answerProgress(answers: string[]) {
  return answers.filter((item) => item.trim()).length;
}

export function gradeActivityAnswers(questions: ActivityQuestion[], answers: string[]) {
  const results = questions.map((question, index) => {
    const answer = answers[index]?.trim() ?? '';
    const correct = Boolean(answer && question.correctAnswer && answer === question.correctAnswer);
    return { questionId: question.id, answer, correct };
  });
  const answeredCount = results.filter((item) => item.answer).length;
  const correctCount = results.filter((item) => item.correct).length;
  const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
  return { answeredCount, correctCount, score, results };
}
