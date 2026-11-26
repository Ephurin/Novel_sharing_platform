import { ConnectionsPage, ReaderProfilePage } from '../features/reader/ConnectionsPage';
import { FeedbackPage } from '../features/reader/PrivateComments';
import { AdminAuditPage } from '../features/admin/AdminAuditPage';
import { AdminAppealsPage } from '../features/admin/AdminAppealsPage';
import { AdminUserDetailPage } from '../features/admin/AdminUserDetailPage';
import { AdminReconciliationPage } from '../features/admin/AdminReconciliationPage';
import { AccountAppealsPage } from '../features/admin/AccountAppealsPage';
import { AdminWithdrawsPage } from '../features/admin/AdminWithdrawsPage';
import { AdminModerationDetailPage } from '../features/admin/AdminModerationDetailPage';
import { AdminReportsPage } from '../features/admin/AdminReportsPage';
import { AdminModerationPage } from '../features/admin/AdminModerationPage';
import { AdminEscalationsPage } from '../features/admin/AdminEscalationsPage';
import { AdminTaxonomyPage } from '../features/admin/AdminTaxonomyPage';
import { AdminNovelDetailPage } from '../features/admin/AdminNovelDetailPage';
import { AdminNovelsPage } from '../features/admin/AdminNovelsPage';
import { AdminUsersPage } from '../features/admin/AdminUsersPage';
import { AdminOverviewPage } from '../features/admin/AdminOverviewPage';
import { ModeratorReviewsPage } from '../features/moderator/ModeratorReviewsPage';
import { ModeratorReviewDetailPage } from '../features/moderator/ModeratorReviewDetailPage';
import { ModeratorDiscussionsPage } from '../features/moderator/ModeratorDiscussionsPage';
import { ModeratorHistoryPage } from '../features/moderator/ModeratorHistoryPage';
import { ModeratorSelectionDetailPage, ModeratorSelectionsPage, MyNominationsPage } from '../features/novel-selection/SelectionPages';
import { AdminReconsiderationsPage } from '../features/novel-selection/AdminReconsiderationsPage';
import { PlacementPage } from '../features/novel-selection/PlacementPage';
import { AuthorNovelCommentsPage } from '../features/author-projects/AuthorNovelCommentsPage';
import { AuthorNovelReviewsPage } from '../features/author-projects/AuthorNovelReviewsPage';
import { AuthorNavbar, AuthorTheme } from '../shared/components/AuthorTheme';
import { createBrowserRouter, Navigate, Outlet, useParams } from 'react-router-dom';
import { routes } from '../shared/routes';
import { ResourceRoute, UrlRedirect } from './ResourceRoute';
import { useAuthStore } from '../features/auth/useAuthStore';
import { AuthorWritingIde } from '../features/author-ide/AuthorWritingIde';
import { WebAppShell } from './layout/WebAppShell';
import { AuthorNovelMetadataPage } from '../features/author-projects/AuthorNovelMetadataPage';
import { AuthorProjectsPage } from '../features/author-projects/AuthorProjectsPage';
import { AuthorStoryContextPage } from '../features/story-context/AuthorStoryContextPage';
import { AuthGate, OptionalSession, RoleGuard } from '../features/auth/AuthGate';
import { ReaderHomePage } from '../features/reader/ReaderHomePage';
import { SearchResultsPage } from '../features/reader/SearchResultsPage';
import { ReaderNovelReviewsPage } from '../features/reader/ReaderNovelReviewsPage';
import { ReadingBookmarksPage } from '../features/reader/ReadingBookmarksPage';
import { ReaderCollectionsLayout } from '../features/reader/ReaderCollectionsLayout';
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
import { VnpayReturnPage } from '../features/wallet/VnpayReturnPage';
import { ManuscriptImportPage } from '../features/manuscript-import/ManuscriptImportPage';

import { DiscussionEditorPage, DiscussionListPage, MyDiscussionsPage } from '../features/discussions/DiscussionPages';
import { DiscussionTopicPage } from '../features/discussions/DiscussionTopicPage';
import { AdminDiscussionsPage } from '../features/discussions/AdminDiscussionsPage';
import '../features/discussions/discussions.css';
// Self-hosted display face for community headings (subset-scoped woff2).
import '@fontsource/literata/600.css';

