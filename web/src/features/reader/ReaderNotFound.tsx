import { Link } from 'react-router-dom';
import { ApiClientError } from '../../shared/api/api-client';
import { useAuthStore } from '../auth/useAuthStore';

// Live retest 3 (P4): a chapter of a novel that is not public yet showed
// "Something went wrong — CONTENT_001: Content not found".
export function isReaderNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && (error.code === 'CONTENT_001' || error.status === 404);
}

export function ReaderNotFound({ publicMode = false, kind = 'chapter' }: { publicMode?: boolean; kind?: 'chapter' | 'novel' }) {
  const role = useAuthStore(state => state.user?.role);
  const isWriter = role === 'AUTHOR' || role === 'ADMIN';
  return <section className="sc-reader-detail-section sc-reader-not-found" role="alert" data-testid="reader-not-found">
    <h1 className="text-page-title">{kind === 'chapter' ? 'Không tìm thấy chương' : 'Không tìm thấy truyện'}</h1>
    <p className="text-body">{kind === 'chapter' ? 'Chương này không tồn tại, đã bị gỡ, hoặc truyện chưa được công khai.' : 'Truyện này không tồn tại, đã bị gỡ, hoặc chưa được công khai.'}</p>
    {isWriter && <p className="text-meta">Nếu bạn là tác giả, hãy kiểm tra trạng thái truyện trong trang quản lý tác phẩm.</p>}
    <Link to={publicMode ? '/public' : '/reader'} className="sc-button sc-button-primary">Danh sách truyện</Link>
  </section>;
}
