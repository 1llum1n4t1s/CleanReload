const fail = () => { throw new Error('Check provenance is incomplete or inconsistent'); };
const positive = value => Number.isSafeInteger(value) && value > 0;
const validSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

// 過去のcheckを無視できるのは同一PR/H/workflow/jobの後続成功が証明できる場合だけ。
export async function classifySupersededChecks({ checks, suites, run, jobs, repositoryId, workflowId, pr, head, merge, loadJob, loadRun, loadJobs }) {
  if (!Array.isArray(checks) || !Array.isArray(suites) || !run || !Array.isArray(jobs)
    || !positive(repositoryId) || !positive(workflowId) || !positive(pr?.number) || !validSha(head) || !validSha(merge)) fail();
  const suiteMap = new Map();
  for (const suite of suites) {
    if (!positive(suite?.id) || suiteMap.has(suite.id)) fail();
    suiteMap.set(suite.id, suite);
  }
  const current = new Map(jobs.map(job => [job.id, job]));
  if (current.size !== jobs.length) fail();
  const oldRuns = new Map();
  const superseded = [];
  const checkIds = new Set();
  for (const check of checks) {
    if (!positive(check?.id) || checkIds.has(check.id) || check.app?.id !== 15368
      || !positive(check.check_suite?.id) || !suiteMap.has(check.check_suite.id)
      || check.status !== 'completed' || typeof check.name !== 'string') fail();
    checkIds.add(check.id);
    const suite = suiteMap.get(check.check_suite.id);
    if (suite.app?.id !== 15368 || suite.status !== 'completed') fail();
    if (current.has(check.id)) {
      if (current.get(check.id).name !== check.name) fail();
      continue;
    }
    const currentJob = jobs.find(job => job.name === check.name);
    if (!currentJob || currentJob.status !== 'completed'
      || (currentJob.conclusion !== 'success' && !(currentJob.name === 'security-result' && currentJob.conclusion === 'skipped'))) fail();
    const oldJob = await loadJob(check.id);
    if (oldJob?.id !== check.id || oldJob.name !== check.name || oldJob.status !== 'completed'
      || oldJob.conclusion !== check.conclusion || !positive(oldJob.run_id) || !positive(oldJob.run_attempt)) fail();
    let url;
    try { url = new URL(oldJob.check_run_url); } catch { fail(); }
    if (url.protocol !== 'https:' || url.hostname !== 'api.github.com' || url.port || url.username || url.password
      || ![`/repositories/${repositoryId}/check-runs/${check.id}`, `/repos/1llum1n4t1s/CleanReload/check-runs/${check.id}`].includes(url.pathname)
      || url.search || url.hash) fail();
    const key = `${oldJob.run_id}:${oldJob.run_attempt}`;
    if (!oldRuns.has(key)) {
      const oldRun = await loadRun(oldJob.run_id, oldJob.run_attempt);
      const oldJobs = await loadJobs(oldJob.run_id, oldJob.run_attempt);
      if (oldRun?.id !== oldJob.run_id || oldRun.run_attempt !== oldJob.run_attempt || oldRun.workflow_id !== workflowId
        || oldRun.path !== '.github/workflows/dependency-validation.yml' || oldRun.event !== 'pull_request'
        || oldRun.repository?.id !== repositoryId || oldRun.head_repository?.id !== repositoryId
        || oldRun.head_sha !== head || oldRun.head_branch !== pr.head.ref || oldRun.status !== 'completed'
        || !Array.isArray(oldJobs)) fail();
      if (oldRun.id === run.id) {
        if (oldRun.run_attempt >= run.run_attempt) fail();
      } else if (!Number.isFinite(Date.parse(oldRun.created_at)) || !Number.isFinite(Date.parse(run.created_at))
        || Date.parse(oldRun.created_at) >= Date.parse(run.created_at)) fail();
      const validate = oldJobs.filter(job => job.name === 'validate' && job.run_id === oldRun.id
        && job.run_attempt === oldRun.run_attempt && job.status === 'completed');
      if (validate.length !== 1) fail();
      const prefix = `validated-pr ${pr.number} action `;
      const proof = new RegExp(`^validated-pr ${pr.number} action (opened|synchronize) sender 49699333 head ${head} merge [0-9a-f]{40}$`);
      const oldProof = Array.isArray(validate[0].steps) && validate[0].steps.filter(step => typeof step.name === 'string' && step.name.startsWith(prefix)
        && proof.test(step.name) && step.status === 'completed' && step.conclusion === 'success').length === 1;
      let incompleteValidation = null;
      if (!oldProof) {
        const guard = oldJobs.filter(job => job.name === 'security-guard' && job.run_id === oldRun.id
          && job.run_attempt === oldRun.run_attempt && job.status === 'completed'
          && ['success', 'failure', 'cancelled', 'skipped'].includes(job.conclusion));
        const currentValidate = jobs.filter(job => job.name === 'validate' && job.run_id === run.id
          && job.run_attempt === run.run_attempt && job.status === 'completed' && job.conclusion === 'success');
        const currentGuard = jobs.filter(job => job.name === 'security-guard' && job.run_id === run.id
          && job.run_attempt === run.run_attempt && job.status === 'completed' && job.conclusion === 'success');
        const currentProof = new RegExp(`^validated-pr ${pr.number} action (opened|synchronize) sender 49699333 head ${head} merge ${merge}$`);
        const oldSteps = validate[0].steps;
        if (oldSteps != null && (!Array.isArray(oldSteps) || oldSteps.some(step => typeof step?.name !== 'string'))) fail();
        const oldProvenance = (oldSteps ?? []).filter(step => step.name.startsWith('validated-pr '));
        if (oldRun.id !== run.id || !['failure', 'cancelled', 'skipped'].includes(validate[0].conclusion)
          || oldProvenance.length > 1 || oldProvenance.some(step => !currentProof.test(step.name)
            || step.status !== 'completed' || step.conclusion !== 'skipped')
          || guard.length !== 1 || (validate[0].conclusion === 'skipped' && !['failure', 'cancelled'].includes(guard[0].conclusion))
          || currentGuard.length !== 1 || currentValidate.length !== 1
          || run.status !== 'completed' || run.conclusion !== 'success' || run.event !== 'pull_request'
          || run.workflow_id !== workflowId || run.head_sha !== head || run.head_repository?.id !== repositoryId
          || !Array.isArray(currentValidate[0].steps) || currentValidate[0].steps.filter(step => currentProof.test(step.name ?? '')
            && step.status === 'completed' && step.conclusion === 'success').length !== 1) fail();
        incompleteValidation = { validateId: validate[0].id, guardId: guard[0].id };
      }
      oldRuns.set(key, { incompleteValidation });
    }
    const incompleteValidation = oldRuns.get(key).incompleteValidation;
    if (incompleteValidation && !((check.name === 'validate' && check.id === incompleteValidation.validateId)
      || (check.name === 'security-guard' && check.id === incompleteValidation.guardId))) fail();
    if (!['success', 'failure', 'cancelled', 'skipped'].includes(check.conclusion)
      || (check.conclusion === 'skipped' && check.name !== 'security-result'
        && !(check.name === 'validate' && incompleteValidation?.validateId === check.id)
        && !(check.name === 'security-guard' && incompleteValidation?.guardId === check.id))) fail();
    superseded.push(check.id);
  }
  return superseded;
}
