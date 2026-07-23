import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { AuthorIdeShell } from './layout/AuthorIdeShell';
import { WebAppShell } from './layout/WebAppShell';
import {
  AdminModerationDetailPage,
  AdminModerationPage,
  AdminNovelDetailPage,
  AdminNovelsPage,
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
          <AuthorIdeShell />
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/context/:novelId',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN']}>
          <AuthorStoryContextPage />
        </RoleGuard>
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
        path: '/author',
        element: (
          <RoleGuard roles={['AUTHOR', 'ADMIN']}>
            <AuthorProjectsPage />
          </RoleGuard>
        )
      },
      {
        path: '/author/novels/:novelId',
        element: (
          <RoleGuard roles={['AUTHOR', 'ADMIN']}>
            <AuthorNovelMetadataPage />
          </RoleGuard>
        )
      },
      {
        path: '/author/novels/:novelId/chapters/:chapterId',
        element: (
          <RoleGuard roles={['AUTHOR', 'ADMIN']}>
            <AuthorChapterDeepLink />
          </RoleGuard>
        )
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
        path: '/wallet',
        element: <WalletPage />
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
        element: <AuthorProfilePage />
      },
      {
        path: '/admin',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminPage />
          </RoleGuard>
        )
      },
      {
        path: '/admin/users',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminPage initialTab="users" />
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
            <AdminPage initialTab="taxonomy" />
          </RoleGuard>
        )
      },
      {
        path: '/admin/moderation',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminModerationPage />
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
