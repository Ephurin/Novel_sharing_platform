import type { Chapter } from '../novels/novel-types';

export type ChapterSort = 'number-asc' | 'number-desc' | 'updated-desc' | 'updated-asc' | 'words-desc' | 'words-asc';

export const chapterSortOptions: { value: ChapterSort; label: string }[] = [
  { value: 'number-asc', label: 'Thứ tự xuất bản' },
  { value: 'number-desc', label: 'Thứ tự ngược lại' },
  { value: 'updated-desc', label: 'Chỉnh sửa mới nhất' },
  { value: 'updated-asc', label: 'Chỉnh sửa cũ nhất' },
  { value: 'words-desc', label: 'Số từ giảm dần' },
  { value: 'words-asc', label: 'Số từ tăng dần' }
];

const updated = (chapter: Chapter) => Date.parse(chapter.draft?.updatedAt ?? chapter.updatedAt) || 0;

export function sortChapters(chapters: Chapter[], order: ChapterSort): Chapter[] {
  return [...chapters].sort((a, b) => {
    let comparison = 0;
    switch (order) {
      case 'number-desc': comparison = b.chapterNumber - a.chapterNumber; break;
      case 'updated-desc': comparison = updated(b) - updated(a); break;
      case 'updated-asc': comparison = updated(a) - updated(b); break;
      case 'words-desc': comparison = b.wordCount - a.wordCount; break;
      case 'words-asc': comparison = a.wordCount - b.wordCount; break;
    }
    return comparison || a.chapterNumber - b.chapterNumber || a.chapterId.localeCompare(b.chapterId);
  });
}
