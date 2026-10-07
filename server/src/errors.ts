export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const linkNotFound = () =>
  new AppError(404, 'LINK_NOT_FOUND', 'O link informado não existe.');
