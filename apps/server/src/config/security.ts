export const MAX_PASSWORD_LENGTH = 128;

export const validateAdminPassword = (password: string | undefined): string => {
  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((pattern) => pattern.test(password ?? "")).length;
  if (!password || password.length < 16 || password.length > MAX_PASSWORD_LENGTH || groups < 3 || new Set(password).size < 8) {
    throw new Error("请显式配置 ADMIN_PASSWORD：16–128 个字符，至少包含大小写字母、数字、符号中的三类；复制 .env.example 后设置独立强密码再启动。升级说明见 README。");
  }
  return password;
};
