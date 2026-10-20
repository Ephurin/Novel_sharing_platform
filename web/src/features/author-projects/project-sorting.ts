import type { Novel } from '../novels/novel-types';

export type ProjectSort = 'updated' | 'created-desc' | 'created-asc' | 'title-asc' | 'title-desc' | 'views' | 'chapters';

const titles = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
const timestamp = (value: string) => Date.parse(value) || 0;
const lastActivity = (novel: Novel) => Math.max(timestamp(novel.updatedAt), timestamp(novel.latestChapter?.updatedAt ?? novel.updatedAt));

export function sortProjects(projects: Novel[], order: ProjectSort): Novel[] {
  return [...projects].sort((a, b) => {
    let comparison: number;
    switch (order) {
      case 'created-desc': comparison = timestamp(b.createdAt) - timestamp(a.createdAt); break;
      case 'created-asc': comparison = timestamp(a.createdAt) - timestamp(b.createdAt); break;
      case 'title-asc': comparison = titles.compare(a.title, b.title); break;
      case 'title-desc': comparison = titles.compare(b.title, a.title); break;
      case 'views': comparison = b.viewsCount - a.viewsCount; break;
      case 'chapters': comparison = b.chaptersCount - a.chaptersCount; break;
      default: comparison = lastActivity(b) - lastActivity(a);
    }
    return comparison || titles.compare(a.title, b.title) || a.novelId.localeCompare(b.novelId);
  });
}
