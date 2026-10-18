import { getDb } from "../db/sqlite.js";

export const probeDatabaseDb = (): void => { getDb().prepare("SELECT 1 AS ok").get(); };
