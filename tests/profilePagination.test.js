const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { sendProfilePages } = require('../src/utils/profilePagination');

test('overflow pages update the original Discord reply and never send a second report', async () => {
  const collector = new EventEmitter();
  const edits = [];
  const updates = [];
  const interaction = {
    user: { id: 'requester' },
    editReply: async (payload) => {
      edits.push(payload);
      return { createMessageComponentCollector: () => collector };
    },
    followUp: () => assert.fail('A continuation must not send a second message'),
  };
  const first = { embeds: [{ title: 'Ranked Report' }] };
  const second = { embeds: [{ title: 'Teammates' }] };

  await sendProfilePages(interaction, [first, second]);
  assert.equal(edits.length, 1);
  const buttons = edits[0].components[0].toJSON().components;
  assert.equal(buttons[2].label, 'Next');
  collector.emit('collect', {
    customId: buttons[2].custom_id, user: interaction.user,
    update: async (payload) => { updates.push(payload); },
  });
  await new Promise(setImmediate);
  assert.equal(updates[0].embeds[0].title, 'Teammates');
  assert.equal(edits.length, 1);
  collector.emit('end');
  await new Promise(setImmediate);
  assert.ok(edits.at(-1).components[0].toJSON().components.every((button) => button.disabled));
});

test('a report that fits gets one reply without page controls', async () => {
  const page = { embeds: [{ title: 'Ranked Report' }] };
  let edits = 0;
  await sendProfilePages({ editReply: async (payload) => { edits++; assert.equal(payload, page); } }, [page]);
  assert.equal(edits, 1);
});
