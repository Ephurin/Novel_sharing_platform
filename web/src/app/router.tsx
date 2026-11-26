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
import { createBrowserRouter, generatePath, Outlet, useLocation, useParams } from 'react-router-dom';
import { routes, staticRouteTargets } from '../shared/routes';
import { ManagedNovelRoute, ResourceRoute, UrlRedirect } from './ResourceRoute';
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

function StaticAlias({ target }: { target: string }) {
  const params = useParams();
  return <UrlRedirect pathname={generatePath(target, params)} />;
}

function AuthorOwnProfile() {
  const userId = useAuthStore(state => state.user?.userId);
  return userId ? <ResourceRoute kind="author" legacy legacyId={userId} /> : null;
}

export const router = createBrowserRouter([
  ...Object.entries(staticRouteTargets).map(([path, target]) => ({ path, element: <StaticAlias target={target} /> })),
  { path: '/discussions/:topicId', element: <ResourceRoute kind="topic" legacy /> },
  { path: '/discussions/:topicId/edit', element: <AuthGate><ResourceRoute kind="topic" suffix="/chinh-sua" legacy /></AuthGate> },
  { path: '/readers/:userId', element: <ResourceRoute kind="member" legacy /> },
  { path: '/authors/:authorId', element: <OptionalSession><ResourceRoute kind="author" legacy /></OptionalSession> },
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
    path: staticRouteTargets['/discussions'],
    element: <OptionalSession><AuthorTheme><AuthorNavbar /><main className="sc-shell-content sc-discussions-shell"><Outlet /></main></AuthorTheme></OptionalSession>,
    children: [
      { index: true, element: <DiscussionListPage /> },
      { path: staticRouteTargets['/discussions/mine'], element: <AuthGate><MyDiscussionsPage /></AuthGate> },
      { path: staticRouteTargets['/discussions/new'], element: <AuthGate><DiscussionEditorPage /></AuthGate> },
      { path: routes.topic, element: <ResourceRoute kind="topic"><DiscussionTopicPage /></ResourceRoute> },
      { path: routes.topicEdit, element: <AuthGate><ResourceRoute kind="topic" privatePage><DiscussionEditorPage /></ResourceRoute></AuthGate> }
    ]
  },
  { path: routes.member, element: <OptionalSession><AuthorTheme><AuthorNavbar /><main className="sc-shell-content"><ResourceRoute kind="member"><ReaderProfilePage /></ResourceRoute></main></AuthorTheme></OptionalSession> },
  { path: '/tim-kiem', element: <OptionalSession><AuthorTheme><AuthorNavbar /><main className="sc-shell-content"><SearchResultsPage /></main></AuthorTheme></OptionalSession> },
  { path: '/tim-kiem-nang-cao', element: <OptionalSession><AuthorTheme><AuthorNavbar /><main className="sc-shell-content"><SearchResultsPage advanced /></main></AuthorTheme></OptionalSession> },
  {
    path: '/',
    element: <OptionalSession><AuthorTheme><ReaderHomePage /></AuthorTheme></OptionalSession>
  },
  { path: staticRouteTargets['/appeals'], element: <AccountAppealsPage /> },
  {
    path: staticRouteTargets['/login'],
    element: <AuthLanding />
  },
  { path: staticRouteTargets['/verify-email'], element: <AuthLanding confirmEmailFromLink /> },
  {
    path: staticRouteTargets['/author/ide'],
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
    path: staticRouteTargets['/author/import/:novelId'],
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <ManagedNovelRoute route="/author/import/:novelId">
            <AuthorTheme>
              <ManuscriptImportPage />
            </AuthorTheme>
          </ManagedNovelRoute>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: staticRouteTargets['/author/context/:novelId'],
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <ManagedNovelRoute route="/author/context/:novelId">
            <AuthorTheme>
              <AuthorStoryContextPage />
            </AuthorTheme>
          </ManagedNovelRoute>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: staticRouteTargets['/author'],
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
    path: staticRouteTargets['/author/novels/:novelId/comments'],
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <ManagedNovelRoute route="/author/novels/:novelId/comments">
            <AuthorTheme>
              <AuthorNovelCommentsPage />
            </AuthorTheme>
          </ManagedNovelRoute>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: staticRouteTargets['/author/novels/:novelId/reviews'],
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <ManagedNovelRoute route="/author/novels/:novelId/reviews">
            <AuthorTheme className="sc-reviews-theme">
              <AuthorNovelReviewsPage />
            </AuthorTheme>
          </ManagedNovelRoute>
        </RoleGuard>
      </AuthGate>
    )
  },
  {
    path: staticRouteTargets['/author/novels/:novelId'],
    element: (
      <AuthGate>
        <RoleGuard roles={['AUTHOR', 'ADMIN', 'MODERATOR']}>
          <ManagedNovelRoute route="/author/novels/:novelId">
            <AuthorTheme>
              <AuthorNovelMetadataPage />
            </AuthorTheme>
          </ManagedNovelRoute>
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
  { path: '/author/profile', element: <AuthGate><AuthorOwnProfile /></AuthGate> },
  {
    // Read-only public profile: guests may view it; follow and support still require login.
    path: routes.author,
    element: (
      <OptionalSession>
        <AuthorTheme>
          <ResourceRoute kind="author"><AuthorProfilePage /></ResourceRoute>
        </AuthorTheme>
      </OptionalSession>
    )
  },
  {
    path: staticRouteTargets['/account/nominations'],
    element: <AuthGate><AuthorTheme><MyNominationsPage /></AuthorTheme></AuthGate>
  },
  {
    path: staticRouteTargets['/wallet'],
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
    path: staticRouteTargets['/wallet/vnpay-return'],
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
      { path: staticRouteTargets['/reader/connections'], element: <ConnectionsPage /> },

      { path: staticRouteTargets['/reader/feedback'], element: <FeedbackPage /> },
      {
        element: <ReaderCollectionsLayout />,
        children: [
          { path: routes.library, element: <ReaderLibraryPage /> },
          { path: routes.history, element: <ReaderHistoryPage /> }
        ]
      },
      {
        path: staticRouteTargets['/notifications'],
        element: <NotificationsPage />
      },
      {
        path: staticRouteTargets['/profile/me'],
        element: <MyProfilePage />
      },
      ...[
        { path: staticRouteTargets['/admin/audit'], element: <AdminAuditPage /> },
        { path: staticRouteTargets['/admin/appeals'], element: <AdminAppealsPage /> },
        { path: staticRouteTargets['/admin/selection-reconsiderations'], element: <AdminReconsiderationsPage /> },
        { path: staticRouteTargets['/admin/placements'], element: <PlacementPage /> },
        { path: staticRouteTargets['/admin/discussions'], element: <AdminDiscussionsPage /> },
        { path: staticRouteTargets['/admin/users/:userId'], element: <AdminUserDetailPage /> },
        { path: staticRouteTargets['/admin/withdraws/:requestId'], element: <AdminReconciliationPage /> }
      ].map((route) => ({
        ...route,
        element: <RoleGuard roles={['ADMIN']}>{route.element}</RoleGuard>
      })),
      {
        path: staticRouteTargets['/admin'],
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminOverviewPage />
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/admin/users'],
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminUsersPage />
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/admin/novels'],
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminNovelsPage />
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/admin/novels/:novelId'],
        element: (
          <RoleGuard roles={['ADMIN']}>
            <ManagedNovelRoute route="/admin/novels/:novelId" scope="admin">
              <AdminNovelDetailPage />
            </ManagedNovelRoute>
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/admin/taxonomy'],
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminTaxonomyPage />
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/admin/moderation'],
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminModerationPage key="moderation" />
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/admin/escalations'],
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminEscalationsPage />
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/admin/reports'],
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminReportsPage />
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/admin/moderation/:reviewId'],
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminModerationDetailPage />
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/admin/withdraws'],
        element: (
          <RoleGuard roles={['ADMIN']}>
            <AdminWithdrawsPage />
          </RoleGuard>
        )
      },
      {
        path: '/kiem-duyet',
        element: (
          <RoleGuard roles={['MODERATOR']}>
            <UrlRedirect pathname={staticRouteTargets['/moderator/reviews']} />
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/moderator/reviews'],
        element: (
          <RoleGuard roles={['MODERATOR']}>
            <ModeratorReviewsPage />
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/moderator/history'],
        element: (
          <RoleGuard roles={['MODERATOR']}>
            <ModeratorHistoryPage />
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/moderator/reviews/:reviewId'],
        element: (
          <RoleGuard roles={['MODERATOR']}>
            <ModeratorReviewDetailPage />
          </RoleGuard>
        )
      },
      {
        path: staticRouteTargets['/moderator/selections'],
        element: <RoleGuard roles={['MODERATOR']}><ModeratorSelectionsPage /></RoleGuard>
      },
      {
        path: staticRouteTargets['/moderator/placements'],
        element: <RoleGuard roles={['MODERATOR']}><PlacementPage /></RoleGuard>
      },
      {
        path: staticRouteTargets['/moderator/selections/:caseId'],
        element: <RoleGuard roles={['MODERATOR']}><ModeratorSelectionDetailPage /></RoleGuard>
      },
      {
        path: staticRouteTargets['/moderator/discussions'],
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
    element: <UrlRedirect pathname="/" search="" />
  }
]);

function AuthorChapterDeepLink() {
  const { novelId = '', chapterId = '' } = useParams();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('novelId', novelId);
  params.set('chapterId', chapterId);
  return <UrlRedirect pathname={staticRouteTargets['/author/ide']} search={'?' + params.toString()} />;
}
