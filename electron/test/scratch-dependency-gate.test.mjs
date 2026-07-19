import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDependencyGate } from '../../scripts/check_scratch_dependency_gate.mjs';

const exception = (packageName, overrides = {}) => ({
  package: packageName,
  severities: ['high'],
  scope: 'build-chain',
  owner: 'Release Owner',
  reviewBy: '2026-08-31',
  mitigation: 'upgrade upstream',
  evidence: 'scratch-editor/build',
  ...overrides,
});

test('Scratch dependency gate accepts a current, fully documented exception', () => {
  const result = evaluateDependencyGate(
    { metadata: { vulnerabilities: { high: 1 } }, vulnerabilities: { tar: { severity: 'high', via: ['advisory'] } } },
    { policy: {}, exceptions: [exception('tar')] },
    { today: '2026-07-19' },
  );
  assert.equal(result.ok, true);
  assert.equal(result.report.result, 'accepted-with-expiring-exceptions');
});

test('Scratch dependency gate rejects undocumented or expired findings', () => {
  const result = evaluateDependencyGate(
    { vulnerabilities: { tar: { severity: 'high', via: [] }, qs: { severity: 'moderate', via: [] } } },
    { exceptions: [exception('tar', { reviewBy: '2026-07-18' })] },
    { today: '2026-07-19' },
  );
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /tar: exception reviewBy/);
  assert.match(result.errors.join('\n'), /missing Scratch dependency exception for qs/);
});