function ReaderSurface({ view }: { view: 'catalog' | 'novel' | 'chapter' | 'reviews' | 'bookmarks' }) {
  const user = useAuthStore(state => state.user);
  const publicMode = !user || user.status === 'LOCKED';
  if (publicMode) {
    switch (view) {
      case 'catalog': return <AuthorTheme><PublicReaderPage /></AuthorTheme>;
      case 'novel': return <AuthorTheme><PublicReaderNovelDetailPage /></AuthorTheme>;
      case 'chapter': return <AuthorTheme><PublicReaderChapterPage /></AuthorTheme>;
      case 'reviews': return <AuthorTheme><ReaderNovelReviewsPage publicMode /></AuthorTheme>;
      case 'bookmarks': return <AuthorTheme><AuthorNavbar /><main className="sc-shell-content"><ReadingBookmarksPage publicMode /></main></AuthorTheme>;
    }
  }
  const contents = {
    catalog: <ReaderPage />,
    novel: <ReaderNovelDetailPage />,
    chapter: <ReaderChapterPage />,
    reviews: <ReaderNovelReviewsPage />,
    bookmarks: <ReaderCollectionsLayout><ReadingBookmarksPage /></ReaderCollectionsLayout>
  }[view];
  return <AuthorTheme><AuthorNavbar /><main className="sc-shell-content">{contents}</main></AuthorTheme>;
}

