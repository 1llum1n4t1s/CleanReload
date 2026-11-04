import { verifyMergeEvidence, guard } from './Dependabot-MergeEvidence.mjs';

const hold = message => { throw new Error(`Dependabot guard held: ${message}`); };
const id = value => Number.isSafeInteger(value) && value > 0;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// filtered timelineのtotalCountは証拠に使わずcursorを最後まで辿る。
export async function collectHumanTimeline(fetchPage, { pageSize = 100, maxPages = 20 } = {}) {
  if (!id(pageSize) || pageSize > 100 || !id(maxPages)) hold('timeline configuration');
  const events = [];
  const cursors = new Set();
  let before = null;
  let firstPage;
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(before, pageSize);
    if (!result || !Array.isArray(result.nodes) || result.nodes.length > pageSize
      || typeof result.pageInfo?.hasPreviousPage !== 'boolean') hold('timeline page');
    if (page === 0) firstPage = JSON.stringify(result);
    events.push(...[...result.nodes].reverse());
    if (!result.pageInfo.hasPreviousPage) {
      if (JSON.stringify(await fetchPage(null, pageSize)) !== firstPage) hold('timeline changed');
      const timeline = { complete: true, events };
      verifyHumanControl(timeline);
      return timeline;
    }
    const cursor = result.pageInfo.startCursor;
    if (result.nodes.length !== pageSize || typeof cursor !== 'string' || !cursor || cursors.has(cursor)) hold('timeline cursor');
    cursors.add(cursor);
    before = cursor;
  }
  hold('timeline page limit');
}

// owner-only bypassは別途provision監査が必要。ここでは実効ルールだけを照合する。
export function verifyEffectiveRules(rules, appId) {
  if (!Array.isArray(rules) || !id(appId) || !rules.some(rule => rule.type === 'non_fast_forward')) hold('missing branch protection');
  const expected = new Map([['validate', 15368], ['security-guard', 15368], [guard, appId]]);
  const found = new Set();
  for (const rule of rules.filter(item => item.type === 'required_status_checks')) {
    if (!Array.isArray(rule.parameters?.required_status_checks)) hold('invalid checks');
    for (const check of rule.parameters.required_status_checks) {
      if (typeof check.context !== 'string') hold('invalid context');
      const key = [...expected.keys()].find(name => name.toLowerCase() === check.context.toLowerCase());
      if (!key) continue;
      if (key !== check.context || expected.get(key) !== check.integration_id) hold('conflicting required check');
      if (rule.parameters.strict_required_status_checks_policy === true) found.add(key);
    }
  }
  if (found.size !== expected.size) hold('required check missing');
}

// Dependabot branchのcreation/update bypass主体はownerが事前監査する。
export function verifyDependabotBranchRules(rules, rulesetId) {
  if (!Array.isArray(rules) || !id(rulesetId)
    || !['creation', 'update'].every(type => rules.some(rule => rule.type === type && rule.ruleset_id === rulesetId))) hold('Dependabot branch rules');
}

// 新しい順。botの操作は人間による解除を上書きしない。
export function verifyHumanControl(timeline) {
  if (!timeline || timeline.complete !== true || !Array.isArray(timeline.events)) hold('timeline incomplete');
  const ids = new Set();
  let previous = Infinity;
  let latestHuman;
  for (const event of timeline.events) {
    const time = Date.parse(event?.createdAt);
    if (!event || typeof event.id !== 'string' || !event.id || ids.has(event.id) || !Number.isFinite(time)
      || time >= previous || !['AutoMergeEnabledEvent', 'AutoMergeDisabledEvent'].includes(event.__typename)
      || !event.actor || !['User', 'Bot'].includes(event.actor.__typename)
      || typeof event.actor.id !== 'string' || !event.actor.id || typeof event.actor.login !== 'string' || !event.actor.login) hold('timeline identity');
    previous = time;
    ids.add(event.id);
    if (!latestHuman && event.actor.__typename === 'User') latestHuman = event.__typename;
  }
  if (latestHuman === 'AutoMergeDisabledEvent') hold('human disabled auto-merge');
}

// statusはHEADに紐付くため、PR・発行run・nonceの対応が不明なら再利用しない。
export function inspectGuardHistory({ statuses, botId, botLogin, repo, pr }) {
  if (!Array.isArray(statuses) || !id(botId) || typeof botLogin !== 'string' || !/^[a-z0-9-]+\[bot\]$/.test(botLogin)
    || !id(pr) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) hold('invalid history');
  if (statuses.some((status, index) => index > 0 && status.id >= statuses[index - 1].id)) hold('status order');
  const sorted = [...statuses].reverse();
  const seen = new Set();
  let pending = null;
  let success = null;
  for (const status of sorted) {
    if (!id(status.id) || seen.has(status.id) || status.context !== guard || status.creator?.id !== botId
      || status.creator?.login !== botLogin || status.creator?.type !== 'Bot'
      || !['pending', 'success'].includes(status.state)) hold('unknown status');
    seen.add(status.id);
    const match = /^guard-v1:([1-9]\d*):([0-9a-f-]+)$/.exec(status.description ?? '');
    if (!match || Number(match[1]) !== pr || !uuid.test(match[2])) hold('status identity');
    const prefix = `https://github.com/${repo}/actions/runs/`;
    const target = status.target_url;
    if (typeof target !== 'string' || !target.startsWith(prefix)
      || !/^\d+\/attempts\/\d+$/.test(target.slice(prefix.length))) hold('status target');
    const marker = { nonce: match[2], target };
    if (status.state === 'pending') {
      if (pending) hold('ambiguous pending');
      pending = marker;
    } else {
      if (!pending || pending.nonce !== marker.nonce || pending.target !== marker.target) hold('unmatched success');
      success = marker;
      pending = null;
    }
  }
  return { pending, success };
}

