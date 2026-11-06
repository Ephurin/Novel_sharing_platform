export const navigationLabels = {
  home: 'Trang chủ',
  authorHome: 'Tác phẩm',
  readerHome: 'Danh sách truyện',
  publicHome: 'Thư viện công khai',
  authorProfile: 'Trang tác giả',
  authorWallet: 'Ví và doanh thu',
  readerWallet: 'Ví xu'
} as const;

export const authorHomeCrumb = { label: navigationLabels.authorHome, to: '/author/projects' };
export const readerHomeCrumb = { label: navigationLabels.readerHome, to: '/reader' };
export const publicHomeCrumb = { label: navigationLabels.publicHome, to: '/public' };
