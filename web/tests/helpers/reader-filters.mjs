// UI-18: Danh sách truyện and Tìm kiếm share one filter bar; each facet opens its own panel.
const panelNames = { 'Thể loại': 'Lọc theo thể loại', 'Thẻ': 'Lọc theo thẻ' };

export const filterBar = page => page.getByRole('group', { name: 'Bộ lọc truyện', exact: true });

export function facetTrigger(page, facet) {
  const pattern = facet === 'Tình trạng' ? /^Tình trạng(: .+)?$/ : new RegExp(`^${facet}( \d+)?$`);
  return filterBar(page).getByRole('button', { name: pattern });
}

async function openTrigger(page, facet) {
  const trigger = facetTrigger(page, facet);
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
}

/** Opens the facet's panel (closing any other) and returns its checkbox for `name`. */
export async function facetCheckbox(page, facet, name) {
  await openTrigger(page, facet);
  return filterBar(page).getByRole('group', { name: panelNames[facet], exact: true }).getByRole('checkbox', { name, exact: true });
}

export async function statusRadio(page, label) {
  await openTrigger(page, 'Tình trạng');
  return filterBar(page).getByRole('radiogroup', { name: 'Lọc theo tình trạng', exact: true }).getByRole('radio', { name: label, exact: true });
}
