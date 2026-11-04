const shaPattern = /^[0-9a-f]{40}$/;
export const guard = 'kagayoi/automation-merge-guard-v1';
const botId = 49699333;
const fail = () => { throw new Error('Dependabot merge evidence is incomplete or inconsistent'); };
const validId = value => Number.isSafeInteger(value) && value > 0;

function dependencyFile(file) {
  if (file.status !== 'modified') return false;
  if (['package.json', 'bun.lock'].includes(file.filename)) return true;
  if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(file.filename) || !file.patch) return false;
  const changed = file.patch.split('\n').filter(line => /^[+-]/.test(line) && !/^(\+\+\+|---)/.test(line));
  const before = changed.filter(line => line[0] === '-').map(line => line.slice(1));
  const after = changed.filter(line => line[0] === '+').map(line => line.slice(1));
  const uses = /^\s*(?:-\s*)?uses:\s*[^\s@]+@[A-Za-z0-9._/-]+(?:\s*#.*)?$/;
  const normalized = value => value.replace(/(uses:\s*[^\s@]+@)[A-Za-z0-9._/-]+/g, '$1<VERSION>').replace(/\s+#.*$/, '');
  return before.length > 0 && before.length === after.length
    && before.every((line, i) => uses.test(line) && uses.test(after[i]) && normalized(line) === normalized(after[i]));
}

// package.json の許可範囲は既存依存のversion指定のみ。
export function verifyPackageJson(before, after) {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(before) || !object(after)) fail();
  const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides'];
  const remaining = value => Object.fromEntries(Object.entries(value).filter(([key]) => !fields.includes(key)));
  if (!isDeepStrictEqual(remaining(before), remaining(after))) fail();
  for (const field of fields) {
    const oldValue = before[field];
    const newValue = after[field];
    if (oldValue === undefined && newValue === undefined) continue;
    if (!object(oldValue) || !object(newValue)
      || !isDeepStrictEqual(Object.keys(oldValue).sort(), Object.keys(newValue).sort())) fail();
    for (const name of Object.keys(oldValue)) {
      if (typeof oldValue[name] !== 'string' || typeof newValue[name] !== 'string') fail();
      if (oldValue[name] !== newValue[name] && !/^[0-9A-Za-z.*+^~<>=| -]+$/.test(newValue[name])) fail();
    }
  }
}

