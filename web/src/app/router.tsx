import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthorIdeShell } from './layout/AuthorIdeShell';
import { WebAppShell } from './layout/WebAppShell';
import { AdminPage } from '../features/admin/AdminPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { ReaderPage } from '../features/reader/ReaderPage';
import { WalletPage } from '../features/wallet/WalletPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <WebAppShell />,
    children: [
      {
        index: true,
        element: <Navigate to="/author/ide" replace />
      },
      {
        path: '/author/ide',
        element: <AuthorIdeShell />
      },
      {
        path: '/reader',
        element: <ReaderPage />
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
        path: '/admin',
        element: <AdminPage />
      }
    ]
  }
]);
