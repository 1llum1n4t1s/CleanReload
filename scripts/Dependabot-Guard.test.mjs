import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectHumanTimeline, guardCandidate, inspectGuardHistory, verifyEffectiveRules, verifyHumanControl } from './Dependabot-Guard.mjs';
import { guard } from './Dependabot-MergeEvidence.mjs';

const sha = c => c.repeat(40);
const nonce = '12345678-1234-4234-8234-123456789abc';
const runUrl = 'https://github.com/owner/repo/actions/runs/11/attempts/1';
function fixture() {
  const bot = { id: 49699333, login: 'dependabot[bot]', type: 'Bot' };
  const evidence = {
    repository: { id: 1, default_branch: 'main' },
    pr: { number: 7, state: 'open', draft: false, created_at: '2026-01-02T00:00:00Z', user: bot, head: { ref: 'dependabot/bun/package', sha: sha('b'), repo: { id: 1 } }, base: { ref: 'main', repo: { id: 1 } }, mergeable: true, commits: 1, changed_files: 1 },
    base: sha('a'), headCommit: { sha: sha('b'), parents: [{ sha: sha('e') }] },
    compare: { status: 'ahead', merge_base_commit: { sha: sha('a') } },
    mergeCommit: { sha: sha('c'), tree: { sha: sha('d') }, parents: [{ sha: sha('a') }, { sha: sha('b') }] },
    commits: [{ sha: sha('b'), author: bot, committer: { id: 19864447, login: 'web-flow' }, commit: { verification: { verified: true, reason: 'valid', signature: 'signature', payload: 'payload' } } }],
    files: [{ filename: 'bun.lock', status: 'modified' }], headStatuses: [], headChecks: [], mergeStatuses: [], mergeChecks: [], workflowId: 4,
    protectedAfter: '2026-01-01T00:00:00Z',
    run: { id: 11, workflow_id: 4, run_attempt: 1, created_at: '2026-01-03T00:00:00Z', status: 'completed', conclusion: 'success', event: 'pull_request', head_sha: sha('b'), head_repository: { id: 1 } },
    jobs: [
      { id: 21, name: 'security-guard', run_id: 11, run_attempt: 1, status: 'completed', conclusion: 'success' },
      { id: 22, name: 'validate', run_id: 11, run_attempt: 1, status: 'completed', conclusion: 'success', steps: [{ name: `validated-pr 7 action synchronize sender 49699333 head ${sha('b')} merge ${sha('c')}`, status: 'completed', conclusion: 'success' }] },
    ],
  };
  const rules = [{ type: 'non_fast_forward' }, { type: 'required_status_checks', parameters: { strict_required_status_checks_policy: true, required_status_checks: [
    { context: 'validate', integration_id: 15368 }, { context: 'security-guard', integration_id: 15368 }, { context: guard, integration_id: 44 },
  ] } }];
  const state = { evidence, guardStatuses: [], rules, bypassAudited: true, sameHeadOpenPrs: 1, reviewDecision: null, mergeState: 'BLOCKED', auto: null, timeline: { complete: true, events: [] } };
  const calls = [];
  const args = {
    repo: 'owner/repo', appId: 44, appBotId: 22, appBotLogin: 'guard-app[bot]', controllerBotNodeId: 'BOT_33', nonce, runUrl,
    observe: async () => structuredClone(state),
    postStatus: async status => { calls.push(status.state); state.guardStatuses.unshift({ ...status, id: 100 + calls.length, creator: { id: 22, login: 'guard-app[bot]', type: 'Bot' } }); },
    reserve: async request => { calls.push('reserve'); assert.equal(request.sha, sha('b')); state.auto = { actorId: 'BOT_33', method: 'SQUASH' }; },
  };
  return { state, calls, args };
}

test('pending確認後にHEAD固定で予約し、再検証してからsuccessを付ける', async () => {
  const { calls, args } = fixture();
  assert.equal(await guardCandidate(args), 'enabled');
  assert.deepEqual(calls, ['pending', 'reserve', 'success']);
});

test('予約応答断は予約を再読し、未成立なら再送せず保留する', async () => {
  const a = fixture();
  a.args.reserve = async () => { a.calls.push('reserve'); throw new Error('timeout'); };
  await assert.rejects(guardCandidate(a.args));
  await assert.rejects(guardCandidate(a.args));
  assert.deepEqual(a.calls, ['pending', 'reserve']);
  const b = fixture();
  b.args.reserve = async () => { b.calls.push('reserve'); b.state.auto = { actorId: 'BOT_33', method: 'SQUASH' }; throw new Error('timeout'); };
  assert.equal(await guardCandidate(b.args), 'enabled');
});

