import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeWardrobe } from '../native-storage.js';
function fixture() {
  let manifest = null,
    number = 0,
    failWrite = false,
    failCommit = false;
  const files = new Map();
  const deps = {
    uuid: () => String(++number),
    readManifest: async () => structuredClone(manifest),
    writeManifest: async (value) => {
      if (failCommit) throw new Error('Full preferences');
      manifest = structuredClone(value);
    },
    readFile: async (path) => {
      if (!files.has(path)) throw new Error('Missing file');
      return files.get(path);
    },
    writeFile: async (path, data) => {
      if (failWrite) throw new Error('Full disk');
      files.set(path, data);
    },
    deleteFile: async (path) => files.delete(path),
  };
  return {
    deps,
    files,
    setWriteFailure: (value) => (failWrite = value),
    setCommitFailure: (value) => (failCommit = value),
  };
}
const item = (id, name = id) => ({
  id,
  name,
  category: 'shirt',
  photo: 'data:image/png;base64,fixture',
});
test('records survive reopen, rename, batch import, and removal', async () => {
  const f = fixture(),
    store = createNativeWardrobe(f.deps);
  await store.open();
  await store.transaction('readwrite', (s) => {
    s.put(item('one'));
    s.put(item('two'));
  });
  await store.transaction('readwrite', (s) => s.put(item('one', 'Renamed')));
  const reopened = createNativeWardrobe(f.deps);
  await reopened.open();
  assert.deepEqual(
    (await reopened.transaction('readonly', (s) => s.getAll())).map((i) => i.name),
    ['Renamed', 'two'],
  );
  await reopened.transaction('readwrite', (s) => s.delete('one'));
  assert.equal((await reopened.transaction('readonly', (s) => s.getAll())).length, 1);
  assert.equal(f.files.size, 1);
});
test('failed file write or manifest commit preserves previously saved clothing', async () => {
  for (const stage of ['write', 'commit']) {
    const f = fixture(),
      store = createNativeWardrobe(f.deps);
    await store.open();
    await store.transaction('readwrite', (s) => s.put(item('one', 'Original')));
    stage === 'write' ? f.setWriteFailure(true) : f.setCommitFailure(true);
    await assert.rejects(store.transaction('readwrite', (s) => s.put(item('one', 'Changed'))));
    const reopened = createNativeWardrobe(f.deps);
    await reopened.open();
    assert.equal((await reopened.transaction('readonly', (s) => s.getAll()))[0].name, 'Original');
    assert.equal(f.files.size, 1);
  }
});
test('concurrent saves serialize and a failed save does not poison later saves', async () => {
  const f = fixture(),
    store = createNativeWardrobe(f.deps);
  await store.open();
  await Promise.all([
    store.transaction('readwrite', (s) => s.put(item('one'))),
    store.transaction('readwrite', (s) => s.put(item('two'))),
  ]);
  f.setWriteFailure(true);
  await assert.rejects(store.transaction('readwrite', (s) => s.put(item('three'))));
  f.setWriteFailure(false);
  await store.transaction('readwrite', (s) => s.put(item('four')));
  assert.deepEqual(
    (await store.transaction('readonly', (s) => s.getAll())).map((i) => i.id),
    ['one', 'two', 'four'],
  );
});
test('missing or corrupt storage fails without clearing its manifest', async () => {
  const f = fixture(),
    store = createNativeWardrobe(f.deps);
  await store.open();
  await store.transaction('readwrite', (s) => s.put(item('one')));
  f.files.clear();
  await assert.rejects(createNativeWardrobe(f.deps).open(), /Missing file/);
  assert.equal(Object.keys((await f.deps.readManifest()).records).length, 1);
});
test('mutating returned records does not change storage', async () => {
  const f = fixture(),
    store = createNativeWardrobe(f.deps);
  await store.open();
  await store.transaction('readwrite', (s) => s.put(item('one')));
  const result = await store.transaction('readonly', (s) => s.getAll());
  result[0].name = 'Changed without save';
  assert.equal((await store.transaction('readonly', (s) => s.getAll()))[0].name, 'one');
  await assert.rejects(
    store.transaction('readonly', (s) => s.delete('one')),
    /Read-only/,
  );
});
