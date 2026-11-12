import { describe, expect, it } from 'vitest';

import { InboxEntry, InboxStatus } from './inbox-entry';

describe('InboxEntry', () => {
  it('should create a pending inbox entry', () => {
    const entry = InboxEntry.create({
      id: 'inbox-1',
      messageId: 'msg-1',
      type: 'WAGER_PROCESSED',
      payload: { ok: true },
    });

    expect(entry.status).toBe(InboxStatus.Pending);
    expect(entry.messageId).toBe('msg-1');
  });

  it('should mark an inbox entry as processed', () => {
    const processedAt = new Date('2026-11-11T00:00:00.000Z');
    const entry = InboxEntry.create({
      id: 'inbox-2',
      messageId: 'msg-2',
      type: 'WAGER_PROCESSED',
      payload: { ok: true },
    });

    entry.markProcessed(processedAt);

    expect(entry.status).toBe(InboxStatus.Processed);
    expect(entry.isProcessed()).toBe(true);
    expect(entry.processedAt).toEqual(processedAt);
  });
});
