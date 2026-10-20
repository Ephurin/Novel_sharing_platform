import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortProjects } from '../src/features/author-projects/project-sorting.ts';

const projects = [
  { novelId: 'b', title: 'Bến cũ', createdAt: '2026-02-01', updatedAt: '2026-10-02', viewsCount: 100, chaptersCount: 2 },
  { novelId: 'c', title: 'Chuyến tàu', createdAt: '2026-03-01', updatedAt: '2026-10-03', viewsCount: 10, chaptersCount: 20 },
  { novelId: 'a', title: 'Ánh trăng', createdAt: '2026-01-01', updatedAt: '2026-10-01', viewsCount: 50, chaptersCount: 5,
    latestChapter: { updatedAt: '2026-10-04' } }
];

test('project sort choices apply to the result list without changing cached data', () => {
  const original = structuredClone(projects);
  const expected = {
    updated: ['a', 'c', 'b'],
    'created-desc': ['c', 'b', 'a'],
    'created-asc': ['a', 'b', 'c'],
    'title-asc': ['a', 'b', 'c'],
    'title-desc': ['c', 'b', 'a'],
    views: ['b', 'a', 'c'],
    chapters: ['c', 'a', 'b']
  };
  for (const [order, ids] of Object.entries(expected)) {
    assert.deepEqual(sortProjects(projects, order).map(project => project.novelId), ids);
  }
  assert.deepEqual(projects, original);
  assert.deepEqual(sortProjects(projects.filter(project => project.novelId !== 'a'), 'views').map(project => project.novelId), ['b', 'c']);
});

test('equal metrics have a predictable order', () => {
  const tied = projects.map(project => ({ ...project, viewsCount: 0 }));
  assert.deepEqual(sortProjects(tied, 'views'), sortProjects([...tied].reverse(), 'views'));
});
