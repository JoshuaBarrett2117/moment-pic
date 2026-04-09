export type ApiSuccess<T> = {
  code: 0;
  message: "ok";
  data: T;
};

export type ApiError = {
  code: number;
  message: string;
};

export const ok = <T>(data: T): ApiSuccess<T> => ({
  code: 0,
  message: "ok",
  data
});
