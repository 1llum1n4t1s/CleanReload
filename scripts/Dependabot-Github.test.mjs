import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { hasGuardCandidate, runGithubGuard } from './Dependabot-Github.mjs';
import { guard } from './Dependabot-MergeEvidence.mjs';

const sha = c => c.repeat(40);
function fixture() {
  const bot = { id: 49699333, login: 'dependabot[bot]', type: 'Bot' };
  const repo = { id: 1, default_branch: 'main', allow_auto_merge: true, allow_squash_merge: true };
  const pr = { id: 9, number: 7, state: 'open', draft: false, created_at: '2026-01-02T00:00:00Z', user: bot, head: { ref: 'dependabot/bun/package', sha: sha('b'), repo: { id: 1 } }, base: { ref: 'main', repo: { id: 1 } }, mergeable: true, commits: 1, changed_files: 1 };
  const state = { repo, pr, prs: [pr], base: sha('a'), auto: null, statuses: [], writes: [], suites: {}, suiteRuns: {}, checks: {}, files: [{ filename: 'bun.lock', status: 'modified' }] };
  const rules = [{ ruleset_id: 50, type: 'non_fast_forward' }, { ruleset_id: 50, type: 'required_status_checks', parameters: {
    strict_required_status_checks_policy: true,
    required_status_checks: [{ context: 'validate', integration_id: 15368 }, { context: 'security-guard', integration_id: 15368 }, { context: guard, integration_id: 44 }],
  } }];
  const run = { id: 11, workflow_id: 4, run_attempt: 1, created_at: '2026-01-03T00:00:00Z', status: 'completed', conclusion: 'success', event: 'pull_request', head_sha: sha('b'), head_repository: { id: 1 } };
  const jobs = [
    { id: 21, name: 'security-guard', run_id: 11, run_attempt: 1, status: 'completed', conclusion: 'success' },
    { id: 22, name: 'validate', run_id: 11, run_attempt: 1, status: 'completed', conclusion: 'success', steps: [{ name: `validated-pr 7 action synchronize sender 49699333 head ${sha('b')} merge ${sha('c')}`, status: 'completed', conclusion: 'success' }] },
  ];
  const github = {
    rest: {
      repos: { get: async () => ({ data: state.repo }), getBranch: async () => ({ data: { commit: { sha: state.base } } }),
        compareCommitsWithBasehead: async ({ basehead }) => ({ data: basehead === `${sha('f')}...${sha('f')}`
          ? { status: 'identical', merge_base_commit: { sha: sha('f') } }
          : { status: 'ahead', merge_base_commit: { sha: sha('a') } } }),
        getContent: async ({ ref }) => {
          const raw = JSON.stringify(ref === sha('a') ? state.packageBase : state.packageHead);
          const bytes = Buffer.from(raw);
          const result = { type: 'file', encoding: 'base64', size: bytes.length, content: bytes.toString('base64'),
            sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
          if (state.mutateContent) state.mutateContent(result);
          return { data: result };
        } },
      users: { getByUsername: async ({ username }) => { assert.equal(username, 'github-actions[bot]'); return { data: { node_id: 'BOT_33' } }; } },
      pulls: { get: async () => ({ data: state.pr }) },
      git: { getCommit: async ({ commit_sha }) => ({ data: commit_sha === sha('b')
        ? { sha: sha('b'), parents: [{ sha: sha('e') }] }
        : commit_sha === sha('f') ? { sha: sha('f'), tree: { sha: state.mergedTree ?? sha('d') }, parents: [{ sha: sha('a') }] }
          : { sha: sha('c'), tree: { sha: sha('d') }, parents: [{ sha: sha('a') }, { sha: sha('b') }] } }),
      getRef: async () => ({ data: { object: { sha: sha('c') } } }) },
      actions: { getWorkflow: async () => ({ data: { id: 4, path: '.github/workflows/dependency-validation.yml', state: 'active' } }) },
    },
    request: async (route, params) => {
      let data;
      switch (route) {
        case 'GET /repos/{owner}/{repo}/pulls': data = state.prs; break;
        case 'GET /repos/{owner}/{repo}/rules/branches/{branch}': data = params.branch === 'main' ? rules : [{ ruleset_id: 51, type: 'creation' }, { ruleset_id: 51, type: 'update' }]; break;
        case 'GET /repos/{owner}/{repo}/rulesets/{ruleset_id}': data = { id: params.ruleset_id, enforcement: 'active', target: 'branch', source_type: 'Repository', source: '1llum1n4t1s/CleanReload', updated_at: state.ruleTimes?.[params.ruleset_id] ?? '2026-01-01T00:00:00Z' }; break;
        case 'GET /repos/{owner}/{repo}/pulls/{pull_number}/commits': data = [{ sha: sha('b'), author: bot, committer: { id: 19864447, login: 'web-flow' }, commit: { verification: { verified: true, reason: 'valid', signature: 'signature', payload: 'payload' } } }]; break;
        case 'GET /repos/{owner}/{repo}/pulls/{pull_number}/files': data = state.files; break;
        case 'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs': data = { total_count: 1, workflow_runs: [run] }; break;
        case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs': data = params.run_id === 11 ? { total_count: 2, jobs } : { total_count: state.oldJobs.length, jobs: state.oldJobs }; break;
        case 'GET /repos/{owner}/{repo}/actions/jobs/{job_id}': data = state.oldJob; break;
        case 'GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}': data = state.oldRun; break;
        case 'GET /repos/{owner}/{repo}/commits/{ref}/statuses': data = params.ref === sha('b') ? state.statuses : []; break;
        case 'GET /repos/{owner}/{repo}/commits/{ref}/check-suites': data = { total_count: state.suiteCount ?? (state.suites[params.ref]?.length ?? 0), check_suites: state.suites[params.ref] ?? [] }; break;
        case 'GET /repos/{owner}/{repo}/commits/{ref}/check-runs': data = { total_count: state.checks[params.ref]?.length ?? 0, check_runs: state.checks[params.ref] ?? [] }; break;
        case 'GET /repos/{owner}/{repo}/check-suites/{check_suite_id}/check-runs': data = { total_count: state.suiteRuns[params.check_suite_id]?.length ?? 0, check_runs: state.suiteRuns[params.check_suite_id] ?? [] }; break;
        default: throw new Error(`unexpected route: ${route}`);
      }
      return { data, headers: {} };
    },
    graphql: async (query, params) => {
      if (query.includes('timelineItems')) return { repository: { pullRequest: { timelineItems: { nodes: [], pageInfo: { hasPreviousPage: false, startCursor: null } } } } };
      if (query.includes('enablePullRequestAutoMerge')) {
        state.writes.push('reserve'); assert.equal(params.head, sha('b'));
        state.auto = { mergeMethod: 'SQUASH', enabledBy: { id: 'BOT_33' } };
        return { enablePullRequestAutoMerge: { pullRequest: { id: 'PR_7', headRefOid: sha('b'), autoMergeRequest: state.auto } } };
      }
      return { repository: { pullRequest: { id: 'PR_7', number: 7, state: 'OPEN', isDraft: false, headRefOid: state.pr.head.sha, reviewDecision: null, mergeStateStatus: 'BLOCKED', autoMergeRequest: state.auto } } };
    },
  };
  const fetchImpl = async (url, options) => {
    assert.equal(options.headers.authorization, 'Bearer fixture-token');
    assert.ok(options.signal instanceof AbortSignal);
    if (options.method === 'GET') {
      assert.equal(options.redirect, 'error');
      if (state.identityUnavailable) return { ok: false };
      if (url === 'https://api.github.com/apps/guard-app') return { ok: true, json: async () => state.appIdentity ?? { id: 44, client_id: 'Iv1.example', slug: 'guard-app' } };
      if (url === 'https://api.github.com/users/guard-app%5Bbot%5D') return { ok: true, json: async () => state.botIdentity ?? { id: 22, login: 'guard-app[bot]', type: 'Bot' } };
      throw new Error(`unexpected identity request: ${url}`);
    }
    assert.equal(url, `https://api.github.com/repos/1llum1n4t1s/CleanReload/statuses/${sha('b')}`);
    const value = JSON.parse(options.body); state.writes.push(value.state);
    state.statuses.unshift({ ...value, id: 100 + state.writes.length, creator: state.creatorOverride ?? { id: 22, login: 'guard-app[bot]', type: 'Bot' } });
    if (value.state === 'pending' && state.afterPending) await state.afterPending();
    if (value.state === 'success' && state.afterSuccess) await state.afterSuccess();
    return { ok: true };
  };
  const args = { github, owner: '1llum1n4t1s', repo: 'CleanReload', workflowSha: sha('a'), appId: 44, appClientId: 'Iv1.example', appSlug: 'guard-app', expectedAppSlug: 'guard-app', appBotId: 22, appToken: 'fixture-token', rulesetId: 50, rulesetUpdatedAt: '2026-01-01T00:00:00Z', branchRulesetId: 51, branchRulesetUpdatedAt: '2026-01-01T00:00:00Z', protectedAfter: '2026-01-01T00:00:01Z', runId: 100, runAttempt: 1, event: 'workflow_run', eventHead: sha('b'), fetchImpl };
  return { state, args, rules };
}

function addSkippedCodeRabbit(state) {
  const head = sha('b');
  const check = { id: 92, name: 'CodeRabbit', status: 'completed', conclusion: 'skipped', head_sha: head,
    app: { id: 347564, slug: 'coderabbitai' }, check_suite: { id: 91 } };
  const suite = { id: 91, status: 'completed', conclusion: 'skipped', head_sha: head, app: { id: 347564, slug: 'coderabbitai' } };
  state.checks[head] = [check];
  state.suites[head] = [suite];
  state.suiteRuns[91] = [check];
  return { check, suite };
}

test('trusted controller は全証拠を再読してHEADにpending、予約、successを順に行う', async () => {
  const { state, args } = fixture();
  assert.equal(await runGithubGuard(args), 'enabled');
  assert.deepEqual(state.writes, ['pending', 'reserve', 'success']);
});

test('既知のCodeRabbit skippedはCI成功に数えずhead上だけ許可する', async () => {
  const { state, args } = fixture();
  addSkippedCodeRabbit(state);
  const head = sha('b');
  const actions = { id: 15368, slug: 'github-actions' };
  const ciChecks = ['security-guard', 'validate'].map((name, index) => ({
    id: 21 + index, name, status: 'completed', conclusion: 'success', head_sha: head,
    app: actions, check_suite: { id: 90 },
  }));
  state.checks[head].push(...ciChecks);
  state.suites[head].push({ id: 90, status: 'completed', conclusion: 'success', head_sha: head, app: actions });
  state.suiteRuns[90] = ciChecks;
  assert.equal(await runGithubGuard(args), 'enabled');
  assert.deepEqual(state.writes, ['pending', 'reserve', 'success']);
});

test('CodeRabbitの出所・状態・suiteが異なれば書込み前に保留する', async () => {
  for (const change of [
    ({ check }) => { check.app.id = 1; },
    ({ check }) => { check.app.slug = 'other'; },
    ({ check }) => { check.name = 'Other'; },
    ({ check }) => { check.status = 'in_progress'; },
    ({ check }) => { check.conclusion = 'success'; },
    ({ check }) => { check.conclusion = 'failure'; },
    ({ check }) => { check.head_sha = sha('f'); },
    ({ check }) => { check.check_suite.id = 999; },
    ({ suite }) => { suite.app.id = 1; },
    ({ suite }) => { suite.app.slug = 'other'; },
    ({ suite }) => { suite.status = 'queued'; },
    ({ suite }) => { suite.conclusion = 'success'; },
    ({ suite }) => { suite.head_sha = sha('f'); },
    ({ check, state }) => { const extra = { ...check, id: 93, name: 'Other' }; state.checks[sha('b')].push(extra); state.suiteRuns[91].push(extra); },
  ]) {
    const { state, args } = fixture();
    const values = addSkippedCodeRabbit(state);
    change({ ...values, state });
    await assert.rejects(runGithubGuard(args));
    assert.deepEqual(state.writes, []);
  }
});

test('ルール更新時刻は同じ瞬間なら異なるタイムゾーン表記を受け入れる', async () => {
  for (const [pin, api] of [
    ['2026-01-01T09:00:00+09:00', '2026-01-01T00:00:00Z'],
    ['2026-01-01T09:00:00.1+09:00', '2026-01-01T00:00:00.100Z'],
    ['2026-01-01T09:00:00.10+09:00', '2026-01-01T00:00:00.100Z'],
  ]) {
    const { state, args } = fixture();
    args.rulesetUpdatedAt = pin;
    args.branchRulesetUpdatedAt = pin;
    state.ruleTimes = { 50: api, 51: api };
    assert.equal(await runGithubGuard(args), 'enabled');
    assert.deepEqual(state.writes, ['pending', 'reserve', 'success']);
  }
});

test('不正な日付やミリ秒未満の差を同一時刻とみなさない', async () => {
  for (const change of [
    x => { x.args.rulesetUpdatedAt = '2026-02-30T00:00:00Z'; x.state.ruleTimes = { 50: '2026-03-02T00:00:00Z' }; },
    x => { x.args.rulesetUpdatedAt = '2026-01-01T00:00:00.0001Z'; x.state.ruleTimes = { 50: '2026-01-01T00:00:00.0009Z' }; },
    x => { x.args.branchRulesetUpdatedAt = '2025-01-01T00:00:00.0001Z'; x.state.ruleTimes = { 51: '2025-01-01T00:00:00.0009Z' }; },
    x => { x.args.branchRulesetUpdatedAt = '2025-02-30T00:00:00Z'; x.state.ruleTimes = { 51: '2025-03-02T00:00:00Z' }; },
    x => { x.args.branchRulesetUpdatedAt = '2026-01-01T14:30:00+14:30'; x.state.ruleTimes = { 51: '2026-01-01T00:00:00Z' }; },
    x => { x.args.protectedAfter = '2026-02-30T00:00:00Z'; },
  ]) {
    const data = fixture(); change(data);
    await assert.rejects(runGithubGuard(data.args));
    assert.deepEqual(data.state.writes, []);
  }
});

test('success直後のmerge完了はcommit親・tree・main祖先まで一致した場合だけ確定する', async () => {
  for (const valid of [true, false]) {
    const data = fixture();
    data.state.mergedTree = valid ? sha('d') : sha('9');
    data.state.afterSuccess = async () => {
      data.state.pr.state = 'closed'; data.state.pr.merged = true;
      data.state.pr.merged_at = '2026-01-01T00:00:00Z'; data.state.pr.merge_commit_sha = sha('f');
      data.state.base = sha('f'); data.state.auto = null;
    };
    if (valid) assert.equal(await runGithubGuard(data.args), 'merged');
    else await assert.rejects(runGithubGuard(data.args));
    assert.deepEqual(data.state.writes, ['pending', 'reserve', 'success']);
  }
});

test('pending直後のbase前進と同じHEADを共有する別PRでは予約しない', async () => {
  const moved = fixture();
  moved.state.afterPending = async () => { moved.state.base = sha('f'); };
  await assert.rejects(runGithubGuard(moved.args));
  assert.deepEqual(moved.state.writes, ['pending']);
  const shared = fixture();
  shared.state.prs.push({ id: 10, number: 8, state: 'open', draft: false, user: { id: 1, login: 'owner' }, head: { sha: sha('b'), repo: { id: 1 } }, base: { ref: 'main', repo: { id: 1 } } });
  await assert.rejects(runGithubGuard(shared.args));
  assert.deepEqual(shared.state.writes, []);
});

test('pending送信の応答断は同一statusの読戻しで確認できた場合だけ進む', async () => {
  const data = fixture();
  data.state.afterPending = async () => { throw new Error('timeout after write'); };
  assert.equal(await runGithubGuard(data.args), 'enabled');
  assert.deepEqual(data.state.writes, ['pending', 'reserve', 'success']);
});

test('status通信断でreadbackできない場合は再送も予約もしない', async () => {
  const data = fixture();
  let calls = 0;
  const fetch = data.args.fetchImpl;
  data.args.fetchImpl = async (url, options) => {
    if (options.method === 'GET') return fetch(url, options);
    calls++;
    assert.ok(options.signal instanceof AbortSignal);
    throw new DOMException('timed out', 'TimeoutError');
  };
  await assert.rejects(runGithubGuard(data.args));
  assert.equal(calls, 1);
  assert.deepEqual(data.state.writes, []);
});

test('rule pin・base・sourceが不一致なら外部変更しない', async () => {
  for (const change of [x => x.args.rulesetUpdatedAt = 'other', x => x.state.base = sha('f'), x => x.rules[1].parameters.required_status_checks[2].integration_id = 99,
    x => x.args.branchRulesetUpdatedAt = '2025-12-01T00:00:00Z',
    x => x.args.protectedAfter = x.args.branchRulesetUpdatedAt]) {
    const data = fixture(); change(data);
    await assert.rejects(runGithubGuard(data.args));
    assert.deepEqual(data.state.writes, []);
  }
  const old = fixture(); old.args.protectedAfter = '2026-01-04T00:00:00Z';
  assert.equal(await runGithubGuard(old.args), 'held: candidate count');
  assert.deepEqual(old.state.writes, []);
});

test('private Appのslug・bot ID・status発行者が監査値と一致しなければ保留する', async () => {
  for (const change of [
    x => x.args.expectedAppSlug = 'other-app', x => x.args.expectedAppSlug = '', x => x.args.appBotId = 0,
    x => x.args.appId = 45, x => x.args.appClientId = 'wrong-client', x => x.args.appBotId = 23,
    x => x.state.appIdentity = { id: 44, client_id: 'Iv1.example', slug: 'other-app' },
    x => x.state.botIdentity = { id: 22, login: 'wrong[bot]', type: 'Bot' },
    x => x.state.botIdentity = { id: 22, login: 'guard-app[bot]', type: 'User' },
    x => x.state.identityUnavailable = true,
  ]) {
    const data = fixture(); change(data);
    await assert.rejects(runGithubGuard(data.args));
    assert.deepEqual(data.state.writes, []);
  }
  for (const creator of [
    { id: 23, login: 'guard-app[bot]', type: 'Bot' }, { id: 22, login: 'other[bot]', type: 'Bot' },
    { id: 22, login: 'guard-app[bot]', type: 'User' },
  ]) {
    const data = fixture(); data.state.creatorOverride = creator;
    await assert.rejects(runGithubGuard(data.args));
    assert.deepEqual(data.state.writes, ['pending']);
  }
});

test('Dependabot branchのcreation/update両方が監査済ruleに含まれなければ保留する', async () => {
  const data = fixture(); const request = data.args.github.request;
  data.args.github.request = async (route, params) => route === 'GET /repos/{owner}/{repo}/rules/branches/{branch}' && params.branch !== 'main'
    ? { data: [{ ruleset_id: 51, type: 'creation' }], headers: {} } : request(route, params);
  await assert.rejects(runGithubGuard(data.args));
  assert.deepEqual(data.state.writes, []);
});

test('package.jsonのscripts変更はbase/headを取得して予約前に拒否する', async () => {
  const data = fixture();
  data.state.files = [{ filename: 'package.json', status: 'modified' }];
  data.state.packageBase = { scripts: { build: 'safe' }, devDependencies: { a: '^1.0.0' } };
  data.state.packageHead = { scripts: { build: 'unsafe' }, devDependencies: { a: '^1.1.0' } };
  await assert.rejects(runGithubGuard(data.args));
  assert.deepEqual(data.state.writes, []);
});

test('package.jsonのbase64・byte数・Git blob SHAの不整合を拒否する', async () => {
  for (const mutate of [
    x => x.content += '$', x => x.size++, x => x.sha = sha('f'),
  ]) {
    const data = fixture(); data.state.files = [{ filename: 'package.json', status: 'modified' }];
    data.state.packageBase = { devDependencies: { a: '^1.0.0' } };
    data.state.packageHead = { devDependencies: { a: '^1.1.0' } };
    data.state.mutateContent = mutate;
    await assert.rejects(runGithubGuard(data.args));
    assert.deepEqual(data.state.writes, []);
  }
  const valid = fixture(); valid.state.files = [{ filename: 'package.json', status: 'modified' }];
  valid.state.packageBase = { devDependencies: { a: '^1.0.0' } };
  valid.state.packageHead = { devDependencies: { a: '^1.1.0' } };
  valid.state.mutateContent = value => { value.content = value.content.replace(/(.{8})/g, '$1\n'); };
  assert.equal(await runGithubGuard(valid.args), 'enabled');
});

test('GitHubの数値repo ID付きnextは一致時のみ受け付ける', async () => {
  for (const [repositoryId, accepted] of [[1, true], [2, false]]) {
    const { state, args } = fixture();
    const request = args.github.request;
    const other = number => ({ id: number, number, state: 'open', draft: false, user: { id: 1, login: 'owner' }, head: { sha: sha('f'), repo: { id: 1 } }, base: { ref: 'main', repo: { id: 1 } } });
    args.github.request = async (route, params) => {
      if (route !== 'GET /repos/{owner}/{repo}/pulls') return request(route, params);
      if (params.page === 1) return {
        data: [state.pr, ...Array.from({ length: 99 }, (_, i) => other(i + 1000))],
        headers: { link: `<https://api.github.com/repositories/${repositoryId}/pulls?per_page=100&page=2>; rel="next"` },
      };
      return { data: [other(2000)], headers: {} };
    };
    if (accepted) {
      assert.equal(await runGithubGuard(args), 'enabled');
      assert.deepEqual(state.writes, ['pending', 'reserve', 'success']);
    } else {
      await assert.rejects(runGithubGuard(args));
      assert.deepEqual(state.writes, []);
    }
  }
});

test('PR一覧はlastで示されたページを欠落させず、途中空ページを拒否する', async () => {
  for (const incomplete of [false, true]) {
    const { state, args } = fixture();
    const request = args.github.request;
    const other = number => ({ id: number, number, state: 'open', draft: false, user: { id: 1, login: 'owner' }, head: { sha: sha('f'), repo: { id: 1 } }, base: { ref: 'main', repo: { id: 1 } } });
    const link = (page, relation) => `<https://api.github.com/repositories/1/pulls?per_page=100&page=${page}>; rel="${relation}"`;
    args.github.request = async (route, params) => {
      if (route !== 'GET /repos/{owner}/{repo}/pulls') return request(route, params);
      if (params.page === 1) return { data: [state.pr, ...Array.from({ length: 99 }, (_, i) => other(i + 1000))], headers: { link: `${link(2, 'next')}, ${link(3, 'last')}` } };
      if (params.page === 2) return incomplete
        ? { data: [], headers: {} }
        : { data: Array.from({ length: 100 }, (_, i) => other(i + 2000)), headers: { link: `${link(3, 'next')}, ${link(3, 'last')}` } };
      return { data: [other(3000)], headers: { link: link(2, 'prev') } };
    };
    if (incomplete) {
      await assert.rejects(runGithubGuard(args));
      assert.deepEqual(state.writes, []);
    } else {
      assert.equal(await runGithubGuard(args), 'enabled');
    }
  }
});

test('候補不在や不正なPR一覧はtoken発行前に止める', async () => {
  const base = fixture();
  assert.equal(await hasGuardCandidate(base.args), true);
  base.state.pr.draft = true;
  assert.equal(await hasGuardCandidate(base.args), false);
  const sameTime = fixture(); sameTime.state.pr.created_at = sameTime.args.protectedAfter;
  assert.equal(await hasGuardCandidate(sameTime.args), false);
  for (const mutate of [pr => delete pr.head.sha, pr => pr.head.sha = 'invalid', pr => delete pr.user.id, pr => pr.state = 'closed']) {
    const data = fixture();
    const other = structuredClone(data.state.pr);
    other.id = 10; other.number = 8; other.user = { id: 1, login: 'owner' }; other.head.sha = sha('f');
    mutate(other); data.state.prs.push(other);
    await assert.rejects(hasGuardCandidate(data.args));
    await assert.rejects(runGithubGuard(data.args));
    assert.deepEqual(data.state.writes, []);
  }
});

test('手動dispatchは別のdraft・保護前PRを除外し、候補一件だけを扱う', async () => {
  for (const excluded of ['draft', 'old']) {
    const data = fixture(); data.args.event = 'workflow_dispatch'; data.args.eventHead = '';
    const other = structuredClone(data.state.pr);
    other.id = 10; other.number = 8; other.head.sha = sha('f'); other.head.ref = 'dependabot/bun/other';
    if (excluded === 'draft') other.draft = true;
    else other.created_at = data.args.protectedAfter;
    data.state.prs.push(other);
    assert.equal(await hasGuardCandidate(data.args), true);
    assert.equal(await runGithubGuard(data.args), 'enabled');
    assert.deepEqual(data.state.writes, ['pending', 'reserve', 'success']);
  }
  const multiple = fixture(); multiple.args.event = 'workflow_dispatch';
  const other = structuredClone(multiple.state.pr); other.id = 10; other.number = 8; other.head.sha = sha('f');
  multiple.state.prs.push(other);
  assert.equal(await hasGuardCandidate(multiple.args), false);
  assert.equal(await runGithubGuard(multiple.args), 'held: candidate count');
  assert.deepEqual(multiple.state.writes, []);
});

test('check suiteが1000件以上なら一覧の見切れを保留する', async () => {
  const data = fixture(); data.state.suiteCount = 1000;
  await assert.rejects(runGithubGuard(data.args));
  assert.deepEqual(data.state.writes, []);
});

test('完全に空のqueued suiteは許し、suiteとcheck一覧の不一致は保留する', async () => {
  const empty = fixture();
  empty.state.suites[sha('b')] = [{ id: 91, app: { id: 55 }, status: 'queued', conclusion: null }];
  assert.equal(await runGithubGuard(empty.args), 'enabled');
  const inconsistent = fixture();
  inconsistent.state.suites[sha('b')] = [{ id: 91, app: { id: 55 }, status: 'queued', conclusion: null }];
  inconsistent.state.checks[sha('b')] = [{ id: 92, name: 'unknown', status: 'completed', conclusion: 'success', app: { id: 55 }, check_suite: { id: 91 } }];
  await assert.rejects(runGithubGuard(inconsistent.args));
  assert.deepEqual(inconsistent.state.writes, []);
});

test('旧失敗checkは同じPR/Hと古いrunの証拠がある場合だけ後続成功で置換する', async () => {
  for (const valid of [true, false]) {
    const data = fixture();
    const oldCheck = { id: 31, name: 'validate', status: 'completed', conclusion: 'failure', app: { id: 15368 }, check_suite: { id: 91 } };
    data.state.suites[sha('b')] = [{ id: 91, app: { id: 15368 }, status: 'completed', conclusion: 'failure' }];
    data.state.checks[sha('b')] = [oldCheck]; data.state.suiteRuns[91] = [oldCheck];
    data.state.oldJob = { id: 31, name: 'validate', status: 'completed', conclusion: 'failure', run_id: 10, run_attempt: 1, check_run_url: 'https://api.github.com/repos/1llum1n4t1s/CleanReload/check-runs/31' };
    data.state.oldRun = { id: 10, run_attempt: 1, workflow_id: 4, path: '.github/workflows/dependency-validation.yml', event: 'pull_request', repository: { id: 1 }, head_repository: { id: 1 }, head_sha: sha('b'), head_branch: 'dependabot/bun/package', status: 'completed', created_at: '2026-01-02T01:00:00Z' };
    data.state.oldJobs = [{ ...data.state.oldJob, steps: [{ name: `validated-pr ${valid ? 7 : 8} action opened sender 49699333 head ${sha('b')} merge ${sha('c')}`, status: 'completed', conclusion: 'success' }] }];
    if (valid) assert.equal(await runGithubGuard(data.args), 'enabled');
    else { await assert.rejects(runGithubGuard(data.args)); assert.deepEqual(data.state.writes, []); }
  }
});

test('未有効時はrunner自体をskipし、候補不在ではApp tokenを作らない', () => {
  assert.equal(guard, 'kagayoi/automation-merge-guard-v1');
  const workflow = Bun.YAML.parse(readFileSync('.github/workflows/dependabot-auto-merge.yml', 'utf8'));
  const job = workflow.jobs['auto-merge'];
  assert.match(job.if, /vars\.DEPENDABOT_GUARD_ENABLED == 'true'/);
  const candidate = job.steps.findIndex(step => step.id === 'candidate');
  const token = job.steps.findIndex(step => step.id === 'guard-app');
  assert.ok(candidate >= 0 && token > candidate);
  assert.equal(job.steps[token].if, "steps.candidate.outputs.candidate == 'true'");
  assert.equal(job.steps[token].with['permission-statuses'], 'write');
  assert.equal(job.steps[token].with['client-id'], '${{ vars.DEPENDENCY_GUARD_APP_CLIENT_ID }}');
  assert.equal(job.steps[token].with['private-key'], '${{ secrets.DEPENDENCY_GUARD_PRIVATE_KEY }}');
});
