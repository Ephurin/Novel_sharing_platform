// Compatibility exports; each admin page now owns its UI and can evolve independently.
import { AdminOverviewPage } from './AdminOverviewPage';
import { AdminUsersPage } from './AdminUsersPage';
import { AdminTaxonomyPage } from './AdminTaxonomyPage';
import { AdminWithdrawsPage } from './AdminWithdrawsPage';
export { AdminNovelsPage } from './AdminNovelsPage';
export { AdminNovelDetailPage } from './AdminNovelDetailPage';
export { AdminModerationPage } from './AdminModerationPage';
export { AdminModerationDetailPage } from './AdminModerationDetailPage';

export function AdminPage({
  initialTab = 'overview'
}: {
  initialTab?: 'overview' | 'users' | 'taxonomy' | 'withdraw';
}) {
  switch (initialTab) {
    case 'users':
      return <AdminUsersPage />;
    case 'taxonomy':
      return <AdminTaxonomyPage />;
    case 'withdraw':
      return <AdminWithdrawsPage />;
    default:
      return <AdminOverviewPage />;
  }
}
