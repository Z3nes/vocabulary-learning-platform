export const practiceTypes = ['written-recall', 'listening'] as const;
export type PracticeType = (typeof practiceTypes)[number];
