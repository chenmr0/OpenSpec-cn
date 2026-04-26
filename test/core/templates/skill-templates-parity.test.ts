import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  type SkillTemplate,
  getApplyChangeSkillTemplate,
  getArchiveChangeSkillTemplate,
  getBulkArchiveChangeSkillTemplate,
  getContinueChangeSkillTemplate,
  getExploreSkillTemplate,
  getFeedbackSkillTemplate,
  getFfChangeSkillTemplate,
  getNewChangeSkillTemplate,
  getOnboardSkillTemplate,
  getOpsxApplyCommandTemplate,
  getOpsxArchiveCommandTemplate,
  getOpsxBulkArchiveCommandTemplate,
  getOpsxContinueCommandTemplate,
  getOpsxExploreCommandTemplate,
  getOpsxFfCommandTemplate,
  getOpsxNewCommandTemplate,
  getOpsxOnboardCommandTemplate,
  getOpsxSyncCommandTemplate,
  getOpsxProposeCommandTemplate,
  getOpsxProposeSkillTemplate,
  getOpsxVerifyCommandTemplate,
  getSyncSpecsSkillTemplate,
  getVerifyChangeSkillTemplate,
} from '../../../src/core/templates/skill-templates.js';
import { generateSkillContent } from '../../../src/core/shared/skill-generation.js';

const EXPECTED_FUNCTION_HASHES: Record<string, string> = {
  getExploreSkillTemplate: '31297bccd5ccd3d8425da1eaee80d5b89d9ca7c336cc6313a44becd618a4df3a',
  getNewChangeSkillTemplate: '57b004ad338cb59f4df5b9fbbdffc0e15247bf18bb3e2bc8caee6a6aad555efa',
  getContinueChangeSkillTemplate: '135dec9d65ba08f347a340910821a209cbb8ebcfb294563cfcb56ccd4409deed',
  getApplyChangeSkillTemplate: '86e69fb3c2483b39be39ddac9fc0568f9bd594721bec7f0e0c405f81ec4ed67b',
  getFfChangeSkillTemplate: '7cf1fe1f2fdff7b180182237a1ba0d89416a86b309ddc59d9491ad595d3e059e',
  getSyncSpecsSkillTemplate: '1ef5c67c7144bf002fb5ac7e2c446ac4f36f94ea93a98a7de602e14522491b85',
  getOnboardSkillTemplate: 'f1dc1e225e97cb7e243cdae996756ab195eead782159b86132d52be29567d1a5',
  getOpsxExploreCommandTemplate: '85499d95d9067338eaf431b6d9cfd2ea3512d53dab0b805be340aeae67990f6a',
  getOpsxNewCommandTemplate: 'a2342694ca2c91f8001fb446cb837b4f8669eae5cb98e64c6a3ccfb07070ee7e',
  getOpsxContinueCommandTemplate: '81ebe1ede958b9ef582f8ef2b03b3b319de95a593461fb079cd56c5d73e36b3f',
  getOpsxApplyCommandTemplate: '22d0852a0b5982ef2be0fdbfc8b18958bf61cddf9497a7e06d5aaa184edda34c',
  getOpsxFfCommandTemplate: '33f9798d3d5bcaf15696f41c5378dc94d5c4659ef83bb35752b4fdde21957164',
  getArchiveChangeSkillTemplate: 'a3883a7735d2870ca78f9f84a91bfe7b8a3fd78d46e63608572db2e50a823294',
  getBulkArchiveChangeSkillTemplate: 'b7ffe5cb7f50a3efc5cb6ed2a4aefc31b17f6bad77bbaa50933bdc4f69a94785',
  getOpsxSyncCommandTemplate: 'c2ce409d87838e11d4bededbc76b3330a169b09ee22088a4588501c8ec211047',
  getVerifyChangeSkillTemplate: '0a7597ffeb7efdb8dace8920237f88285320ce78a5087a154f6f50a4ddb14d91',
  getOpsxArchiveCommandTemplate: 'daaa9affe4535c3011980f1a994df61cb9954b602e4fbc841473b3e1c080e7ca',
  getOpsxOnboardCommandTemplate: '3bc794d527b08d6b7143194214e9abd9f3c9935e7a5eebae24937e1c01a29d9d',
  getOpsxBulkArchiveCommandTemplate: '370c15f95e24ec2f2d76d56262315287baeec8095aa5d1adff7ea967fa0f2097',
  getOpsxVerifyCommandTemplate: 'bf74fdfef58adecd901bd2661184b0cdcc5c8ef0dda9668a6796420e3950c9c7',
  getOpsxProposeSkillTemplate: '72df18abd469919a34f81e326e05672573c7f725d4c8bd4e9d521eb0bd4aea8e',
  getOpsxProposeCommandTemplate: 'c37d303c49a247da9a3ee1bb4be61b27a2abed6ae4d8a7bfb9f800af338d38da',
  getFeedbackSkillTemplate: 'e7dfba0d2aab031384363d70e8f47c3d40979782be09f4c68eea57d7600f19e6',
};

