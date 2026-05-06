import { describe, it, expect } from 'vitest';
import {
  createSyntheticUserMessage,
  appendToLastTextPart,
  findLastAssistantMessage,
} from '../../../src/opencode-plugin/context-compression/message-utils.js';
import type { WithParts } from '../../../src/opencode-plugin/context-compression/types.js';

function makeMessage(role: string, text: string, id = 'msg-1'): WithParts {
  return {
    info: { id, sessionID: 'sess-1', role, time: { created: 1000 } },
    parts: [{ type: 'text', text, id: `prt-${id}`, sessionID: 'sess-1', messageID: id }],
  };
}

describe('message-utils', () => {
  describe('createSyntheticUserMessage', () => {
    it('creates a user message with deterministic ID', () => {
      const base = makeMessage('user', 'hello');
      const msg = createSyntheticUserMessage(base, 'summary content', 'seed-1');
      expect(msg.info.role).toBe('user');
      expect(msg.info.sessionID).toBe('sess-1');
      expect(msg.parts[0].text).toBe('summary content');
      expect(msg.info.id).toMatch(/^msg_codespec_/);
    });

    it('generates same ID for same seed', () => {
      const base = makeMessage('user', 'hello');
      const msg1 = createSyntheticUserMessage(base, 'a', 'seed-x');
      const msg2 = createSyntheticUserMessage(base, 'b', 'seed-x');
      expect(msg1.info.id).toBe(msg2.info.id);
    });

    it('generates different IDs for different seeds', () => {
      const base = makeMessage('user', 'hello');
      const msg1 = createSyntheticUserMessage(base, 'a', 'seed-a');
      const msg2 = createSyntheticUserMessage(base, 'b', 'seed-b');
      expect(msg1.info.id).not.toBe(msg2.info.id);
    });
  });

  describe('appendToLastTextPart', () => {
    it('appends to last text part', () => {
      const msg = makeMessage('assistant', 'hello');
      const result = appendToLastTextPart(msg, 'world');
      expect(result).toBe(true);
      expect(msg.parts[0].text).toBe('hello\n\nworld');
    });

    it('returns false if no text part', () => {
      const msg: WithParts = {
        info: { id: 'msg-1', sessionID: 'sess-1', role: 'assistant', time: { created: 1000 } },
        parts: [{ type: 'tool', callID: 'c1', tool: 'edit' }],
      };
      expect(appendToLastTextPart(msg, 'text')).toBe(false);
    });
  });

  describe('findLastAssistantMessage', () => {
    it('finds last assistant message', () => {
      const messages = [
        makeMessage('user', 'u1', 'm1'),
        makeMessage('assistant', 'a1', 'm2'),
        makeMessage('user', 'u2', 'm3'),
        makeMessage('assistant', 'a2', 'm4'),
      ];
      const result = findLastAssistantMessage(messages);
      expect(result!.info.id).toBe('m4');
    });

    it('returns null if no assistant message', () => {
      const messages = [makeMessage('user', 'u1', 'm1')];
      expect(findLastAssistantMessage(messages)).toBeNull();
    });

    it('returns null for empty array', () => {
      expect(findLastAssistantMessage([])).toBeNull();
    });
  });
});