// API呼出し元は全ページを取得し、ページ境界・tipの変化を別途確認する。
export function verifyMergeEvidence({ repository, pr, base, headCommit, mergeCommit, compare, commits, files, packageFiles, headStatuses, headChecks, mergeStatuses, mergeChecks, run, jobs, workflowId, protectedAfter, approvedHeadStatusIds = [], approvedHeadCheckIds = [], supersededCheckIds = [] }) {
  if (!repository || !validId(repository.id) || !pr || !validId(pr.number) || pr.state !== 'open' || pr.draft !== false
    || pr.user?.id !== botId || pr.user?.login !== 'dependabot[bot]' || pr.user?.type !== 'Bot'
    || pr.head?.repo?.id !== repository.id || pr.base?.repo?.id !== repository.id
    || pr.base.ref !== repository.default_branch || pr.mergeable !== true
    || typeof pr.head.ref !== 'string' || !/^dependabot\/[A-Za-z0-9._/-]+$/.test(pr.head.ref)
    || !Number.isFinite(Date.parse(protectedAfter)) || !Number.isFinite(Date.parse(pr.created_at))
    || Date.parse(pr.created_at) <= Date.parse(protectedAfter)
    || !shaPattern.test(base) || !shaPattern.test(pr.head.sha) || !shaPattern.test(mergeCommit?.sha)
    || !shaPattern.test(mergeCommit?.tree?.sha)) fail();
  const head = pr.head.sha;
  if (headCommit?.sha !== head || headCommit.parents?.length !== 1
    || compare?.status !== 'ahead' || compare.merge_base_commit?.sha !== base
    || mergeCommit.parents?.length !== 2 || mergeCommit.parents[0].sha !== base || mergeCommit.parents[1].sha !== head) fail();
  if (!Array.isArray(commits) || !commits.length || commits.length !== pr.commits
    || new Set(commits.map(commit => commit.sha)).size !== commits.length
    || commits.at(-1)?.sha !== head || commits.some(commit => !shaPattern.test(commit.sha) || commit.author?.id !== botId
      || commit.author?.login !== 'dependabot[bot]' || commit.author?.type !== 'Bot'
      || commit.committer?.id !== 19864447 || commit.committer?.login !== 'web-flow'
      || commit.commit?.verification?.verified !== true || commit.commit?.verification?.reason !== 'valid'
      || typeof commit.commit?.verification?.signature !== 'string' || !commit.commit.verification.signature
      || typeof commit.commit?.verification?.payload !== 'string' || !commit.commit.verification.payload)) fail();
  if (!Array.isArray(files) || !files.length || files.length !== pr.changed_files
    || new Set(files.map(file => file.filename)).size !== files.length
    || files.some(file => typeof file.filename !== 'string' || !file.filename || !dependencyFile(file))) fail();
  if (files.some(file => file.filename === 'package.json')) verifyPackageJson(packageFiles?.base, packageFiles?.head);
  if (!Array.isArray(headStatuses) || !Array.isArray(headChecks) || !Array.isArray(mergeStatuses) || !Array.isArray(mergeChecks)
    || !Array.isArray(approvedHeadStatusIds) || !Array.isArray(approvedHeadCheckIds) || !Array.isArray(supersededCheckIds)
    || mergeStatuses.length !== 0
    || headStatuses.some(status => typeof status.context !== 'string' || status.context.toLowerCase() === guard
      || !validId(status.id) || !approvedHeadStatusIds.includes(status.id))
    || [...headChecks, ...mergeChecks].some(check => typeof check.name !== 'string' || check.name.toLowerCase() === guard
      || !validId(check.id) || (!approvedHeadCheckIds.includes(check.id) && !supersededCheckIds.includes(check.id))
      || check.status !== 'completed' || (check.conclusion !== 'success'
        && !supersededCheckIds.includes(check.id)
        && !(check.name === 'security-result' && check.conclusion === 'skipped'
          && Array.isArray(jobs) && jobs.some(job => job.id === check.id && job.name === 'security-result'
            && job.run_id === run?.id && job.run_attempt === run?.run_attempt
            && job.status === 'completed' && job.conclusion === 'skipped'))))) fail();
  if (!validId(workflowId) || !run || run.workflow_id !== workflowId || !validId(run.id) || !validId(run.run_attempt)
    || run.status !== 'completed' || run.conclusion !== 'success' || run.head_repository?.id !== repository.id
    || run.event !== 'pull_request' || run.head_sha !== head || !Number.isFinite(Date.parse(run.created_at))
    || Date.parse(run.created_at) <= Date.parse(protectedAfter)) fail();
  if (!Array.isArray(jobs) || jobs.length < 2 || jobs.length > 3 || new Set(jobs.map(job => job.name)).size !== jobs.length
    || !['security-guard', 'validate'].every(name => jobs.some(job => job.name === name))
    || jobs.some(job => !validId(job.id) || job.run_id !== run.id || job.run_attempt !== run.run_attempt
      || job.status !== 'completed' || (['security-guard', 'validate'].includes(job.name)
        ? job.conclusion !== 'success' : job.name !== 'security-result' || job.conclusion !== 'skipped'))) fail();
  const validation = jobs.find(job => job.name === 'validate');
  if (!Array.isArray(validation.steps)
    || validation.steps.filter(step => ['opened', 'synchronize'].some(action => step.name === `validated-pr ${pr.number} action ${action} sender ${botId} head ${head} merge ${mergeCommit.sha}`)
      && step.status === 'completed' && step.conclusion === 'success').length !== 1) fail();
  return { pr: pr.number, base, head, merge: mergeCommit.sha, tree: mergeCommit.tree.sha, run: run.id, attempt: run.run_attempt };
}
import { isDeepStrictEqual } from 'node:util';

