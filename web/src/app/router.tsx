import { AdminReportsPage } from '../features/admin/AdminReportsPage';
import { AdminModerationPage } from '../features/admin/AdminModerationPage';
import { AdminTaxonomyPage } from '../features/admin/AdminTaxonomyPage';
import { AdminNovelDetailPage } from '../features/admin/AdminNovelDetailPage';
import { AdminNovelsPage } from '../features/admin/AdminNovelsPage';
import { AdminUsersPage } from '../features/admin/AdminUsersPage';
import { AdminOverviewPage } from '../features/admin/AdminOverviewPage';
import { AuthorNovelCommentsPage } from '../features/author-projects/AuthorNovelCommentsPage';
import { AuthorNovelReviewsPage } from '../features/author-projects/AuthorNovelReviewsPage';
import { AuthorTheme } from '../shared/components/AuthorTheme';
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { AuthorIdeShell } from './layout/AuthorIdeShell';
import { AuthorWritingIde } from '../features/author-ide/AuthorWritingIde';
import { WebAppShell } from './layout/WebAppShell';
import {
  AdminModerationDetailPage,
  AdminPage
} from '../features/admin/AdminPage';
import { AuthorNovelMetadataPage } from '../features/author-projects/AuthorNovelMetadataPage';
import { AuthorProjectsPage } from '../features/author-projects/AuthorProjectsPage';
import { AuthorStoryContextPage } from '../features/story-context/AuthorStoryContextPage';
import { AuthGate, RoleGuard, RoleHomeRedirect } from '../features/auth/AuthGate';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { AuthorProfilePage, MyProfilePage } from '../features/profile/ProfilePage';
import {
  PublicReaderChapterPage,
  PublicReaderNovelDetailPage,
  PublicReaderPage,
  ReaderChapterPage,
  ReaderHistoryPage,
  ReaderLibraryPage,
  ReaderNovelDetailPage,
  ReaderPage
} from '../features/reader/ReaderPage';
import { AuthLanding } from '../shared/components/AuthLanding';
import { WalletPage } from '../features/wallet/WalletPage';
import { ManuscriptImportPage } from '../features/manuscript-import/ManuscriptImportPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <AuthLanding />
  },
  {
    path: '/public',
    element: <PublicReaderPage />
  },
  {
    path: '/public/novels/:novelId',
    element: <PublicReaderNovelDetailPage />
  },
  {
    path: '/public/chapters/:chapterId',
    element: <PublicReaderChapterPage />
  },
  {
    path: '/author/ide',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN']}>
          <AuthorTheme><AuthorWritingIde /></AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/import/:novelId',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN']}>
          <AuthorTheme><ManuscriptImportPage /></AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/context/:novelId',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN']}>
          <AuthorTheme><AuthorStoryContextPage /></AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN']}>
          <AuthorTheme><AuthorProjectsPage /></AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/projects',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN']}>
          <AuthorTheme><AuthorProjectsPage /></AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/novels/:novelId/comments',
    element: <AuthGate><RoleGuard roles={['AUTHOR', 'ADMIN']}><AuthorTheme><AuthorNovelCommentsPage /></AuthorTheme></RoleGuard></AuthGate>
  },
  {
    path: '/author/novels/:novelId/reviews',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN']}>
          <AuthorTheme className="sc-reviews-theme"><AuthorNovelReviewsPage /></AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/novels/:novelId',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN']}>
          <AuthorTheme><AuthorNovelMetadataPage /></AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/novels/:novelId/chapters/:chapterId',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN']}>
          <AuthorChapterDeepLink />
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/profile',
    element: (
      <AuthGate>
        <AuthorTheme><AuthorProfilePage /></AuthorTheme>
      </AuthGate>
    )
  },
  {
    path: '/authors/:authorId',
    element: (
      <AuthGate>
        <AuthorTheme><AuthorProfilePage /></AuthorTheme>
      </AuthGate>
    )
  },
  {
    path: '/wallet',
    element: (
      <AuthGate>
        <AuthorTheme><WalletPage /></AuthorTheme>
      </AuthGate>
    )
  },
  {
    path: '/',
    element: (
      <AuthGate>
        <WebAppShell />
      </AuthGate>
    ),
    children: [
      {
        index: true,
        element: <RoleHomeRedirect />
      },
      {
        path: '/reader',
        element: <ReaderPage />
      },
      {
        path: '/reader/novels/:novelId',
        element: <ReaderNovelDetailPage />
      },
      {
        path: '/reader/chapters/:chapterId',
        element: <ReaderChapterPage />
      },
      {
        path: '/reader/library',
        element: <ReaderLibraryPage />
      },
      {
        path: '/reader/history',
        element: <ReaderHistoryPage />
      },
      {
        path: '/notifications',
        element: <NotificationsPage />
      },
      {
        path: '/profile/me',
        element: <MyProfilePage />
      },
      {
        path: '/authors/:authorId',
        element: <AuthorTheme><AuthorProfilePage /></AuthorTheme>
      },
      {
        path: '/admin',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminOverviewPage />
          </RoleGuard>
        )
      },
      {
        path: '/admin/users',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminUsersPage />
          </RoleGuard>
        )
      },
      {
        path: '/admin/novels',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminNovelsPage />
          </RoleGuard>
        )
      },
      {
        path: '/admin/novels/:novelId',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminNovelDetailPage />
          </RoleGuard>
        )
      },
      {
        path: '/admin/taxonomy',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminTaxonomyPage />
          </RoleGuard>
        )
      },
      {
        path: '/admin/moderation',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminModerationPage key="moderation" />
          </RoleGuard>
        )
      },
      {
        path: '/admin/reports',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminReportsPage />
          </RoleGuard>
        )
      },
      {
        path: '/admin/moderation/:reviewId',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminModerationDetailPage />
          </RoleGuard>
        )
      },
      {
        path: '/admin/withdraws',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminPage initialTab="withdraw" />
          </RoleGuard>
        )
      }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
]);

function AuthorChapterDeepLink() {
  const { novelId = '', chapterId = '' } = useParams();
  const params = new URLSearchParams({ novelId, chapterId });

  return <Navigate to={`/author/ide?${params.toString()}`} replace />;
}
