import { vi } from 'vitest';

global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/messages')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        id: 'msg-test-123',
        content: [{ type: 'text', text: 'Transfer complete' }],
        stop_reason: 'end_turn',
      }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  });
});
