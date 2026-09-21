export type ApiResponse<T> = {
  code: '0' | '-1';
  data: T;
  message: string;
};

export function successResponse<T>(data: T, message = ''): ApiResponse<T> {
  return { code: '0', data, message };
}

export function errorResponse(message: string): ApiResponse<null> {
  return { code: '-1', data: null, message };
}
