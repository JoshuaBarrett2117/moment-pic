export const MAX_PASSWORD_LENGTH = 128;

export class AdminPasswordConfigError extends Error {}

export const validateAdminPassword = (password: string | undefined): string => {
  if (!password || password.length > MAX_PASSWORD_LENGTH) {
    throw new AdminPasswordConfigError("ADMIN_PASSWORD 必须显式设置为非空的 1-128 字符密码，不限制复杂度");
  }
  return password;
};
