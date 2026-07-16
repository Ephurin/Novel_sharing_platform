export class AppError extends Error {
  public readonly httpStatus: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(httpStatus: number, code: string, message: string, details?: unknown) {
    super(message);
    this.httpStatus = httpStatus;
    this.code = code;
    this.details = details;
  }
}