const EXPECTED_GENERATED_SKILL_CONTENT_HASHES: Record<string, string> = {
  'openspec-explore': '26400d51c96d845fbd539851608389a9f103d33367c90c39181db89ba3d92ec7',
  'openspec-new-change': 'f1664a39db007a5588d9b5a65cc2521e0db7cc5062c86afd7e45fff3bc3fbef7',
  'openspec-continue-change': 'd84fe1d671069f69efb7c29f95317bdb9bda06dc24473ab7f37b5d8860ebf6b0',
  'openspec-apply-change': 'c09a7017e49b0eba0723ad888a75cdda99b2fd4fdd6ec3739327393f81184d2b',
  'openspec-ff-change': '25b7914389e73f9759ff6b30064f447e5548a3a5c4314b419fdf2ff8a987c78d',
  'openspec-sync-specs': '5006fa4c8da364b5d7717e1daa97c2d51355e8734e55e6f258009598e0f88163',
  'openspec-archive-change': 'b3cdfa63b21e253e3398a137c787b4ac3a1bb6fb81b1cef2398544f709add35b',
  'openspec-bulk-archive-change': '736c22b72861a2ee228cb58fd737a08f1f3e1049a536d3eed5655be7a852b005',
  'openspec-verify-change': '7814417f205a9178eecf4c37f32587924c814175ff8cedcfe427084242cf6f27',
  'openspec-onboard': '0f8da5681b93fe7848159dd560a117a4d0d5821cdbeede0128263a86a06db1bd',
  'openspec-propose': 'da1af45c6db59ba0144571fa3cde33ba488929eef4b4e281a4dc6a47956302a5',
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('skill templates split parity', () => {
  it('preserves all template function payloads exactly', () => {
    const functionFactories: Record<string, () => unknown> = {
      getExploreSkillTemplate,
      getNewChangeSkillTemplate,
      getContinueChangeSkillTemplate,
      getApplyChangeSkillTemplate,
      getFfChangeSkillTemplate,
      getSyncSpecsSkillTemplate,
      getOnboardSkillTemplate,
      getOpsxExploreCommandTemplate,
      getOpsxNewCommandTemplate,
      getOpsxContinueCommandTemplate,
      getOpsxApplyCommandTemplate,
      getOpsxFfCommandTemplate,
      getArchiveChangeSkillTemplate,
      getBulkArchiveChangeSkillTemplate,
      getOpsxSyncCommandTemplate,
      getVerifyChangeSkillTemplate,
      getOpsxArchiveCommandTemplate,
      getOpsxOnboardCommandTemplate,
      getOpsxBulkArchiveCommandTemplate,
      getOpsxVerifyCommandTemplate,
      getOpsxProposeSkillTemplate,
      getOpsxProposeCommandTemplate,
      getFeedbackSkillTemplate,
    };

    const actualHashes = Object.fromEntries(
      Object.entries(functionFactories).map(([name, fn]) => [name, hash(stableStringify(fn()))])
    );

    expect(actualHashes).toEqual(EXPECTED_FUNCTION_HASHES);
  });

  it('preserves generated skill file content exactly', () => {
    // Intentionally excludes getFeedbackSkillTemplate: skillFactories only models templates
    // deployed via generateSkillContent, while feedback is covered in function payload parity.
    const skillFactories: Array<[string, () => SkillTemplate]> = [
      ['openspec-explore', getExploreSkillTemplate],
      ['openspec-new-change', getNewChangeSkillTemplate],
      ['openspec-continue-change', getContinueChangeSkillTemplate],
      ['openspec-apply-change', getApplyChangeSkillTemplate],
      ['openspec-ff-change', getFfChangeSkillTemplate],
      ['openspec-sync-specs', getSyncSpecsSkillTemplate],
      ['openspec-archive-change', getArchiveChangeSkillTemplate],
      ['openspec-bulk-archive-change', getBulkArchiveChangeSkillTemplate],
      ['openspec-verify-change', getVerifyChangeSkillTemplate],
      ['openspec-onboard', getOnboardSkillTemplate],
      ['openspec-propose', getOpsxProposeSkillTemplate],
    ];

    const actualHashes = Object.fromEntries(
      skillFactories.map(([dirName, createTemplate]) => [
        dirName,
        hash(generateSkillContent(createTemplate(), 'PARITY-BASELINE')),
      ])
    );

    expect(actualHashes).toEqual(EXPECTED_GENERATED_SKILL_CONTENT_HASHES);
  });
});
