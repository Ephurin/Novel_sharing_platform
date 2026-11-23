import axios from 'axios';

type ApiErrorEnvelope = {
  success?: boolean;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  } | null;
};

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(input: { message: string; code: string; status: number; details?: unknown }) {
    super(input.message);
    this.name = 'ApiClientError';
    this.code = input.code;
    this.status = input.status;
    this.details = input.details;
  }
}

export const apiClient = axios.create({
  baseURL:
    import.meta.env?.VITE_API_BASE_URL ||
    'http://localhost:4000/api/v1',
  withCredentials: true
});

apiClient.interceptors.request.use((config) => {
  let accessToken: string | null = null;
  try {
    accessToken = localStorage.getItem('ephurin_access_token') ?? sessionStorage.getItem('ephurin_access_token');
  } catch { /* Continue as guest if storage is blocked. */ }

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError<ApiErrorEnvelope>(error)) {
      const status = error.response?.status ?? 0;
      const envelopeError = error.response?.data?.error;
      throw new ApiClientError({
        status,
        code: envelopeError?.code ?? (status ? `HTTP_${status}` : 'NETWORK_ERROR'),
        message: envelopeError?.message ?? error.message,
        details: envelopeError?.details
      });
    }

    throw error;
  }
);

export type ApiEnvelope<TData> = {
  success: boolean;
  data: TData;
  error: {
    code: string;
    message: string;
    details?: unknown;
  } | null;
  meta: Record<string, unknown>;
};

/** UAT 2026-11-20 (BUG-004): Vietnamese text for backend errors whose message is still in English. */
const PLAIN_ERROR_MESSAGES: Record<string, string> = {
  AUTH_001: 'Email không đúng định dạng.',
  AUTH_002: 'Phiên đăng nhập không còn hiệu lực. Hãy đăng nhập lại.',
  AUTH_003: 'Email, tên đăng nhập hoặc mật khẩu không đúng.',
  AUTH_004: 'Tài khoản đang bị khóa. Bạn có thể gửi khiếu nại ở trang Quyết định & khiếu nại.',
  AUTH_006: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
  AUTH_008: 'Bạn không có quyền thực hiện thao tác này.',
  PAYMENT_002: 'Chương này cần mở khóa bằng xu.',
  PAYMENT_003: 'Số dư xu không đủ. Hãy nạp thêm xu.',
  PRIVATE_COMMENTS_DISABLED: 'Góp ý riêng đang tạm tắt trên hệ thống này.'
};

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.code === 'IDEA_BOOTSTRAP_RETRY_UNSUPPORTED') {
      return 'Không thể thử lại tác vụ tạo ý tưởng đã thất bại. Hãy bắt đầu một tác vụ mới.';
    }
    // Live test F-A-11: Planning showed the raw code before the world setup was activated.
    // Live retest 2 (R3): Freeze failed with "INVALID_EVIDENCE: Alias identity requires an exact source quote".
    if (error.code === 'INVALID_EVIDENCE' && /alias identity/i.test(error.message)) {
      return 'Một tên gọi khác được nối vào nhân vật đã duyệt nhưng thiếu câu trích trong chương nhắc cả hai tên. Hãy mở vị trí đó để chọn lại, hoặc tạo thực thể mới.';
    }
    if (error.code === 'M0_NOT_ACTIVE') {
      return 'Thiết lập thế giới của truyện chưa được kích hoạt. Hãy duyệt và kích hoạt thiết lập trước khi dùng mục này.';
    }
    // Live retest 3 (P2): accepting an old proposal group showed "AI Service returned status 409".
    if (error.code === 'BRAIN_VERSION_CONFLICT') {
      return 'Bộ nhớ truyện đã thay đổi sau khi mục này được tạo nên không thể duyệt nữa. Hãy tải lại; nếu đề xuất được đánh dấu "Đã cũ", hãy từ chối nó rồi lưu lại chương để AI phân tích lại.';
    }
    // Live retest 7 (U2): "Phân tích lại chương" showed "AI_SERVICE_502: PROVIDER_UNAVAILABLE retry_after=60".
    if (/PROVIDER_UNAVAILABLE|PROVIDER_TIMEOUT/.test(`${error.code} ${error.message}`)) {
      return 'Dịch vụ AI tạm thời không phản hồi. Hệ thống đã thử lại; vui lòng thử lại sau khoảng một phút.';
    }
    // The AI service explains this one in Vietnamese (for example a repeated event). The range
    // À–ỹ is written as escapes so the bundle stays ASCII: a test server that serves JS without
    // charset=utf-8 decoded the raw letters wrongly and the regex failed to parse.
    if (error.code === 'INVALID_PROJECTION' && /[\u00C0-\u1EF9]/.test(error.message)) {
      return error.message;
    }
    const plain = /[\u00C0-\u1EF9]/.test(error.message) ? undefined : PLAIN_ERROR_MESSAGES[error.code];
    if (plain) return plain;
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}
