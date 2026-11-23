const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createProfilePager } = require('../src/utils/profilePagination');

test('report buttons survive a restart and update only the original message', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'val-pages-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  let now = Date.now();
  const pager = () => createProfilePager(dir, () => now);
  const pages = [{ embeds: [{ title: 'Ranked Report' }] }, { embeds: [{ title: 'Teammates' }] }];
  let posted;
  await pager().sendProfilePages({
    id: '12345', user: { id: 'owner' },
    editReply: async (payload) => { posted = payload; },
    followUp: () => assert.fail('Unexpected second message'),
  }, pages);
  const next = posted.components[0].toJSON().components[2].custom_id;
  const handle = pager().handleProfilePage;
  now += 60 * 60 * 1000;
  let current;
  let notices = [];
  const click = (customId, userId) => handle({
    customId, user: { id: userId },
    update: async (payload) => { current = payload; },
    reply: async ({ content }) => { notices.push(content); },
  });
  await click(next, 'guest');
  assert.equal(current, undefined);
  assert.match(notices.at(-1), /your own report/);
  await click(next, 'owner');
  assert.equal(current.embeds[0].title, 'Teammates');
  const previous = current.components[0].toJSON().components[0].custom_id;
  await click(previous, 'owner');
  assert.equal(current.embeds[0].title, 'Ranked Report');

  now += 7 * 24 * 60 * 60 * 1000;
  await click(next, 'owner');
  assert.match(notices.at(-1), /no longer available/);
  await click('ranked-page:1', 'owner');
  assert.match(notices.at(-1), /fresh report/);
});

test('one-page reports have no paging controls or disk dependency', async () => {
  const page = { embeds: [{ title: 'Ranked Report' }] };
  let edits = 0;
  await createProfilePager('/does-not-exist').sendProfilePages({
    editReply: async (payload) => { edits++; assert.equal(payload, page); },
  }, [page]);
  assert.equal(edits, 1);
});

test('summary opens Details and can return without a second message', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'val-details-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const pager = createProfilePager(dir);
  const pages = [{ embeds: [{ title: 'Player', fields: [{ name: '📄 Details' }] }] },
    { embeds: [{ title: 'Ranked Report · Details' }] }];
  let page;
  const owner = { id: 'owner' };
  await pager.sendProfilePages({ id: '87654', user: owner, editReply: async (value) => { page = value; } }, pages);
  async function press(label) {
    const button = page.components[0].toJSON().components.find((component) => component.label === label);
    assert.ok(button);
    await pager.handleProfilePage({ customId: button.custom_id, user: owner, update: async (value) => { page = value; } });
  }
  await press('Details');
  assert.equal(page.embeds[0].title, 'Ranked Report · Details');
  await press('Summary');
  assert.equal(page.embeds[0].title, 'Player');
});
