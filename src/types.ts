export interface Question {
  id: string;
  source: string; // e.g., "Past Paper Nov 2023", "RTP May 2024"
  text: string;
  correctAnswerHeading: string;
  keywords: string[];
  repetitionCount: number;
  isExactRepetition: boolean;
  chapterName?: string;
}

export interface StudySession {
  chapterName: string;
  questions: Question[];
  currentQuestionIndex: number;
}
