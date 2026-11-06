export const resourceCategories = ['all', 'guide', 'video', 'article', 'worksheet', 'helpline', 'other'] as const;
export type ResourceCategory = Exclude<typeof resourceCategories[number], 'all'>;
export interface StudentResource { id: string; title: string; description: string; category: ResourceCategory; tags: string[]; url: string | null; fileUrl: string | null }
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
// Reuses main's resources contract; rejects drafts, staff-only and malformed records.
export function parseStudentResource(id: string, value: Record<string, unknown>): StudentResource | null {
  if (value.isActive !== true || !['all', 'students'].includes(String(value.audience))) return null;
  const title = text(value.title, 160);
  if (!title || !resourceCategories.slice(1).includes(value.category as ResourceCategory)) return null;
  return { id, title, description: text(value.description, 1200), category: value.category as ResourceCategory,
    tags: Array.isArray(value.tags) ? value.tags.filter((x): x is string => typeof x === 'string').slice(0, 12).map(x => x.slice(0, 48)) : [],
    url: safeResourceUrl(value.url), fileUrl: safeResourceUrl(value.fileUrl) };
}
/** External links only, no WebView, app credentials, deep links or request headers. */
export function safeResourceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
      || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || host.endsWith('.local') || host.endsWith('.internal')
      || /(?:^|[?&])(?:access_token|id_token|password|authorization)=/i.test(url.search)) return null;
    return url.toString();
  } catch { return null; }
}
export function filterResources(rows: StudentResource[], search: string, category: typeof resourceCategories[number]) {
  const term = search.trim().toLocaleLowerCase();
  return rows.filter(row => (category === 'all' || row.category === category) && (!term || [row.title, row.description, row.category, ...row.tags].join(' ').toLocaleLowerCase().includes(term)));
}
export const guidanceServices = [
  { title: 'E-Counseling', icon: 'message-circle', description: 'Explore online guidance and counseling support. Ask a campus facilitator about the available ways to connect.' },
  { title: 'Referrals', icon: 'compass', description: 'Find direction toward appropriate support services when your needs call for additional help.' },
  { title: 'Career Guidance', icon: 'briefcase', description: 'Explore career interests, plan your next steps and prepare for professional development.' },
  { title: 'Life Guidance', icon: 'sun', description: 'Reflect on personal growth, decisions and everyday life challenges with guidance support.' },
  { title: 'Academic Guidance', icon: 'book-open', description: 'Talk through study concerns, academic adjustment and practical goals for your university journey.' },
  { title: 'Peer Support', icon: 'users', description: 'Learn about positive peer connections and supportive student communities through your Guidance Office.' },
] as const;
// Original general educational copy, bundled for offline use; not an official university policy or treatment plan.
export const offlineGuides = [
  { id: 'daily-care', title: 'Small steps for self-care', topic: 'Student wellness', icon: 'heart', description: 'Make room for everyday care, connection and rest.', steps: ['Choose one manageable care activity for today, such as a meal break or a short walk.', 'Build a routine that leaves time for rest and people you trust.', 'If concerns persist or disrupt daily life, consider speaking with a qualified professional.'] },
  { id: 'stress', title: 'Pause when stress builds', topic: 'Stress management', icon: 'wind', description: 'Create a little space before choosing your next step.', steps: ['Pause and notice what is happening around you.', 'Name one task you can take a small step toward now; leave room for a break.', 'Reach out to someone you trust when you need support.'] },
  { id: 'awareness', title: 'Understanding mental well-being', topic: 'Mental health awareness', icon: 'smile', description: 'Make supportive conversations part of student life.', steps: ['People experience challenges differently. Listen without judging or diagnosing.', 'Use respectful language and ask what support someone would find useful.', 'General resources can help you learn; they do not replace individual professional care.'] },
  { id: 'study', title: 'A kinder study plan', topic: 'Academic coping', icon: 'edit-3', description: 'Turn a busy week into smaller, achievable tasks.', steps: ['Write down deadlines and identify the next concrete step for each task.', 'Choose a realistic study block and include a break.', 'Ask your instructor or Guidance Office about academic support when workload becomes difficult.'] },
  { id: 'support', title: 'Preparing to ask for support', topic: 'Practical guidance', icon: 'compass', description: 'You do not have to prepare a perfect explanation.', steps: ['Make a short note of what you would like help with.', 'Choose a trusted person or find your campus facilitator in Spartan-G.', 'Ask about available services, privacy and the next step. Availability is confirmed by the office.'] },
] as const;
export const inspiration = ['One manageable step is still progress.', 'You deserve time to learn, rest and ask for support.', 'Your journey does not need to look like anyone else’s.'];
