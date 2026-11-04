const fail = () => { throw new Error('Pagination is incomplete or inconsistent'); };

// Link先は追跡せず、取得済みrepo IDと各relationのページ番号を照合する。
export function inspectPaginationLinks(link, { path, repositoryId, page, pageSize, lastPage }) {
  const matchPath = typeof path === 'string' && /^\/repos\/[^/]+\/[^/]+(\/.*)$/.exec(path);
  if (!matchPath || !Number.isSafeInteger(repositoryId) || repositoryId < 1
    || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1
    || (link != null && typeof link !== 'string')) fail();
  const numericPath = `/repositories/${repositoryId}${matchPath[1]}`;
  const relations = new Map();
  for (const part of link ? link.split(',') : []) {
    const match = /^\s*<([^>]+)>;\s*rel="(next|prev|first|last)"\s*$/.exec(part);
    if (!match || relations.has(match[2])) fail();
    let url;
    try { url = new URL(match[1]); } catch { fail(); }
    if (url.protocol !== 'https:' || url.hostname !== 'api.github.com' || url.port || url.username || url.password || url.hash
      || ![path, numericPath].includes(url.pathname) || url.searchParams.getAll('page').length !== 1
      || url.searchParams.getAll('per_page').length !== 1 || url.searchParams.get('per_page') !== String(pageSize)
      || !/^[1-9]\d*$/.test(url.searchParams.get('page') ?? '')) fail();
    const target = Number(url.searchParams.get('page'));
    if (!Number.isSafeInteger(target)) fail();
    relations.set(match[2], target);
  }
  if ((relations.has('first') && relations.get('first') !== 1)
    || (relations.has('prev') && relations.get('prev') !== page - 1)
    || (relations.has('next') && relations.get('next') !== page + 1)) fail();
  const advertisedLast = relations.get('last');
  if (advertisedLast !== undefined) {
    if (advertisedLast < page || (lastPage !== undefined && lastPage !== advertisedLast)) fail();
    lastPage = advertisedLast;
  }
  const hasNext = relations.has('next');
  if (lastPage !== undefined && (page > lastPage || (hasNext ? page >= lastPage : page !== lastPage))) fail();
  return { hasNext, lastPage };
}

// 不完全な一覧を「未検出」と判断しない。取得処理はGitHubのレスポンスをそのまま渡す。
export async function collectStatusPages(fetchPage, { path, repositoryId, pageSize = 100, maxPages = 10 } = {}) {
  if (!Number.isSafeInteger(repositoryId) || repositoryId < 1 || !Number.isSafeInteger(pageSize)
    || pageSize < 1 || pageSize > 100 || !Number.isSafeInteger(maxPages) || maxPages < 1) fail();
  const result = [];
  let expectedTotal;
  let lastId = Infinity;
  let lastPage;
  for (let page = 1; page <= maxPages; page++) {
    const response = await fetchPage(page, pageSize);
    if (!response || !Array.isArray(response.items) || response.items.length > pageSize
      || (response.link != null && typeof response.link !== 'string')) fail();
    if (response.total != null) {
      if (!Number.isSafeInteger(response.total) || response.total < 0
        || (expectedTotal !== undefined && expectedTotal !== response.total)) fail();
      expectedTotal = response.total;
    } else if (expectedTotal !== undefined) fail();
    for (const item of response.items) {
      if (!Number.isSafeInteger(item?.id) || item.id < 1 || item.id >= lastId) fail();
      lastId = item.id;
      result.push(item);
    }
    if (page > 1 && response.items.length === 0) fail();
    const links = inspectPaginationLinks(response.link, { path, repositoryId, page, pageSize, lastPage });
    lastPage = links.lastPage;
    if (lastPage !== undefined && lastPage > maxPages) fail();
    if (!links.hasNext) {
      if (expectedTotal !== undefined && result.length !== expectedTotal) fail();
      return result;
    }
    if (response.items.length !== pageSize) fail();
  }
  fail();
}
