import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthorIdeShell } from './layout/AuthorIdeShell';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/author/ide" replace />
  },
  {
    path: '/author/ide',
    element: <AuthorIdeShell />
  }
]);
