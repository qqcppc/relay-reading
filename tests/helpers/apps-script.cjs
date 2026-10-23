const vm=require('node:vm');
const fs=require('node:fs');
function server() {
  let next = 0;
  const files = new Map();
  const props = { API_KEY: 'test-key', DRIVE_FOLDER_ID: 'folder' };
  const blob = (bytes, mime) => ({ getBytes: () => [...bytes],
    getDataAsString: () => Buffer.from(bytes).toString('utf8'), mime });
  const folder = { createFile(name, content) {
    const id = String(++next);
    const file = { id, trashed: false, data: typeof name === 'string' ? blob(Buffer.from(content)) : name,
      getId: () => id, getUrl: () => 'https://drive.google.com/file/d/' + id + '/view',
      getBlob() { return this.data; }, setContent(s) { this.data = blob(Buffer.from(s)); },
      setSharing() {}, setTrashed(v) { this.trashed = v; } };
    files.set(id, file); return file;
  } };
  const context = vm.createContext({ console, PropertiesService: { getScriptProperties: () => ({
    getProperty: k => props[k], setProperty: (k, v) => { props[k] = v; }
  }) }, DriveApp: { getFolderById: () => folder, getFileById: id => files.get(id),
    Access: { PRIVATE: 'private' }, Permission: { VIEW: 'view' } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { getUuid: () => 'uuid-' + (++next),
      newBlob: (b, mime) => blob(b, mime), base64Decode: s => [...Buffer.from(s, 'base64')],
      base64Encode: b => Buffer.from(b).toString('base64') }, MimeType: { PLAIN_TEXT: 'text/plain' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({
      setMimeType: () => JSON.parse(text)
    }) }
  });
  vm.runInContext(fs.readFileSync(__dirname + '/../../apps-script/Code.gs', 'utf8'), context);
  return { props, files, context, call: data => context.doPost({ postData: {
    contents: JSON.stringify({ key: 'test-key', ...data })
  } }) };
}

module.exports={server};
