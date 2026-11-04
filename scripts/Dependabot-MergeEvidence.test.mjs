import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyMergeEvidence, verifyPackageJson } from './Dependabot-MergeEvidence.mjs';

const sha = char => char.repeat(40);
const fixture = () => {
  const bot = { id: 49699333, login: 'dependabot[bot]', type: 'Bot' };
  return {
    repository: { id: 1, default_branch: 'main' },
    pr: { number: 7, state: 'open', draft: false, created_at: '2026-01-02T00:00:00Z', user: bot, head: { ref: 'dependabot/bun/package', sha: sha('b'), repo: { id: 1 } }, base: { ref: 'main', repo: { id: 1 } }, mergeable: true, commits: 1, changed_files: 1 },
    base: sha('a'), headCommit: { sha: sha('b'), parents: [{ sha: sha('e') }] },
    compare: { status: 'ahead', merge_base_commit: { sha: sha('a') } },
    mergeCommit: { sha: sha('c'), tree: { sha: sha('d') }, parents: [{ sha: sha('a') }, { sha: sha('b') }] },
    commits: [{ sha: sha('b'), author: bot, committer: { id: 19864447, login: 'web-flow' }, commit: { verification: { verified: true, reason: 'valid', signature: 'signature', payload: 'payload' } } }],
    files: [{ filename: 'bun.lock', status: 'modified' }], headStatuses: [], headChecks: [], mergeStatuses: [], mergeChecks: [], workflowId: 4,
    protectedAfter: '2026-01-01T00:00:00Z',
    run: { id: 11, workflow_id: 4, run_attempt: 1, created_at: '2026-01-03T00:00:00Z', status: 'completed', conclusion: 'success', event: 'pull_request', head_sha: sha('b'), head_repository: { id: 1 }, pull_requests: [{ number: 7 }] },
    jobs: [
      { id: 21, name: 'security-guard', run_id: 11, run_attempt: 1, status: 'completed', conclusion: 'success' },
      { id: 22, name: 'validate', run_id: 11, run_attempt: 1, status: 'completed', conclusion: 'success', steps: [{ name: `validated-pr 7 action synchronize sender 49699333 head ${sha('b')} merge ${sha('c')}`, status: 'completed', conclusion: 'success' }] },
    ],
  };
};

test('検証済みマージコミットと全jobが同じrunとattemptに属する', () => {
  assert.deepEqual(verifyMergeEvidence(fixture()), { pr: 7, base: sha('a'), head: sha('b'), merge: sha('c'), tree: sha('d'), run: 11, attempt: 1 });
  const opened = fixture();
  opened.jobs[1].steps[0].name = `validated-pr 7 action opened sender 49699333 head ${sha('b')} merge ${sha('c')}`;
  assert.equal(verifyMergeEvidence(opened).pr, 7);
  for (const change of [
    x => x.pr.state = 'closed', x => x.pr.draft = true, x => x.pr.user.id = 1,
    x => x.headCommit.parents.push({ sha: sha('f') }), x => x.mergeCommit.parents[0].sha = sha('f'),
    x => x.commits[0].commit.verification.verified = false, x => x.pr.commits = 2,
    x => x.commits[0].committer.id = 99, x => x.commits[0].commit.verification.reason = 'unknown_key',
    x => x.pr.created_at = '2025-12-31T23:59:59Z', x => x.pr.head.ref = 'manual/branch',
    x => x.pr.created_at = x.protectedAfter, x => x.run.created_at = x.protectedAfter,
    x => x.headStatuses.push({ context: 'KAGAYOI/AUTOMATION-MERGE-GUARD-V1' }),
    x => x.headChecks.push({ name: 'kagayoi/automation-merge-guard-v1' }),
    x => x.mergeStatuses.push({ id: 98, context: 'kagayoi/automation-merge-guard-v1', state: 'success' }),
    x => x.headStatuses.push({ id: 99, context: 'unknown', state: 'success' }),
    x => x.headChecks.push({ id: 99, name: 'unknown', status: 'completed', conclusion: 'success' }),
    x => x.run.status = 'waiting', x => x.run.run_attempt = 2, x => x.jobs.pop(),
    x => x.jobs[1].steps[0].name = `validated-pr 7 action synchronize sender 49699333 head ${sha('b')} merge ${sha('f')}`,
    x => x.jobs[1].steps[0].name = `validated-pr 8 action synchronize sender 49699333 head ${sha('b')} merge ${sha('c')}`,
    x => x.jobs[1].steps[0].name = `validated-pr 7 action ready_for_review sender 49699333 head ${sha('b')} merge ${sha('c')}`,
    x => x.jobs[1].steps[0].name = `validated-pr 7 action synchronize sender 1 head ${sha('b')} merge ${sha('c')}`,
    x => x.jobs[1].conclusion = 'failure', x => x.files[0].filename = 'src/background.js',
    x => x.compare.status = 'behind',
  ]) {
    const data = fixture(); change(data);
    assert.throws(() => verifyMergeEvidence(data));
  }
});

test('通常のdispatch成功はPRのCI証拠にならない', () => {
  const data = fixture();
  data.run.event = 'workflow_dispatch';
  assert.throws(() => verifyMergeEvidence(data));
});

test('PR非対象security-resultのskippedだけを区別する', () => {
  const data = fixture();
  const skipped = { id: 23, name: 'security-result', run_id: 11, run_attempt: 1, status: 'completed', conclusion: 'skipped' };
  data.jobs.push(skipped);
  data.headChecks = [{ id: 23, name: 'security-result', status: 'completed', conclusion: 'skipped' }];
  data.approvedHeadCheckIds = [23];
  assert.equal(verifyMergeEvidence(data).pr, 7);
  data.jobs[0].conclusion = 'skipped';
  assert.throws(() => verifyMergeEvidence(data));
  data.jobs[0].conclusion = 'success';
  data.jobs[2].name = 'unknown';
  assert.throws(() => verifyMergeEvidence(data));
});

test('package.jsonは依存version更新を許可し、scripts・製品version等の変更を拒否する', () => {
  const before = { name: 'app', version: '1.0.0', scripts: { build: 'bun build' }, trustedDependencies: ['sharp'], devDependencies: { sharp: '^1.0.0' } };
  const updated = structuredClone(before); updated.devDependencies.sharp = '^1.1.0';
  verifyPackageJson(before, updated);
  for (const change of [
    x => x.version = '2.0.0', x => x.scripts.build = 'run unsafe',
    x => x.trustedDependencies.push('other'), x => x.devDependencies.other = '^1.0.0',
  ]) { const bad = structuredClone(updated); change(bad); assert.throws(() => verifyPackageJson(before, bad)); }
  const evidence = fixture(); evidence.files = [{ filename: 'package.json', status: 'modified' }];
  assert.throws(() => verifyMergeEvidence(evidence));
  evidence.packageFiles = { base: before, head: updated };
  assert.equal(verifyMergeEvidence(evidence).pr, 7);
});
