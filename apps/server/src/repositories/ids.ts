import crypto from "node:crypto";

export const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
