import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRulePatterns, toEditableRuleDraft } from './smart-album-rule-draft';
import type { SmartAlbumRuleDTO } from '../../types/api';

test('normalizeRulePatterns trims blank rule patterns', () => {
  assert.deepEqual(normalizeRulePatterns(['  桜桃喵 ', '', '  yuuhui  ']), ['桜桃喵', 'yuuhui']);
});

test('toEditableRuleDraft resets generated metadata for manual editing', () => {
  const rule: SmartAlbumRuleDTO = {
    id: 'rule_1',
    name: 'AI 规则',
    enabled: true,
    sourceEngine: 'ai',
    priority: 80,
    scope: 'albumName',
    matchMode: 'contains',
    patterns: ['target'],
    normalizeOptions: {
      trimSpaces: true,
      normalizeCase: true,
      stripSequenceNo: true,
      stripDate: true,
      stripPageStats: true,
      stripSizeStats: true,
    },
    action: 'assignSmartAlbum',
    targetName: 'target',
    targetNameTemplate: '{{token}}',
    minAlbumCount: 2,
    minConfidence: 0.8,
    generatedNormalizedKey: 'target',
    generatedConfidence: 0.92,
    generatedReason: 'clustered',
    generatedRunId: 'run_1',
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  };

  const draft = toEditableRuleDraft(rule);

  assert.equal(draft.sourceEngine, 'manual');
  assert.equal(draft.generatedNormalizedKey, null);
  assert.equal(draft.generatedConfidence, null);
  assert.equal(draft.generatedReason, null);
  assert.equal(draft.generatedRunId, null);
});
