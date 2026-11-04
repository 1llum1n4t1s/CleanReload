import { createHash, randomUUID } from 'node:crypto';
import { collectStatusPages, inspectPaginationLinks } from './Dependabot-Pagination.mjs';
import { collectHumanTimeline, guardCandidate, verifyDependabotBranchRules, verifyEffectiveRules } from './Dependabot-Guard.mjs';
import { guard } from './Dependabot-MergeEvidence.mjs';
import { classifySupersededChecks } from './Dependabot-Checks.mjs';

const fail = () => { throw new Error('Dependabot GitHub evidence unavailable'); };
const positive = value => Number.isSafeInteger(value) && value > 0;
const deadline = () => ({ timeout: 10_000, signal: AbortSignal.timeout(10_000) });

function verifyOpenPrs(prs) {
  if (!Array.isArray(prs) || new Set(prs.map(pr => pr?.number)).size !== prs.length
    || prs.some(pr => !positive(pr?.id) || !positive(pr.number) || pr.state !== 'open' || typeof pr.draft !== 'boolean'
      || !positive(pr.user?.id) || typeof pr.user?.login !== 'string' || !pr.user.login
      || !positive(pr.head?.repo?.id) || !/^[0-9a-f]{40}$/.test(pr.head?.sha ?? '')
      || !positive(pr.base?.repo?.id) || typeof pr.base?.ref !== 'string' || !pr.base.ref)) fail();
}

function eligibleCandidates(prs, repositoryId, protectedAfter, event, eventHead) {
  if (event === 'workflow_run' && (typeof eventHead !== 'string' || !/^[0-9a-f]{40}$/.test(eventHead))) fail();
  return prs.filter(pr => pr.state === 'open' && pr.draft === false && pr.user?.id === 49699333
    && pr.user?.login === 'dependabot[bot]' && pr.head?.repo?.id === repositoryId
    && pr.base?.repo?.id === repositoryId && pr.base.ref === 'main' && /^[0-9a-f]{40}$/.test(pr.head.sha)
    && typeof pr.head.ref === 'string' && /^dependabot\/[A-Za-z0-9._/-]+$/.test(pr.head.ref)
    && Number.isFinite(Date.parse(pr.created_at)) && Date.parse(pr.created_at) > Date.parse(protectedAfter)
    && (event !== 'workflow_run' || pr.head.sha === eventHead));
}

async function pages(github, route, params, path, repositoryId, extract, key, maximum = 10) {
  const all = [];
  const seen = new Set();
  let total;
  let lastPage;
  for (let page = 1; page <= maximum; page++) {
    const response = await github.request(route, { ...params, per_page: 100, page, request: deadline() });
    const { items, count } = extract(response.data);
    if (!Array.isArray(items) || items.length > 100) fail();
    if (count !== undefined) {
      if (!Number.isSafeInteger(count) || count < 0 || (total !== undefined && total !== count)) fail();
      total = count;
    } else if (total !== undefined) fail();
    for (const item of items) {
      const identity = key(item);
      if (identity == null || seen.has(identity)) fail();
      seen.add(identity);
      all.push(item);
    }
    if (page > 1 && items.length === 0) fail();
    const links = inspectPaginationLinks(response.headers?.link, { path, repositoryId, page, pageSize: 100, lastPage });
    lastPage = links.lastPage;
    if (lastPage !== undefined && lastPage > maximum) fail();
    if (!links.hasNext) {
      if (total !== undefined && total !== all.length) fail();
      return all;
    }
    if (items.length !== 100) fail();
  }
  fail();
}