test('ドラフト化、他PRとのHEAD共有、レビュー待ちを保留する', async () => {
  for (const change of [s => s.evidence.pr.draft = true, s => s.sameHeadOpenPrs = 2, s => s.reviewDecision = 'REVIEW_REQUIRED']) {
    const { state, calls, args } = fixture(); change(state);
    await assert.rejects(guardCandidate(args)); assert.deepEqual(calls, []);
  }
});

test('解決済みintentとsuccessは対応を確認し、予約取消を勝手に再設定しない', async () => {
  const { state, calls, args } = fixture();
  state.guardStatuses = [
    { id: 2, context: guard, state: 'success', creator: { id: 22, login: 'guard-app[bot]', type: 'Bot' }, description: `guard-v1:7:${nonce}`, target_url: runUrl },
    { id: 1, context: guard, state: 'pending', creator: { id: 22, login: 'guard-app[bot]', type: 'Bot' }, description: `guard-v1:7:${nonce}`, target_url: runUrl },
  ];
  assert.equal(inspectGuardHistory({ statuses: state.guardStatuses, botId: 22, botLogin: 'guard-app[bot]', repo: 'owner/repo', pr: 7 }).pending, null);
  await assert.rejects(guardCandidate(args));
  assert.deepEqual(calls, []);
});

test('人間による解除は後続bot操作で解除されず、本人の明示enableだけを受け付ける', () => {
  const user = { __typename: 'User', id: 'U1', login: 'owner' };
  const bot = { __typename: 'Bot', id: 'B1', login: 'github-actions' };
  const event = (__typename, actor, date) => ({ id: date, __typename, actor, createdAt: date });
  const disabled = event('AutoMergeDisabledEvent', user, '2026-01-01T00:00:00Z');
  const botEnabled = event('AutoMergeEnabledEvent', bot, '2026-01-02T00:00:00Z');
  assert.throws(() => verifyHumanControl({ complete: true, events: [botEnabled, disabled] }));
  const enabled = event('AutoMergeEnabledEvent', user, '2026-01-03T00:00:00Z');
  verifyHumanControl({ complete: true, events: [enabled, botEnabled, disabled] });
  assert.throws(() => verifyHumanControl({ complete: false, events: [] }));
  assert.throws(() => verifyHumanControl({ complete: true, events: [{ ...enabled, actor: null }] }));
});

test('strict・source固定とforce push禁止が不足したら保留する', () => {
  const rules = [{ type: 'non_fast_forward' }, { type: 'required_status_checks', parameters: {
    strict_required_status_checks_policy: true,
    required_status_checks: [{ context: 'validate', integration_id: 15368 }, { context: 'security-guard', integration_id: 15368 }, { context: guard, integration_id: 44 }],
  } }];
  verifyEffectiveRules(rules, 44);
  for (const change of [
    x => x.shift(), x => x[1].parameters.strict_required_status_checks_policy = false,
    x => x[1].parameters.required_status_checks[2].integration_id = 15368,
    x => x[1].parameters.required_status_checks.push({ context: guard, integration_id: 15368 }),
  ]) { const copy = structuredClone(rules); change(copy); assert.throws(() => verifyEffectiveRules(copy, 44)); }
  const extra = structuredClone(rules);
  extra[1].parameters.required_status_checks.push({ context: 'other-ci', integration_id: 15368 }, { context: guard, integration_id: 44 });
  verifyEffectiveRules(extra, 44);
});

test('timelineは全cursorを確認し、読取り中の更新や短い中間ページを保留する', async () => {
  const actor = { __typename: 'Bot', id: 'B1', login: 'bot' };
  const event = date => ({ id: date, __typename: 'AutoMergeEnabledEvent', actor, createdAt: date });
  const page1 = { nodes: [event('2026-01-02T00:00:00Z'), event('2026-01-03T00:00:00Z')], pageInfo: { hasPreviousPage: true, startCursor: 'old' } };
  const page2 = { nodes: [event('2026-01-01T00:00:00Z')], pageInfo: { hasPreviousPage: false, startCursor: 'first' } };
  const fetchPage = async cursor => cursor === null ? page1 : page2;
  assert.equal((await collectHumanTimeline(fetchPage, { pageSize: 2 })).events.length, 3);
  await assert.rejects(collectHumanTimeline(async cursor => cursor === null ? { ...page1, nodes: [page1.nodes[0]] } : page2, { pageSize: 2 }));
  let reads = 0;
  await assert.rejects(collectHumanTimeline(async cursor => cursor === null ? (++reads === 1 ? page1 : page2) : page2, { pageSize: 2 }));
});
