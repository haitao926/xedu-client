import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('AI config exposes OpenAI Responses API mode end-to-end', async () => {
  const [html, aiJs, systemConfig] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../ai.js', import.meta.url), 'utf8'),
    readFile(new URL('./system-config.js', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /id="ai-api-mode"/);
  assert.match(html, /class="ai-config-form"/);
  assert.match(html, /<option value="auto">自动<\/option>/);
  assert.match(html, /OpenAI Responses API/);
  assert.match(html, /<option value="chat_completions">Chat Completions<\/option>/);
  assert.doesNotMatch(html, /api\.openai\.com\/v1 会自动使用/);
  assert.doesNotMatch(html, /输入服务商提供的密钥/);
  assert.match(aiJs, /api_mode/);
  assert.match(aiJs, /https:\/\/api\.openai\.com\/v1/);
  assert.match(systemConfig, /ai-api-mode/);
});
