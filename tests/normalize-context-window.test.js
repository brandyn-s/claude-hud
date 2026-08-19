import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeContextWindow, getContextPercent } from '../dist/stdin.js';

// Verbatim frame captured from a live Fable 5 session's context-cache on
// 2026-08-19: ~473K real tokens beside context_window_size=200000, with
// used_percentage clamped to 100. Fable 5's window is 1M.
function measuredFableFrame() {
  return {
    model: { id: 'us.anthropic.claude-fable-5', display_name: 'Fable 5' },
    context_window: {
      used_percentage: 100,
      remaining_percentage: 0,
      current_usage: {
        input_tokens: 2,
        output_tokens: 3,
        cache_creation_input_tokens: 1977,
        cache_read_input_tokens: 471602,
      },
      context_window_size: 200000,
    },
  };
}

test('normalizeContextWindow lifts the measured under-reported Fable frame to 1M', () => {
  const stdin = measuredFableFrame();
  normalizeContextWindow(stdin);

  assert.equal(stdin.context_window.context_window_size, 1_000_000);
  // 2 + 1977 + 471602 = 473581 -> 47% of 1M (output tokens are not context)
  assert.equal(stdin.context_window.used_percentage, 47);
  assert.equal(stdin.context_window.remaining_percentage, 53);
  assert.equal(getContextPercent(stdin), 47);
});

test('normalizeContextWindow matches on display name when id is absent', () => {
  const stdin = measuredFableFrame();
  delete stdin.model.id;
  stdin.model.display_name = 'Fable';
  normalizeContextWindow(stdin);
  assert.equal(stdin.context_window.context_window_size, 1_000_000);
});

test('normalizeContextWindow leaves an already-correct 1M frame untouched', () => {
  const stdin = measuredFableFrame();
  stdin.context_window.context_window_size = 1_000_000;
  stdin.context_window.used_percentage = 47;
  stdin.context_window.remaining_percentage = 53;
  normalizeContextWindow(stdin);

  assert.equal(stdin.context_window.context_window_size, 1_000_000);
  assert.equal(stdin.context_window.used_percentage, 47);
});

test('normalizeContextWindow is a no-op for non-covered models', () => {
  const stdin = measuredFableFrame();
  stdin.model = { id: 'claude-haiku-4-5', display_name: 'Haiku 4.5' };
  normalizeContextWindow(stdin);

  // Haiku genuinely has a 200K window; the frame must pass through unchanged.
  assert.equal(stdin.context_window.context_window_size, 200000);
  assert.equal(stdin.context_window.used_percentage, 100);
});

test('normalizeContextWindow is a no-op without a context_window', () => {
  const stdin = { model: { id: 'claude-fable-5' } };
  normalizeContextWindow(stdin);
  assert.equal(stdin.context_window, undefined);
});

test('normalizeContextWindow corrects the size but keeps zero-usage frames zero', () => {
  const stdin = measuredFableFrame();
  stdin.context_window.current_usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  stdin.context_window.used_percentage = 0;
  stdin.context_window.remaining_percentage = 100;
  normalizeContextWindow(stdin);

  assert.equal(stdin.context_window.context_window_size, 1_000_000);
  // No token evidence: leave the native zero alone rather than synthesizing.
  assert.equal(stdin.context_window.used_percentage, 0);
});
