export const parseBoundedInteger = (
  value: unknown,
  input: {
    defaultValue: number;
    min: number;
    max: number;
  }
): number => {
  const numeric = typeof value === "string" || typeof value === "number"
    ? Number(value)
    : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return input.defaultValue;
  }

  return Math.max(input.min, Math.min(input.max, Math.trunc(numeric)));
};

export const parseEnumValue = <T extends string>(
  value: unknown,
  allowedValues: readonly T[]
): T | undefined => {
  return typeof value === "string" && (allowedValues as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
};

export const parseOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;