const pullQuery = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){id number state isDraft headRefOid reviewDecision mergeStateStatus autoMergeRequest{mergeMethod enabledBy{__typename login ... on User{id} ... on Bot{id}}}}}}`;
const timelineQuery = `query($owner:String!,$repo:String!,$number:Int!,$before:String,$count:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){timelineItems(last:$count,before:$before,itemTypes:[AUTO_MERGE_ENABLED_EVENT,AUTO_MERGE_DISABLED_EVENT]){pageInfo{hasPreviousPage startCursor} nodes{__typename ... on AutoMergeEnabledEvent{id createdAt actor{__typename login ... on User{id} ... on Bot{id}}} ... on AutoMergeDisabledEvent{id createdAt actor{__typename login ... on User{id} ... on Bot{id}}}}}}}}`;
const reserveMutation = `mutation($id:ID!,$head:GitObjectID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,expectedHeadOid:$head,mergeMethod:SQUASH}){pullRequest{id headRefOid autoMergeRequest{mergeMethod}}}}`;

// token発行前はread-onlyで候補の有無だけを確認する。最終検証は別途必須。
export async function hasGuardCandidate({ github, owner, repo, workflowSha, event, eventHead, protectedAfter }) {
  if (owner !== '1llum1n4t1s' || repo !== 'CleanReload' || !/^[0-9a-f]{40}$/.test(workflowSha)
    || !Number.isFinite(Date.parse(protectedAfter)) || !['workflow_run', 'workflow_dispatch'].includes(event)) fail();
  const common = { owner, repo };
  const repository = (await github.rest.repos.get({ ...common, request: deadline() })).data;
  if (!positive(repository.id) || repository.default_branch !== 'main') fail();
  const base = (await github.rest.repos.getBranch({ ...common, branch: 'main', request: deadline() })).data.commit.sha;
  if (base !== workflowSha) return false;
  const prs = await pages(github, 'GET /repos/{owner}/{repo}/pulls', { ...common, state: 'open' },
    `/repos/${owner}/${repo}/pulls`, repository.id, data => ({ items: data }), item => item?.id);
  verifyOpenPrs(prs);
  const candidates = eligibleCandidates(prs, repository.id, protectedAfter, event, eventHead);
  return candidates.length === 1 && prs.filter(pr => pr.head?.sha === candidates[0].head.sha).length === 1;
}

// trusted default branch以外のコードはcheckoutしない。全APIはGitHub標準トークンで読む。
export async function runGithubGuard({ github, owner, repo, workflowSha, appId, appClientId, appSlug, expectedAppSlug, appBotId, appToken, rulesetId, rulesetUpdatedAt, branchRulesetId, branchRulesetUpdatedAt, protectedAfter, runId, runAttempt, event, eventHead, fetchImpl = fetch }) {
  if (owner !== '1llum1n4t1s' || repo !== 'CleanReload' || !/^[0-9a-f]{40}$/.test(workflowSha)
    || !positive(appId) || !positive(rulesetId) || !positive(branchRulesetId) || branchRulesetId === rulesetId || !positive(runId) || !positive(runAttempt)
    || typeof appClientId !== 'string' || !appClientId || typeof appSlug !== 'string' || !/^[a-z0-9-]+$/.test(appSlug) || appSlug !== expectedAppSlug
    || !positive(appBotId) || typeof appToken !== 'string' || !appToken
    || typeof rulesetUpdatedAt !== 'string' || typeof branchRulesetUpdatedAt !== 'string'
    || !Number.isFinite(Date.parse(branchRulesetUpdatedAt)) || !Number.isFinite(Date.parse(protectedAfter))
    || Date.parse(branchRulesetUpdatedAt) >= Date.parse(protectedAfter) || !['workflow_run', 'workflow_dispatch'].includes(event)) fail();
  const common = { owner, repo };
  const prefix = `/repos/${owner}/${repo}`;
  const list = (route, params, suffix, extract, key) => pages(github, route, { ...common, ...params }, `${prefix}${suffix}`, repository.id, extract, key);
  const plain = data => ({ items: data });
  const keyed = key => item => item?.[key];
  const repository = (await github.rest.repos.get({ ...common, request: deadline() })).data;
  if (!positive(repository.id) || repository.default_branch !== 'main' || repository.allow_auto_merge !== true || repository.allow_squash_merge !== true) fail();
  const controller = (await github.rest.users.getByUsername({ username: 'github-actions[bot]', request: deadline() })).data;
  if (typeof controller.node_id !== 'string' || !controller.node_id) fail();
  const openPrs = await list('GET /repos/{owner}/{repo}/pulls', { state: 'open' }, '/pulls', plain, keyed('id'));
  verifyOpenPrs(openPrs);
  const candidates = eligibleCandidates(openPrs, repository.id, protectedAfter, event, eventHead);
  if (candidates.length !== 1) return 'held: candidate count';
  const number = candidates[0].number;
  // private Appを別のGITHUB_TOKENで照会せず、このApp自身のinstallation tokenで照合する。
  async function readAppIdentity(path) {
    try {
      const response = await fetchImpl(`https://api.github.com${path}`, { method: 'GET',
        headers: { authorization: `Bearer ${appToken}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2026-03-10' },
        redirect: 'error', signal: AbortSignal.timeout(10_000) });
      if (!response.ok) fail();
      return await response.json();
    } catch { fail(); }
  }
  const app = await readAppIdentity(`/apps/${encodeURIComponent(appSlug)}`);
  if (app?.id !== appId || app.client_id !== appClientId || app.slug !== expectedAppSlug) fail();
  const bot = await readAppIdentity(`/users/${encodeURIComponent(`${appSlug}[bot]`)}`);
  if (bot?.id !== appBotId || bot.login !== `${expectedAppSlug}[bot]` || bot.type !== 'Bot') fail();
  let nodeId;

  async function observe() {
    const currentRepo = (await github.rest.repos.get({ ...common, request: deadline() })).data;
    const base = (await github.rest.repos.getBranch({ ...common, branch: 'main', request: deadline() })).data.commit.sha;
    if (currentRepo.id !== repository.id || currentRepo.default_branch !== 'main' || base !== workflowSha) fail();
    const pr = (await github.rest.pulls.get({ ...common, pull_number: number, request: deadline() })).data;
    if (!pr?.head?.sha || typeof pr.head.ref !== 'string' || !/^dependabot\/[A-Za-z0-9._/-]+$/.test(pr.head.ref)) fail();
    const head = pr.head.sha;
    const currentPrs = await list('GET /repos/{owner}/{repo}/pulls', { state: 'open' }, '/pulls', plain, keyed('id'));
    verifyOpenPrs(currentPrs);
    const sameHeadOpenPrs = currentPrs.filter(item => item.head?.sha === head).length;
    const rules = await list('GET /repos/{owner}/{repo}/rules/branches/{branch}', { branch: 'main' }, '/rules/branches/main', plain, item => `${item.ruleset_id}:${item.type}`);
    verifyEffectiveRules(rules, appId);
    if (!rules.some(rule => rule.ruleset_id === rulesetId && rule.type === 'required_status_checks'
      && rule.parameters?.strict_required_status_checks_policy === true
      && rule.parameters.required_status_checks?.some(check => check.context === guard && check.integration_id === appId))) fail();
    const rule = (await github.request('GET /repos/{owner}/{repo}/rulesets/{ruleset_id}', { ...common, ruleset_id: rulesetId, request: deadline() })).data;
    if (rule.id !== rulesetId || rule.enforcement !== 'active' || rule.target !== 'branch'
      || rule.source_type !== 'Repository' || rule.source?.toLowerCase() !== `${owner}/${repo}`.toLowerCase()
      || rule.updated_at !== rulesetUpdatedAt) fail();
    const branchRules = await list('GET /repos/{owner}/{repo}/rules/branches/{branch}', { branch: pr.head.ref }, `/rules/branches/${encodeURIComponent(pr.head.ref)}`, plain, item => `${item.ruleset_id}:${item.type}`);
    verifyDependabotBranchRules(branchRules, branchRulesetId);
    const branchRule = (await github.request('GET /repos/{owner}/{repo}/rulesets/{ruleset_id}', { ...common, ruleset_id: branchRulesetId, request: deadline() })).data;
    if (branchRule.id !== branchRulesetId || branchRule.enforcement !== 'active' || branchRule.target !== 'branch'
      || branchRule.source_type !== 'Repository' || branchRule.source?.toLowerCase() !== `${owner}/${repo}`.toLowerCase()
      || branchRule.updated_at !== branchRulesetUpdatedAt) fail();
    const graph = (await github.graphql(pullQuery, { ...common, number, request: deadline() })).repository?.pullRequest;
    if (!graph || graph.number !== number || graph.state !== 'OPEN' || graph.isDraft !== false || graph.headRefOid !== head) fail();
    nodeId = graph.id;
    const timeline = await collectHumanTimeline(async (before, count) => {
      const result = await github.graphql(timelineQuery, { ...common, number, before, count, request: deadline() });
      return result.repository?.pullRequest?.timelineItems;
    });
    const commits = await list('GET /repos/{owner}/{repo}/pulls/{pull_number}/commits', { pull_number: number }, `/pulls/${number}/commits`, plain, keyed('sha'));
    const files = await list('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', { pull_number: number }, `/pulls/${number}/files`, plain, keyed('filename'));
    let packageFiles;
    if (files.some(file => file.filename === 'package.json')) {
      const readPackage = async ref => {
        const content = (await github.rest.repos.getContent({ ...common, path: 'package.json', ref, request: deadline() })).data;
        if (content?.type !== 'file' || content.encoding !== 'base64' || !Number.isSafeInteger(content.size)
          || content.size < 1 || content.size > 1_000_000 || typeof content.content !== 'string'
          || !/^[0-9a-f]{40}$/.test(content.sha ?? '') || /\r(?!\n)/.test(content.content)) fail();
        const encoded = content.content.replace(/\r?\n/g, '');
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail();
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.length !== content.size || bytes.toString('base64') !== encoded
          || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== content.sha) fail();
        try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail(); }
      };
      packageFiles = { base: await readPackage(base), head: await readPackage(head) };
    }
    const headCommit = (await github.rest.git.getCommit({ ...common, commit_sha: head, request: deadline() })).data;
    const compare = (await github.rest.repos.compareCommitsWithBasehead({ ...common, basehead: `${base}...${head}`, request: deadline() })).data;
    const mergeRef = (await github.rest.git.getRef({ ...common, ref: `pull/${number}/merge`, request: deadline() })).data.object.sha;
    const mergeCommit = (await github.rest.git.getCommit({ ...common, commit_sha: mergeRef, request: deadline() })).data;
    const workflow = (await github.rest.actions.getWorkflow({ ...common, workflow_id: 'dependency-validation.yml', request: deadline() })).data;
    if (workflow.path !== '.github/workflows/dependency-validation.yml' || workflow.state !== 'active') fail();
    const runs = await list('GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs', { workflow_id: workflow.id, event: 'pull_request', head_sha: head }, `/actions/workflows/${workflow.id}/runs`, data => ({ items: data.workflow_runs, count: data.total_count }), keyed('id'));
    runs.sort((a, b) => b.id - a.id);
    const run = runs[0];
    if (!run || !positive(run.id) || !positive(run.run_attempt)) fail();
    const jobs = await list('GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs', { run_id: run.id, attempt_number: run.run_attempt }, `/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, data => ({ items: data.jobs, count: data.total_count }), keyed('id'));
    const readStatuses = ref => collectStatusPages(async (page, perPage) => {
      const response = await github.request('GET /repos/{owner}/{repo}/commits/{ref}/statuses', { ...common, ref, page, per_page: perPage, request: deadline() });
      return { items: response.data, link: response.headers?.link };
    }, { path: `${prefix}/commits/${ref}/statuses`, repositoryId: repository.id });
    const readChecks = ref => list('GET /repos/{owner}/{repo}/commits/{ref}/check-runs', { ref, filter: 'all' }, `/commits/${ref}/check-runs`, data => ({ items: data.check_runs, count: data.total_count }), keyed('id'));
    const readSuites = ref => list('GET /repos/{owner}/{repo}/commits/{ref}/check-suites', { ref }, `/commits/${ref}/check-suites`, data => {
      if (!Number.isSafeInteger(data.total_count) || data.total_count >= 1000) fail();
      return { items: data.check_suites, count: data.total_count };
    }, keyed('id'));
    const readCheckedRuns = async ref => {
      const before = await readSuites(ref);
      const checks = await readChecks(ref);
      const suiteRuns = [];
      for (const suite of before) {
        if (!positive(suite?.id) || !positive(suite.app?.id)) fail();
        const items = await list('GET /repos/{owner}/{repo}/check-suites/{check_suite_id}/check-runs',
          { check_suite_id: suite.id, filter: 'all' }, `/check-suites/${suite.id}/check-runs`,
          data => ({ items: data.check_runs, count: data.total_count }), keyed('id'));
        if ((!items.length && suite.status !== 'queued') || (items.length && suite.status !== 'completed')
          || items.some(item => item.check_suite?.id !== suite.id)) fail();
        suiteRuns.push(...items);
      }
      const signature = item => JSON.stringify([item.id, item.name, item.status, item.conclusion, item.app?.id, item.check_suite?.id]);
      if (checks.length !== suiteRuns.length || new Set(suiteRuns.map(item => item.id)).size !== suiteRuns.length
        || checks.map(signature).sort().join('\n') !== suiteRuns.map(signature).sort().join('\n')) fail();
      const after = await readSuites(ref);
      if (JSON.stringify(before) !== JSON.stringify(after)) fail();
      return { checks, suites: before };
    };
    const headStatuses = await readStatuses(head);
    const headResult = await readCheckedRuns(head);
    const mergeStatuses = await readStatuses(mergeRef);
    const mergeResult = await readCheckedRuns(mergeRef);
    const checks = [...headResult.checks, ...mergeResult.checks];
    const suites = [...headResult.suites, ...mergeResult.suites];
    const supersededCheckIds = await classifySupersededChecks({ checks, suites, run, jobs, repositoryId: repository.id, workflowId: workflow.id, pr, head, merge: mergeRef,
      loadJob: async jobId => (await github.request('GET /repos/{owner}/{repo}/actions/jobs/{job_id}', { ...common, job_id: jobId, request: deadline() })).data,
      loadRun: async (runId, attempt) => (await github.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}', { ...common, run_id: runId, attempt_number: attempt, request: deadline() })).data,
      loadJobs: (runId, attempt) => list('GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs', { run_id: runId, attempt_number: attempt }, `/actions/runs/${runId}/attempts/${attempt}/jobs`, data => ({ items: data.jobs, count: data.total_count }), keyed('id')) });
    for (const suite of suites) {
      const related = checks.filter(check => check.check_suite?.id === suite.id);
      if (!related.length) continue; // 全ページで空と確認したqueued suite。
      if (suite.conclusion === 'success') continue;
      if (['failure', 'cancelled'].includes(suite.conclusion) && related.every(check => supersededCheckIds.includes(check.id))) continue;
      if (suite.conclusion === 'skipped' && related.every(check => check.name === 'security-result' && check.conclusion === 'skipped')) continue;
      fail();
    }
    const guardStatuses = headStatuses.filter(status => typeof status.context === 'string' && status.context.toLowerCase() === guard);
    const evidence = { repository: currentRepo, pr, base, headCommit, mergeCommit, compare, commits, files, packageFiles, protectedAfter,
      headStatuses: headStatuses.filter(status => !guardStatuses.includes(status)), headChecks: headResult.checks, mergeStatuses, mergeChecks: mergeResult.checks,
      approvedHeadCheckIds: jobs.map(job => job.id), supersededCheckIds, run, jobs, workflowId: workflow.id };
    return { evidence, rules, bypassAudited: true, sameHeadOpenPrs, reviewDecision: graph.reviewDecision,
      mergeState: graph.mergeStateStatus, auto: graph.autoMergeRequest ? { actorId: graph.autoMergeRequest.enabledBy?.id, method: graph.autoMergeRequest.mergeMethod } : null, timeline, guardStatuses };
  }
  async function postStatus(status) {
    const response = await fetchImpl(`https://api.github.com${prefix}/statuses/${status.sha}`, { method: 'POST',
      headers: { authorization: `Bearer ${appToken}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2026-03-10', 'content-type': 'application/json' },
      body: JSON.stringify({ state: status.state, context: status.context, description: status.description, target_url: status.target_url }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) fail();
  }
  async function reserve({ sha }) {
    if (typeof nodeId !== 'string' || !nodeId) fail();
    const result = await github.graphql(reserveMutation, { id: nodeId, head: sha, request: deadline() });
    const pull = result.enablePullRequestAutoMerge?.pullRequest;
    if (pull?.id !== nodeId || pull.headRefOid !== sha || pull.autoMergeRequest?.mergeMethod !== 'SQUASH') fail();
  }
  async function verifyMerged(snapshot) {
    const pull = (await github.rest.pulls.get({ ...common, pull_number: number, request: deadline() })).data;
    if (pull.state !== 'closed' || pull.merged !== true || !pull.merged_at || pull.number !== snapshot.pr
      || pull.user?.id !== 49699333 || pull.head?.sha !== snapshot.head || pull.base?.ref !== 'main'
      || !/^[0-9a-f]{40}$/.test(pull.merge_commit_sha ?? '')) return false;
    const merged = (await github.rest.git.getCommit({ ...common, commit_sha: pull.merge_commit_sha, request: deadline() })).data;
    if (merged.sha !== pull.merge_commit_sha || merged.parents?.length !== 1 || merged.parents[0].sha !== snapshot.base
      || merged.tree?.sha !== snapshot.tree) return false;
    const main = (await github.rest.repos.getBranch({ ...common, branch: 'main', request: deadline() })).data.commit.sha;
    const ancestry = (await github.rest.repos.compareCommitsWithBasehead({ ...common, basehead: `${merged.sha}...${main}`, request: deadline() })).data;
    if (!['ahead', 'identical'].includes(ancestry.status) || ancestry.merge_base_commit?.sha !== merged.sha) return false;
    const finalPull = (await github.rest.pulls.get({ ...common, pull_number: number, request: deadline() })).data;
    const finalMain = (await github.rest.repos.getBranch({ ...common, branch: 'main', request: deadline() })).data.commit.sha;
    return finalPull.state === 'closed' && finalPull.merged === true && finalPull.head?.sha === snapshot.head
      && finalPull.merge_commit_sha === merged.sha && finalMain === main;
  }
  return guardCandidate({ observe, postStatus, reserve, verifyMerged, repo: `${owner}/${repo}`, appId, appBotId, appBotLogin: `${expectedAppSlug}[bot]`,
    controllerBotNodeId: controller.node_id, nonce: randomUUID(), runUrl: `https://github.com/${owner}/${repo}/actions/runs/${runId}/attempts/${runAttempt}` });
}
