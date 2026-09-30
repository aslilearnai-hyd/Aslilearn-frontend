export interface PracticeTest {
  id?: string;
  title: string;
  description?: string;
  examType: string;
  difficulty?: string;
  duration: number;
  totalQuestions: number;
}

export interface Question {
  id?: string;
  questionText: string;
  options?: string[];
  difficulty?: string;
}

export interface TestAttempt {
  id?: string;
  score: number;
  totalQuestions: number;
  timeSpent?: number;
  completedAt?: string | Date;
  responses?: unknown[];
  analysis?: {
    subjectWise: Array<{ subjectId: string; correct: number; total: number }>;
    topicWise: Array<{ topicId: string; correct: number; total: number }>;
  };
}
