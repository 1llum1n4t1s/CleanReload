import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifySupersededChecks } from './Dependabot-Checks.mjs';

const sha = c => c.repeat(40);
function fixture() {
  const suite = { id: 5, app: { id: 15368 }, status: 'completed' };
  const check = { id: 10, name: 'validate', status: 'completed', conclusion: 'failure', app: { id: 15368 }, check_suite: { id: 5 } };
  const current = { id: 20, run_attempt: 1, created_at: '2026-01-04T00:00:00Z' };
  const oldJob = { id: 10, name: 'validate', status: 'completed', conclusion: 'failure', run_id: 11, run_attempt: 1, check_run_url: 'https://api.github.com/repos/1llum1n4t1s/CleanReload/check-runs/10' };
  const oldRun = { id: 11, run_attempt: 1, workflow_id: 4, path: '.github/workflows/dependency-validation.yml', event: 'pull_request', repository: { id: 1 }, head_repository: { id: 1 }, head_sha: sha('b'), head_branch: 'dependabot/bun/package', status: 'completed', created_at: '2026-01-03T00:00:00Z' };
  const oldJobs = [{ ...oldJob, steps: [{ name: `validated-pr 7 action synchronize sender 49699333 head ${sha('b')} merge ${sha('c')}`, status: 'completed', conclusion: 'success' }] }];
  const args = { checks: [check], suites: [suite], run: current, jobs: [{ id: 22, name: 'validate', status: 'completed', conclusion: 'success' }], repositoryId: 1, workflowId: 4, pr: { number: 7, head: { ref: 'dependabot/bun/package' } }, head: sha('b'), merge: sha('c'), loadJob: async () => oldJob, loadRun: async () => oldRun, loadJobs: async () => oldJobs };
  return { args, check, suite, current, oldJob, oldRun, oldJobs };
}

test('同じPR/H/workflow/jobの確実に古い完了checkだけを置換する', async () => {
  const data = fixture();
  assert.deepEqual(await classifySupersededChecks(data.args), [10]);
  for (const mutate of [
    x => x.check.app.id = 99, x => x.check.status = 'in_progress', x => x.oldJob.run_attempt = 2,
    x => x.oldRun.workflow_id = 9, x => x.oldRun.head_sha = sha('f'),
    x => x.oldRun.created_at = x.current.created_at, x => x.oldJobs[0].steps[0].name = `validated-pr 8 action synchronize sender 49699333 head ${sha('b')} merge ${sha('c')}`,
  ]) {
    const bad = fixture(); mutate(bad);
    await assert.rejects(classifySupersededChecks(bad.args));
  }
});

test('同一runの旧attemptでもPR証跡が必要', async () => {
  const data = fixture();
  data.current.id = 11; data.current.run_attempt = 2;
  assert.deepEqual(await classifySupersededChecks(data.args), [10]);
  data.oldJob.run_attempt = 2; data.oldRun.run_attempt = 2;
  await assert.rejects(classifySupersededChecks(data.args));
});

test('同一runの旧guard失敗で旧validateが未実行なら現attemptのPR/H/M証跡で置換する', async () => {
  function skippedFixture() {
    const data = fixture();
    Object.assign(data.current, { id: 11, run_attempt: 2, status: 'completed', conclusion: 'success', event: 'pull_request', workflow_id: 4, head_sha: sha('b'), head_repository: { id: 1 } });
    data.check.conclusion = 'skipped'; data.oldJob.conclusion = 'skipped';
    data.oldJobs[0].conclusion = 'skipped'; data.oldJobs[0].steps = [];
    data.oldJobs.push({ id: 12, name: 'security-guard', run_id: 11, run_attempt: 1, status: 'completed', conclusion: 'failure' });
    data.args.jobs = [
      { id: 22, name: 'validate', run_id: 11, run_attempt: 2, status: 'completed', conclusion: 'success', steps: [{ name: `validated-pr 7 action synchronize sender 49699333 head ${sha('b')} merge ${sha('c')}`, status: 'completed', conclusion: 'success' }] },
      { id: 23, name: 'security-guard', run_id: 11, run_attempt: 2, status: 'completed', conclusion: 'success' },
    ];
    return data;
  }
  assert.deepEqual(await classifySupersededChecks(skippedFixture().args), [10]);
  for (const mutate of [
    x => x.current.id = 20,
    x => x.oldJobs[1].conclusion = 'success',
    x => x.args.jobs[0].steps[0].name = `validated-pr 8 action synchronize sender 49699333 head ${sha('b')} merge ${sha('c')}`,
    x => x.args.jobs[1].conclusion = 'failure',
    x => x.oldJobs[0].steps = [{ name: `validated-pr 8 action synchronize sender 49699333 head ${sha('b')} merge ${sha('c')}`, status: 'completed', conclusion: 'skipped' }],
  ]) { const bad = skippedFixture(); mutate(bad); await assert.rejects(classifySupersededChecks(bad.args)); }
  for (const outcome of ['failure', 'cancelled']) {
    const data = skippedFixture();
    data.check.conclusion = outcome; data.oldJob.conclusion = outcome; data.oldJobs[0].conclusion = outcome;
    data.oldJobs[1].conclusion = 'success';
    data.oldJobs[0].steps = [
      { name: 'Checkout', status: 'completed', conclusion: outcome },
      { name: `validated-pr 7 action synchronize sender 49699333 head ${sha('b')} merge ${sha('c')}`, status: 'completed', conclusion: 'skipped' },
    ];
    assert.deepEqual(await classifySupersededChecks(data.args), [10]);
    data.oldJobs[0].conclusion = 'success'; data.oldJob.conclusion = 'success'; data.check.conclusion = 'success';
    await assert.rejects(classifySupersededChecks(data.args));
  }
});
