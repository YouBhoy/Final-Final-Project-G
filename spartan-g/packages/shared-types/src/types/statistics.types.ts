export interface StatisticsFilters {
  startDate: string;
  endDate: string;
  campus: string;
  assessmentId: string;
  interval: 'weekly' | 'monthly';
}
export interface ParticipationSummary {
  participants: number;
  appointmentStudents: number;
  messagingStudents: number;
  assessmentStudents: number;
  appointmentRequests: number;
  submissions: number;
  registered: number;
  participationRate: number | null;
  starters: number;
  completedStarters: number;
  incompleteStarters: number;
  completionRate: number | null;
}
export interface StatisticsReport {
  generatedAt: string;
  filters: StatisticsFilters;
  campuses: { key: string; label: string }[];
  assessments: { id: string; title: string }[];
  totals: ParticipationSummary;
  participation: (ParticipationSummary & { campus: string; label: string })[];
  assessmentCohorts: { assessmentId: string; title: string; starters: number; completed: number; remaining: number; rate: number | null }[];
  trends: { label: string; startDate: string; endDate: string; partial: boolean; participants: number; appointmentRequests: number; messagingStudents: number; submissions: number; assessmentStudents: number }[];
  scores: {
    campus: string; label: string; instrument: string; version: string; max: number;
    suppressed: boolean; sample: number | null; median: number | null;
    q1: number | null; q3: number | null; mean: number | null;
    bins: { label: string; count: number | null }[];
  }[];
  coverage: Record<string, number>;
  notes: string[];
}
