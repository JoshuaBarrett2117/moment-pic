import type { SmartAlbumRuleDTO } from '../../types/api';

export type SmartAlbumRuleDraft = Omit<SmartAlbumRuleDTO, 'id' | 'createdAt' | 'updatedAt'>;

export const DEFAULT_SMART_ALBUM_RULE: SmartAlbumRuleDraft = {
  name: '',
  enabled: true,
  sourceEngine: 'manual',
  priority: 100,
  scope: 'albumName',
  matchMode: 'contains',
  patterns: [''],
  normalizeOptions: {
    trimSpaces: true,
    normalizeCase: true,
    stripSequenceNo: true,
    stripDate: true,
    stripPageStats: true,
    stripSizeStats: true,
  },
  action: 'assignSmartAlbum',
  targetName: null,
  targetNameTemplate: '{{token}}',
  minAlbumCount: 2,
  minConfidence: 1,
  generatedNormalizedKey: null,
  generatedConfidence: null,
  generatedReason: null,
  generatedRunId: null,
};

export const normalizeRulePatterns = (patterns: string[]): string[] =>
  patterns.map((item) => item.trim()).filter(Boolean);

export const toEditableRuleDraft = (rule: SmartAlbumRuleDTO): SmartAlbumRuleDraft => ({
  name: rule.name,
  enabled: rule.enabled,
  priority: rule.priority,
  scope: rule.scope,
  matchMode: rule.matchMode,
  patterns: rule.patterns,
  normalizeOptions: rule.normalizeOptions,
  action: rule.action,
  targetName: rule.targetName,
  targetNameTemplate: rule.targetNameTemplate,
  minAlbumCount: rule.minAlbumCount,
  minConfidence: rule.minConfidence,
  sourceEngine: 'manual',
  generatedNormalizedKey: null,
  generatedConfidence: null,
  generatedReason: null,
  generatedRunId: null,
});