export const router = createBrowserRouter([
  { path: routes.catalog, element: <OptionalSession><ReaderSurface view="catalog" /></OptionalSession> },
  { path: routes.bookmarks, element: <OptionalSession><ReaderSurface view="bookmarks" /></OptionalSession> },
  { path: routes.novel, element: <OptionalSession><ResourceRoute kind="novel"><ReaderSurface view="novel" /></ResourceRoute></OptionalSession> },
  { path: routes.reviews, element: <OptionalSession><ResourceRoute kind="novel" suffix="/danh-gia"><ReaderSurface view="reviews" /></ResourceRoute></OptionalSession> },
  { path: routes.chapter, element: <OptionalSession><ResourceRoute kind="chapter"><ReaderSurface view="chapter" /></ResourceRoute></OptionalSession> },
  ...['/reader', '/public'].flatMap(base => [
    { path: base, element: <UrlRedirect pathname={routes.catalog} /> },
    { path: `${base}/bookmarks`, element: <UrlRedirect pathname={routes.bookmarks} /> },
    { path: `${base}/novels/:novelId`, element: <ResourceRoute kind="novel" legacy /> },
    { path: `${base}/novels/:novelId/reviews`, element: <ResourceRoute kind="novel" suffix="/danh-gia" legacy /> },
    { path: `${base}/chapters/:chapterId`, element: <ResourceRoute kind="chapter" legacy /> }
  ]),
  { path: '/reader/library', element: <UrlRedirect pathname={routes.library} /> },
  { path: '/reader/history', element: <UrlRedirect pathname={routes.history} /> },
  {
    path: '/discussions',
    element: <OptionalSession><AuthorTheme><AuthorNavbar /><main className="sc-shell-content sc-discussions-shell"><Outlet /></main></AuthorTheme></OptionalSession>,
    children: [
      { index: true, element: <DiscussionListPage /> },
      { path: 'mine', element: <AuthGate><MyDiscussionsPage /></AuthGate> },
      { path: 'new', element: <AuthGate><DiscussionEditorPage /></AuthGate> },
      { path: ':topicId', element: <DiscussionTopicPage /> },
      { path: ':topicId/edit', element: <AuthGate><DiscussionEditorPage /></AuthGate> }
    ]
  },
  { path: '/readers/:userId', element: <OptionalSession><AuthorTheme><AuthorNavbar /><main className="sc-shell-content"><ReaderProfilePage /></main></AuthorTheme></OptionalSession> },
  { path: '/tim-kiem', element: <OptionalSession><AuthorTheme><AuthorNavbar /><main className="sc-shell-content"><SearchResultsPage /></main></AuthorTheme></OptionalSession> },
  { path: '/tim-kiem-nang-cao', element: <OptionalSession><AuthorTheme><AuthorNavbar /><main className="sc-shell-content"><SearchResultsPage advanced /></main></AuthorTheme></OptionalSession> },
  {
    path: '/',
    element: <OptionalSession><AuthorTheme><ReaderHomePage /></AuthorTheme></OptionalSession>
  },
  { path: '/appeals', element: <AccountAppealsPage /> },
  {
    path: '/login',
    element: <AuthLanding />
  },
  { path: '/verify-email', element: <AuthLanding confirmEmailFromLink /> },
  {
    path: '/author/ide',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <AuthorTheme>
            <AuthorWritingIde />
          </AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/import/:novelId',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <AuthorTheme>
            <ManuscriptImportPage />
          </AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/context/:novelId',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <AuthorTheme>
            <AuthorStoryContextPage />
          </AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <AuthorTheme>
            <AuthorProjectsPage />
          </AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/projects',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <AuthorTheme>
            <AuthorProjectsPage />
          </AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/novels/:novelId/comments',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <AuthorTheme>
            <AuthorNovelCommentsPage />
          </AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/novels/:novelId/reviews',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <AuthorTheme className="sc-reviews-theme">
            <AuthorNovelReviewsPage />
          </AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/novels/:novelId',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <AuthorTheme>
            <AuthorNovelMetadataPage />
          </AuthorTheme>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/novels/:novelId/chapters/:chapterId',
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <AuthorChapterDeepLink />
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: '/author/profile',
    element: (
      <AuthGate>
        <AuthorTheme>
          <AuthorProfilePage />
        </AuthorTheme>
      </AuthGate>
    )
  },
  {
    // Read-only public profile: guests may view it; follow and support still require login.
    path: '/authors/:authorId',
    element: (
      <OptionalSession>
        <AuthorTheme>
          <AuthorProfilePage />
        </AuthorTheme>
      </OptionalSession>
    )
  },
  {
    path: '/account/nominations',
    element: <AuthGate><AuthorTheme><MyNominationsPage /></AuthorTheme></AuthGate>
  },
  {
    path: '/wallet',
    element: (
      <AuthGate>
        <AuthorTheme>
          <WalletPage />
        </AuthorTheme>
      </AuthGate>
    )
  },
  {
    // VNPay sandbox Return URL (VNPAY_RETURN_URL defaults to `${WEB_ORIGIN}/wallet/vnpay-return`).
    path: '/wallet/vnpay-return',
    element: (
      <AuthGate>
        <AuthorTheme>
          <VnpayReturnPage />
        </AuthorTheme>
      </AuthGate>
    )
  },
  {
    element: (
      <AuthGate>
        <WebAppShell />
      </AuthGate>
    ),
    children: [
      { path: '/reader/connections', element: <ConnectionsPage /> },

      { path: '/reader/feedback', element: <FeedbackPage /> },
      {
        element: <ReaderCollectionsLayout />,
        children: [
          { path: routes.library, element: <ReaderLibraryPage /> },
          { path: routes.history, element: <ReaderHistoryPage /> }
        ]
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
        element: (
          <AuthorTheme>
            <AuthorProfilePage />
          </AuthorTheme>
        )
      },
      ...[
        { path: '/admin/audit', element: <AdminAuditPage /> },
        { path: '/admin/appeals', element: <AdminAppealsPage /> },
        { path: '/admin/selection-reconsiderations', element: <AdminReconsiderationsPage /> },
        { path: '/admin/placements', element: <PlacementPage /> },
        { path: '/admin/discussions', element: <AdminDiscussionsPage /> },
        { path: '/admin/users/:userId', element: <AdminUserDetailPage /> },
        { path: '/admin/withdraws/:requestId', element: <AdminReconciliationPage /> }
      ].map((route) => ({
        ...route,
        element: <RoleGuard roles={['ADMIN']}>{route.element}</RoleGuard>
      })),
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
        path: '/admin/escalations',
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminEscalationsPage />
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
            <AdminWithdrawsPage />
          </RoleGuard>
        )
      },
      {
        path: '/moderator',
        element: (
          <RoleGuard roles={['MODERATOR']}>
            <Navigate to="/moderator/reviews" replace />
          </RoleGuard>
        )
      },
      {
        path: '/moderator/reviews',
        element: (
          <RoleGuard roles={['MODERATOR']}>
            <ModeratorReviewsPage />
          </RoleGuard>
        )
      },
      {
        path: '/moderator/history',
        element: (
          <RoleGuard roles={['MODERATOR']}>
            <ModeratorHistoryPage />
          </RoleGuard>
        )
      },
      {
        path: '/moderator/reviews/:reviewId',
        element: (
          <RoleGuard roles={['MODERATOR']}>
            <ModeratorReviewDetailPage />
          </RoleGuard>
        )
      },
      {
        path: '/moderator/selections',
        element: <RoleGuard roles={['MODERATOR']}><ModeratorSelectionsPage /></RoleGuard>
      },
      {
        path: '/moderator/placements',
        element: <RoleGuard roles={['MODERATOR']}><PlacementPage /></RoleGuard>
      },
      {
        path: '/moderator/selections/:caseId',
        element: <RoleGuard roles={['MODERATOR']}><ModeratorSelectionDetailPage /></RoleGuard>
      },
      {
        path: '/moderator/discussions',
        element: (
          <RoleGuard roles={['MODERATOR']}>
            <ModeratorDiscussionsPage />
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
