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
  getExploreSkillTemplate: '7a588d6c6dc41d45661c0e038f032ea53abaa1db5761f48d0dc0690c6f5fd59f',
  getNewChangeSkillTemplate: 'b4bda18a532167b246e296bb81389f6601ea27660329e6f7959884038e8d4d16',
  getContinueChangeSkillTemplate: '7ddaf0651e09e8df49083dc86310946488d24fe8d8eba487a2664a71b3d43a9a',
  getApplyChangeSkillTemplate: 'ffb33cf5bf8607ba6f72a012e9a6b03d23bb4482829f273888f83156383aa170',
  getFfChangeSkillTemplate: '5926a619e73bf70a73567de88af269162c73fb73294c41415d3cf0c8a4c278fa',
  getSyncSpecsSkillTemplate: '4683a61015dc1fbe8add38985bdd0e01be661f82471f2ac4d0efd890635b43ec',
  getOnboardSkillTemplate: '6ef217ffe78c3186a67a849466930cafa7a7ea389a37fb17198040d908daace4',
  getOpsxExploreCommandTemplate: '7314e78fe42cbcb6e86c7746f12fdd9c1fd254cc1d43a3b5620850ea97ffcc76',
  getOpsxNewCommandTemplate: '9849dc9a6fb7e678672f1baef4377302b86c3181663cfdce9af81119c4861e26',
  getOpsxContinueCommandTemplate: 'a9f23050acab52c9aed6f3defbe1e254d0e82cb0c6574f941d4f800ff9fb111c',
  getOpsxApplyCommandTemplate: 'f70f43b6652757698a0832d5fc5dcf645e47e6cd41841ab38c17b650f40fe436',
  getOpsxFfCommandTemplate: 'b68c64b6aabae225ba9eb01d83aebb1a0e9ded5f62e48d643e1f19d577a88e73',
  getArchiveChangeSkillTemplate: '58fd91ba35e953faaa7f60bb6320bd4488b0474f1ebc82b0b1dbbf288aac8205',
  getBulkArchiveChangeSkillTemplate: '4037c88f6f16fd65d0ba284185500105e8cf322824ece8122c660d08de8c0a9b',
  getOpsxSyncCommandTemplate: '46bd0ff6efb194f91cef351ce90e0fa098a87ca89eed2faace4cbd10cefc0afc',
  getVerifyChangeSkillTemplate: '6c8eca6b17c7470675c5ae2cc57744112471d7dfc5dc08105fdd31ab416fa236',
  getOpsxArchiveCommandTemplate: 'f57d92cb876494a1f2cff4acdd6de5d8c53f671c1d5ad742f41be0f7ddbd6adb',
  getOpsxOnboardCommandTemplate: 'ea6491d56b5e5aa5747e2b2368b0badbf152397b193b5627df1ce037f1e45e34',
  getOpsxBulkArchiveCommandTemplate: '6e633296d1388b901611b8c2abb70baf323ddc31d48571cc6f33688498b0032e',
  getOpsxVerifyCommandTemplate: 'da84a351871074f2ee4fd2a71dbda388e32d33feea8b9dcbbdcd64fafaceee86',
  getOpsxProposeSkillTemplate: '41dd9ca813c342a40d29a4c16d6cc83fc3e8f81fa98b0d57f5ace5685292734f',
  getOpsxProposeCommandTemplate: 'fa1713181b0370488f37ee0b069ff62cfbdd5f01cf0659f6a71efd351f8b7218',
  getFeedbackSkillTemplate: '14e3a17f55fdd22caeee85c9f4245ed31867f49d131ef96908cddb30da78c775',
};

const EXPECTED_GENERATED_SKILL_CONTENT_HASHES: Record<string, string> = {
  'codespec-explore': '9a4b0c2101d571685ff1f40886c7624b59ac3397f117d28ead0bbcb246886bf9',
  'codespec-new-change': '09398d59a4f7949992f2cd3f72378e19042b10e9465762599e533977b4dd9179',
  'codespec-continue-change': 'fffd0fb0c0b4e44bf6bb71e09b7c97a3cf77670abb5538be84cc320acebc48d0',
  'codespec-apply-change': '5da6e3fa707414d411d07293081b2f0eb41e87334bc46bf04411b9f11cd6db62',
  'codespec-ff-change': 'd879ddef56266ca74494743cd0bdabd8fa1fb7dcbb36e72f6892b2ee0abad795',
  'codespec-sync-specs': 'af9fe8fb030f7af94adfe4c4313bb27cc7f1ea673d4dea7c56a64f93569a19f7',
  'codespec-archive-change': 'a582801d2ada6b83e4b55df13630f1fec2c9b0620608e04bf8ed2e47b735b8ee',
  'codespec-bulk-archive-change': '5e32574489e46d65ac34961934c06455d22e45f48145904c82063b7250cf09a4',
  'codespec-verify-change': '96c402cf38c6fad78d63e94872f6b323f646c239c19ba26f080a798b96a0bf46',
  'codespec-onboard': '7a9acacd05d525a68ffdc8481a5538c77405a4cf15004549d7b2b2686e88a0c6',
  'codespec-propose': 'e386c70b48a100471a9c46a1da9c1135d59bdd1f620228646b6bcf2efbfeee13',
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
      ['codespec-explore', getExploreSkillTemplate],
      ['codespec-new-change', getNewChangeSkillTemplate],
      ['codespec-continue-change', getContinueChangeSkillTemplate],
      ['codespec-apply-change', getApplyChangeSkillTemplate],
      ['codespec-ff-change', getFfChangeSkillTemplate],
      ['codespec-sync-specs', getSyncSpecsSkillTemplate],
      ['codespec-archive-change', getArchiveChangeSkillTemplate],
      ['codespec-bulk-archive-change', getBulkArchiveChangeSkillTemplate],
      ['codespec-verify-change', getVerifyChangeSkillTemplate],
      ['codespec-onboard', getOnboardSkillTemplate],
      ['codespec-propose', getOpsxProposeSkillTemplate],
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
