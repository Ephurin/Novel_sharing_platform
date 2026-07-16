export type ApiSuccessResponse<TData> = {
  success: true;
  data: TData;
  error: null;
  meta: Record<string, unknown>;
};

export type ApiErrorResponse = {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: Record<string, unknown>;
};

export function successResponse<TData>(
  data: TData,
  meta: Record<string, unknown> = {}
): ApiSuccessResponse<TData> {
  return {
    success: true,
    data,
    error: null,
    meta
  };
}

export function errorResponse(
  code: string,
  message: string,
  details?: unknown,
  meta: Record<string, unknown> = {}
): ApiErrorResponse {
  return {
    success: false,
    data: null,
    error: {
      code,
      message,
      details
    },
    meta
  };
}
