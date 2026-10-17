import path from "node:path";

export const normalizeExtension = (filename: string): string => {
  const extension = path.extname(filename).replace(".", "").toLowerCase();
  return extension;
};

export const toPosixPath = (value: string): string => value.split(path.sep).join("/");

export const normalizeSourcePath = (value: string): string => {
  const normalized = path.normalize(value);
  return normalized === path.parse(normalized).root ? normalized : normalized.replace(/[\\/]+$/, "");
};
