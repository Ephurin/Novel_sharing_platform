import { Link } from 'react-router-dom';
import { ApiClientError } from '../../shared/api/api-client';

// Live retest 3 (P4): a chapter of a novel that is not public yet showed
// "Something went wrong — CONTENT_001: Content not found".
export function isReaderNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && (error.code === 'CONTENT_001' || error.status === 404);
}

export function ReaderNotFound({ publicMode = false, kind = 'chapter' }: { publicMode?: boolean; kind?: 'chapter' | 'novel' }) {
  return <section className="sc-reader-detail-section" role="alert" data-testid="reader-not-found">
    <h1 className="text-section-title">{kind === 'chapter' ? 'Không tìm thấy chương' : 'Không tìm thấy truyện'}</h1>
    <p>{kind === 'chapter' ? 'Chương này không tồn tại, đã bị gỡ, hoặc truyện chưa được công khai.' : 'Truyện này không tồn tại, đã bị gỡ, hoặc chưa được công khai.'}</p>
    <p className="text-meta">Nếu bạn là tác giả, hãy kiểm tra trạng thái truyện trong trang quản lý tác phẩm.</p>
    <Link to={publicMode ? '/public' : '/reader'} className="sc-button">Danh sách truyện</Link>
  </section>;
}
