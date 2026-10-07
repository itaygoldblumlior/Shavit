// Commit a new file manifest only after every changed record is safely written.
// Files referenced by the previous manifest remain usable if a save fails.
export function createNativeWardrobe({readManifest,writeManifest,readFile,writeFile,deleteFile,uuid}) {
  let records = new Map(), paths = {}, queue = Promise.resolve();
  async function open() {
    const manifest = await readManifest();
    if (manifest !== null && (manifest.version !== 1 || !manifest.records || typeof manifest.records !== 'object' || Array.isArray(manifest.records))) throw new Error('Invalid wardrobe storage manifest');
    paths = manifest?.records || {};
    const entries = await Promise.all(Object.entries(paths).map(async ([id,path]) => {
      if (typeof path !== 'string' || !/^shavit\/pieces\/[a-zA-Z0-9-]+\.json$/.test(path)) throw new Error('Invalid clothing file');
      const item = JSON.parse(await readFile(path));
      if (item.id !== id) throw new Error('Clothing file does not match its manifest');
      return [id,item];
    }));
    records = new Map(entries);
  }
  function transaction(mode,action) {
    const operation = queue.then(async () => {
      const draft = new Map(records), changed = new Set();
      const result = action({
        getAll: () => ({result:structuredClone([...draft.values()])}),
        put: item => {if(mode !== 'readwrite')throw new Error('Read-only transaction');draft.set(item.id,structuredClone(item));changed.add(item.id);return {result:item.id};},
        delete: id => {if(mode !== 'readwrite')throw new Error('Read-only transaction');draft.delete(id);changed.add(id);}
      });
      if(mode === 'readwrite' && changed.size) {
        const next = {...paths}, staged = [];
        try {
          for(const id of changed) {
            if(!draft.has(id)){delete next[id];continue;}
            const path = `shavit/pieces/${uuid()}.json`;
            staged.push(path);
            await writeFile(path,JSON.stringify(draft.get(id)));
            next[id] = path;
          }
          await writeManifest({version:1,records:next});
        } catch(error) {
          await Promise.allSettled(staged.map(deleteFile));
          throw error;
        }
        const obsolete = [...changed].map(id=>paths[id]).filter(Boolean);
        records = draft; paths = next;
        await Promise.allSettled(obsolete.map(deleteFile));
      }
      return result?.result;
    });
    queue = operation.catch(()=>{});
    return operation;
  }
  return {open,transaction};
}
