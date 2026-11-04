import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectStatusPages } from './Dependabot-Pagination.mjs';

const path = '/repos/owner/repo/commits/abc/statuses';
const next = `<https://api.github.com${path}?per_page=2&page=2>; rel="next"`;
const first = { items: [{ id: 5 }, { id: 4 }], total: 3, link: next };
const second = { items: [{ id: 3 }], total: 3 };
const collect = pages => collectStatusPages(async page => pages[page - 1], { path, repositoryId: 1, pageSize: 2 });

test('全ページを順序と総件数まで照合する', async () => {
  assert.deepEqual((await collect([first, second])).map(item => item.id), [5, 4, 3]);
});

test('数値repo IDと宣言された最終ページまでを照合する', async () => {
  const numeric = '/repositories/1/commits/abc/statuses';
  const link = (p, relation, target = numeric) => `<https://api.github.com${target}?per_page=2&page=${p}>; rel="${relation}"`;
  const one = { items: [{ id: 9 }, { id: 8 }], link: `${link(2, 'next')}, ${link(3, 'last')}` };
  const two = { items: [{ id: 7 }, { id: 6 }], link: `${link(1, 'prev', path)}, ${link(3, 'next')}, ${link(3, 'last')}` };
  const three = { items: [{ id: 5 }], link: link(2, 'prev') };
  assert.deepEqual((await collect([one, two, three])).map(item => item.id), [9, 8, 7, 6, 5]);
  await assert.rejects(collect([{ ...one, link: one.link.replaceAll('/repositories/1/', '/repositories/2/') }, two, three]));
  await assert.rejects(collect([one, { items: [], link: undefined }]));
  await assert.rejects(collect([one, { ...two, link: undefined }]));
  await assert.rejects(collect([one, { ...two, link: `${link(3, 'next')}, ${link(4, 'last')}` }, three]));
});

test('短いページのnext、重複、件数変化、不正なnextを保留する', async () => {
  for (const pages of [
    [{ ...first, items: [{ id: 5 }] }, second],
    [first, { ...second, items: [{ id: 4 }] }],
    [first, { ...second, total: 4 }],
    [{ ...first, link: next.replace('api.github.com', 'example.com') }, second],
    [{ ...first, link: undefined }],
  ]) await assert.rejects(collect(pages));
});
