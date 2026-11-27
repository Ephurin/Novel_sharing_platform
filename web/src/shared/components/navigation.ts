export const navigationLabels = {
  home: 'Trang chủ',
  authorHome: 'Tác phẩm',
  readerHome: 'Danh sách truyện',
  // UI-21: guests see the same catalog name as the main menu.
  publicHome: 'Danh sách truyện',
  authorProfile: 'Trang tác giả',
  authorWallet: 'Ví và doanh thu',
  readerWallet: 'Ví xu'
} as const;

export const authorHomeCrumb = { label: navigationLabels.authorHome, to: '/author/projects' };
// UI-19: personal reading pages (library, bookmarks, history) belong to the home, not the catalog.
export const homeCrumb = { label: navigationLabels.home, to: '/' };
export const readerHomeCrumb = { label: navigationLabels.readerHome, to: '/reader' };
export const publicHomeCrumb = { label: navigationLabels.publicHome, to: '/public' };
