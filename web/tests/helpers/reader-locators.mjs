export async function mockReadingLocators(page, novels) {
  const results = new Map();
  for (const novel of novels) {
    const novelId = novel.novelId;
    const novelSlug = novel.novelSlug ?? novelId;
    const location = { novelId, novelSlug };
    results.set(`novels/${novelId}`, location);
    results.set(`novels/by-slug/${novelSlug}`, location);
    for (const chapter of novel.chapters ?? []) {
      const chapterId = chapter.chapterId;
      const chapterSlug = chapter.chapterSlug ?? chapterId;
      const destination = { ...location, chapterId, chapterSlug };
      results.set(`chapters/${chapterId}`, destination);
      results.set(`novels/by-slug/${novelSlug}/chapters/${chapterSlug}`, destination);
    }
  }
  await page.route(/\/api\/v1\/reading\/(novels|chapters)\/[^?]+\/locator$/, route => {
    const pathname = new URL(route.request().url()).pathname;
    const key = pathname.slice('/api/v1/reading/'.length, -'/locator'.length);
    const data = results.get(key);
    return data ? route.fulfill({ json: { success: true, data } }) : route.fulfill({
      status: 404,
      json: { success: false, error: { code: 'CONTENT_001', message: 'Fixture not found' } }
    });
  });
}