// observeは全ページ・rules・CI run/attemptの読取りと独立監査済みbypass前提を確認する。
// いずれかの通信結果が不明なら呼出しを止め、後続の外部書込みを行わない。
export async function guardCandidate({ observe, postStatus, reserve, verifyMerged, repo, appId, appBotId, appBotLogin, controllerBotNodeId, nonce, runUrl }) {
  if (!uuid.test(nonce) || !id(appId) || !id(appBotId) || typeof appBotLogin !== 'string' || !/^[a-z0-9-]+\[bot\]$/.test(appBotLogin)
    || typeof controllerBotNodeId !== 'string' || !controllerBotNodeId) hold('invalid configuration');
  const runPrefix = `https://github.com/${repo}/actions/runs/`;
  if (typeof runUrl !== 'string' || !runUrl.startsWith(runPrefix)
    || !/^[1-9]\d*\/attempts\/[1-9]\d*$/.test(runUrl.slice(runPrefix.length))) hold('invalid run');
  let initial;
  let marker;
  function verify(data) {
    if (!data || data.bypassAudited !== true || data.sameHeadOpenPrs !== 1
      || !['APPROVED', null].includes(data.reviewDecision) || !['BLOCKED', 'CLEAN'].includes(data.mergeState)) hold('rules or pull request');
    verifyEffectiveRules(data.rules, appId);
    verifyHumanControl(data.timeline);
    const evidence = verifyMergeEvidence(data.evidence);
    const history = inspectGuardHistory({ statuses: data.guardStatuses, botId: appBotId, botLogin: appBotLogin, repo, pr: evidence.pr });
    if (data.auto && (data.auto.actorId !== controllerBotNodeId || data.auto.method !== 'SQUASH')) hold('unowned reservation');
    return { evidence, history, auto: data.auto, mergeState: data.mergeState };
  }
  function unchanged(left, right) {
    return JSON.stringify(left.evidence) === JSON.stringify(right.evidence);
  }
  initial = verify(await observe());
  if (initial.auto && initial.history.success && !initial.history.pending) return 'already-enabled';
  if (initial.mergeState !== 'BLOCKED') hold('guard is not blocking');
  if (!initial.auto && (initial.history.pending || initial.history.success)) hold('existing status without reservation');
  if (initial.auto && !initial.history.pending) hold('reservation without pending intent');

  if (initial.auto) {
    marker = initial.history.pending;
  } else {
    marker = { nonce, target: runUrl };
    const description = `guard-v1:${initial.evidence.pr}:${marker.nonce}`;
    try { await postStatus({ sha: initial.evidence.head, state: 'pending', context: guard, description, target_url: marker.target }); } catch { /* 正確なreadbackのみ採用する。 */ }
    const pending = verify(await observe());
    if (!unchanged(initial, pending) || pending.auto || pending.mergeState !== 'BLOCKED' || pending.history.pending?.nonce !== marker.nonce
      || pending.history.pending?.target !== marker.target) hold('pending not confirmed');
    try { await reserve({ pr: initial.evidence.pr, sha: initial.evidence.head, method: 'SQUASH' }); } catch { /* 予約結果は再読でのみ確認する。 */ }
  }

  const ready = verify(await observe());
  if (!unchanged(initial, ready) || !ready.auto || ready.mergeState !== 'BLOCKED' || ready.history.pending?.nonce !== marker.nonce
    || ready.history.pending?.target !== marker.target) hold('reservation not confirmed');
  const description = `guard-v1:${ready.evidence.pr}:${marker.nonce}`;
  try { await postStatus({ sha: ready.evidence.head, state: 'success', context: guard, description, target_url: marker.target }); } catch { /* 同一statusのreadbackを確認する。 */ }
  let done;
  try { done = verify(await observe()); } catch (error) {
    if (typeof verifyMerged === 'function' && await verifyMerged(initial.evidence) === true) return 'merged';
    throw error;
  }
  if (!unchanged(initial, done) || !done.auto || done.history.pending || done.history.success?.nonce !== marker.nonce
    || done.history.success?.target !== marker.target) hold('success not confirmed');
  return 'enabled';
}
