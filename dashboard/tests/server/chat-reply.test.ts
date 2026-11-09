import { describe, expect, it } from 'vitest';
import { cleanChatReply, TOOLS_UNAVAILABLE_NOTICE as notice } from '../../server/chat/reply';

describe('cleanChatReply', () => {
  it.each(['Plain reply.\nStill plain.', 'Please invoke a discussion.', 'a < b', ''])('preserves prose: %s', text => {
    expect(cleanChatReply(text)).toBe(text);
  });
  it.each([
    '<invoke>hidden</invoke>', '<parameter name="x">hidden</parameter>',
    '<function_calls><invoke><parameter>hidden</parameter></invoke></function_calls>',
    '<ns:invoke name="read">hidden</ns:invoke>', '<ns:parameter x="y">hidden',
    '<function_calls>hidden', '<invoke>hidden', '<parameter>hidden',
    '<invoke/> \n <parameter>hidden</parameter> <function_calls>hidden</function_calls>',
    '<ns:function_calls mode="x"><ns:invoke>hidden</ns:invoke></ns:function_calls>',
  ])('replaces tool markup: %s', text => {
    expect(cleanChatReply(text)).toBe(notice);
  });
  it('keeps surrounding text and separates nonadjacent notices', () => {
    expect(cleanChatReply('Before <invoke>x</invoke> middle <parameter>y</parameter> after'))
      .toBe(`Before ${notice} middle ${notice} after`);
  });
  it('keeps text preceding an unclosed block', () => {
    expect(cleanChatReply('Before <invoke name="x">hidden')).toBe(`Before ${notice}`);
  });
});
