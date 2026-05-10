import { getDb } from "../db/sqlite.js";
import type {
  SmartAlbumAiConfigRecord,
  SmartAlbumMatchRecord,
  SmartAlbumMemberRecord,
  SmartAlbumRecord,
  SmartAlbumRuleRecord
} from "../types/store.js";
import {
  rowToSmartAlbum,
  rowToSmartAlbumAiConfig,
  rowToSmartAlbumMember,
  rowToSmartAlbumRule
} from "./sqlite-mappers.js";

export const listSmartAlbumsDb = (
  page: number,
  pageSize: number,
  input?: {
    keyword?: string;
    status?: "active" | "hidden" | "review_pending";
    sortBy?: "name" | "updatedAt" | "albumCount" | "assetCount";
    sortOrder?: "asc" | "desc";
  }
) => {
  const db = getDb();
  const conditions: string[] = [];
  const params: Record<string, unknown> = {
    limit: pageSize,
    offset: (page - 1) * pageSize
  };

  if (input?.keyword?.trim()) {
    conditions.push("name LIKE @keyword");
    params.keyword = `%${input.keyword.trim()}%`;
  }

  if (input?.status) {
    conditions.push("status = @status");
    params.status = input.status;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderByMap = {
    name: "name",
    updatedAt: "updated_at",
    albumCount: "album_count",
    assetCount: "asset_count"
  } as const;
  const sortBy = input?.sortBy ?? "updatedAt";
  const sortOrder = input?.sortOrder ?? "desc";
  const orderBy = `${orderByMap[sortBy]} ${sortOrder.toUpperCase()}, name ASC`;

  const items = db
    .prepare(`SELECT * FROM smart_albums ${where} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`)
    .all(params)
    .map((row: unknown) => rowToSmartAlbum(row as Record<string, unknown>));
  const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM smart_albums ${where}`).get(params) as { total: number };
  return { items, total: totalRow.total };
};

export const findSmartAlbumByIdDb = (smartAlbumId: string): SmartAlbumRecord | null => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM smart_albums WHERE id = ? LIMIT 1").get(smartAlbumId) as Record<string, unknown> | undefined;
  return row ? rowToSmartAlbum(row) : null;
};

export const listSmartAlbumMembersDb = (smartAlbumId: string): SmartAlbumMemberRecord[] => {
  const db = getDb();
  return db
    .prepare("SELECT * FROM smart_album_members WHERE smart_album_id = ? AND is_excluded = 0 ORDER BY confidence DESC, created_at ASC")
    .all(smartAlbumId)
    .map((row: unknown) => rowToSmartAlbumMember(row as Record<string, unknown>));
};

export const listSmartAlbumRulesDb = (): SmartAlbumRuleRecord[] => {
  const db = getDb();
  return db
    .prepare("SELECT * FROM smart_album_rules ORDER BY priority DESC, created_at ASC")
    .all()
    .map((row: unknown) => rowToSmartAlbumRule(row as Record<string, unknown>));
};

export const findSmartAlbumRuleByIdDb = (ruleId: string): SmartAlbumRuleRecord | null => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM smart_album_rules WHERE id = ? LIMIT 1").get(ruleId) as Record<string, unknown> | undefined;
  return row ? rowToSmartAlbumRule(row) : null;
};

export const upsertSmartAlbumRuleDb = (rule: SmartAlbumRuleRecord): SmartAlbumRuleRecord => {
  const db = getDb();
  db.prepare(`
    INSERT INTO smart_album_rules (
      id, name, enabled, source_engine, priority, scope, match_mode, patterns_json, normalize_options_json,
      action, target_name, target_name_template, min_album_count, min_confidence,
      generated_normalized_key, generated_confidence, generated_reason, generated_run_id, created_at, updated_at
    )
    VALUES (
      @id, @name, @enabled, @sourceEngine, @priority, @scope, @matchMode, @patternsJson, @normalizeOptionsJson,
      @action, @targetName, @targetNameTemplate, @minAlbumCount, @minConfidence,
      @generatedNormalizedKey, @generatedConfidence, @generatedReason, @generatedRunId, @createdAt, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      enabled = excluded.enabled,
      source_engine = excluded.source_engine,
      priority = excluded.priority,
      scope = excluded.scope,
      match_mode = excluded.match_mode,
      patterns_json = excluded.patterns_json,
      normalize_options_json = excluded.normalize_options_json,
      action = excluded.action,
      target_name = excluded.target_name,
      target_name_template = excluded.target_name_template,
      min_album_count = excluded.min_album_count,
      min_confidence = excluded.min_confidence,
      generated_normalized_key = excluded.generated_normalized_key,
      generated_confidence = excluded.generated_confidence,
      generated_reason = excluded.generated_reason,
      generated_run_id = excluded.generated_run_id,
      updated_at = excluded.updated_at
  `).run({
    ...rule,
    enabled: rule.enabled ? 1 : 0
  });

  return rule;
};

export const replaceSmartAlbumRulesBySourceEngineDb = (sourceEngine: "manual" | "ai", rules: SmartAlbumRuleRecord[]) => {
  const db = getDb();
  const deleteRules = db.prepare("DELETE FROM smart_album_rules WHERE source_engine = ?");
  const insertRule = db.prepare(`
    INSERT INTO smart_album_rules (
      id, name, enabled, source_engine, priority, scope, match_mode, patterns_json, normalize_options_json,
      action, target_name, target_name_template, min_album_count, min_confidence,
      generated_normalized_key, generated_confidence, generated_reason, generated_run_id, created_at, updated_at
    )
    VALUES (
      @id, @name, @enabled, @sourceEngine, @priority, @scope, @matchMode, @patternsJson, @normalizeOptionsJson,
      @action, @targetName, @targetNameTemplate, @minAlbumCount, @minConfidence,
      @generatedNormalizedKey, @generatedConfidence, @generatedReason, @generatedRunId, @createdAt, @updatedAt
    )
  `);

  const transaction = db.transaction(() => {
    deleteRules.run(sourceEngine);
    for (const rule of rules) {
      insertRule.run({
        ...rule,
        enabled: rule.enabled ? 1 : 0
      });
    }
  });

  transaction();
};

export const clearSmartAlbumDataDb = () => {
  const db = getDb();
  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM smart_album_members").run();
    db.prepare("DELETE FROM smart_album_match_records").run();
    db.prepare("DELETE FROM smart_albums").run();
    db.prepare("DELETE FROM smart_album_rules").run();
  });

  transaction();
};

export const deleteSmartAlbumRuleDb = (ruleId: string): boolean => {
  const db = getDb();
  const result = db.prepare("DELETE FROM smart_album_rules WHERE id = ?").run(ruleId);
  return result.changes > 0;
};

export const getSmartAlbumAiConfigDb = (): SmartAlbumAiConfigRecord => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM smart_album_ai_configs WHERE id = 'smart_album_ai_config'").get() as Record<string, unknown>;
  return rowToSmartAlbumAiConfig(row);
};

export const updateSmartAlbumAiConfigDb = (
  updates: Omit<SmartAlbumAiConfigRecord, "createdAt" | "updatedAt">
): SmartAlbumAiConfigRecord => {
  const db = getDb();
  const existing = getSmartAlbumAiConfigDb();
  const next: SmartAlbumAiConfigRecord = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString()
  };

  db.prepare(`
    UPDATE smart_album_ai_configs
    SET enabled = @enabled,
        mode = @mode,
        provider = @provider,
        api_endpoint = @apiEndpoint,
        api_token = @apiToken,
        api_model = @apiModel,
        min_confidence_auto_apply = @minConfidenceAutoApply,
        min_cluster_album_count = @minClusterAlbumCount,
        max_suggestions_per_run = @maxSuggestionsPerRun,
        allow_alias_merge = @allowAliasMerge,
        allow_cross_root_grouping = @allowCrossRootGrouping,
        excluded_tokens_json = @excludedTokensJson,
        preferred_scopes_json = @preferredScopesJson,
        review_required_below_confidence = @reviewRequiredBelowConfidence,
        updated_at = @updatedAt
    WHERE id = @id
  `).run({
    ...next,
    enabled: next.enabled ? 1 : 0,
    allowAliasMerge: next.allowAliasMerge ? 1 : 0,
    allowCrossRootGrouping: next.allowCrossRootGrouping ? 1 : 0
  });

  return getSmartAlbumAiConfigDb();
};

export const replaceSmartAlbumsDb = (input: {
  smartAlbums: SmartAlbumRecord[];
  members: SmartAlbumMemberRecord[];
  matchRecords: SmartAlbumMatchRecord[];
}) => {
  const db = getDb();
  const deleteMembers = db.prepare("DELETE FROM smart_album_members");
  const deleteAlbums = db.prepare("DELETE FROM smart_albums");
  const deleteMatchRecords = db.prepare("DELETE FROM smart_album_match_records");
  const insertAlbum = db.prepare(`
    INSERT INTO smart_albums (
      id, name, normalized_key, cover_asset_id, album_count, asset_count, source_summary, status, created_at, updated_at
    )
    VALUES (
      @id, @name, @normalizedKey, @coverAssetId, @albumCount, @assetCount, @sourceSummary, @status, @createdAt, @updatedAt
    )
  `);
  const insertMember = db.prepare(`
    INSERT INTO smart_album_members (
      id, smart_album_id, album_id, source_engine, match_record_id, confidence, is_pinned, is_excluded, created_at, updated_at
    )
    VALUES (
      @id, @smartAlbumId, @albumId, @sourceEngine, @matchRecordId, @confidence, @isPinned, @isExcluded, @createdAt, @updatedAt
    )
  `);
  const insertMatchRecord = db.prepare(`
    INSERT INTO smart_album_match_records (
      id, album_id, smart_album_name, normalized_key, source_engine, rule_id, confidence, matched_scopes_json, matched_tokens_json, reason, run_id, created_at
    )
    VALUES (
      @id, @albumId, @smartAlbumName, @normalizedKey, @sourceEngine, @ruleId, @confidence, @matchedScopesJson, @matchedTokensJson, @reason, @runId, @createdAt
    )
  `);

  const transaction = db.transaction(() => {
    deleteMembers.run();
    deleteAlbums.run();
    deleteMatchRecords.run();
    for (const record of input.matchRecords) {
      insertMatchRecord.run(record);
    }
    for (const smartAlbum of input.smartAlbums) {
      insertAlbum.run(smartAlbum);
    }
    for (const member of input.members) {
      insertMember.run({
        ...member,
        isPinned: member.isPinned ? 1 : 0,
        isExcluded: member.isExcluded ? 1 : 0
      });
    }
  });

  transaction();
};
