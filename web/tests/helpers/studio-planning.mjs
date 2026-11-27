// UI-13: story planning is opened from the "Trợ lý viết ▾" menu and left through "Quay lại bản thảo".
export async function openPlanning(page) {
  await page.getByRole('button', { name: 'Thêm lệnh trợ lý viết', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Lập kế hoạch truyện', exact: true }).click();
}

export const backToDraftButton = page => page.getByRole('button', { name: 'Quay lại bản thảo', exact: true });
