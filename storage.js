/* All shared-storage access lives here. Never hardcode deployment URLs or keys. */
(function(root) {
  'use strict';
  const CONFIG = 'relay.connection.v1', NAME = 'relay.reader.v1';
  let config = null, readerName = '';
  try {
    const candidate = JSON.parse(localStorage.getItem(CONFIG) || 'null');
    if (candidate) config = validate(candidate.url, candidate.key);
    readerName = localStorage.getItem(NAME) || '';
  } catch (_) { /* Storage may be unavailable; local trial remains usable. */ }
  function validate(url, key) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'script.google.com' || !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(parsed.pathname) || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw new Error('Google Apps Script /exec HTTPS 주소 필요');
    }
    if (typeof key !== 'string' || !key.trim()) throw new Error('공유키 필요');
    return {url: parsed.href, key};
  }
  async function request(action, fields = {}) {
    if (!config) throw new Error('공유 연결 정보 없음');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(config.url, {
        method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: JSON.stringify({...fields, action, key: config.key}), signal: controller.signal,
        credentials: 'omit', referrerPolicy: 'no-referrer'
      });
      if (!response.ok) throw new Error('서버 응답 오류');
      const result = await response.json();
      if (!result || result.ok !== true) {
        const error = new Error(result?.error?.message || '서버 응답 형식 오류');
        error.code = result?.error?.code; throw error;
      }
      return result.data;
    } finally { clearTimeout(timer); }
  }
  root.RelayStorage = {
    get connected() {return !!config;}, get readerName() {return readerName;},
    acceptLink(location, history) {
      const params = new URLSearchParams(location.hash.slice(1));
      if (!params.has('url') && !params.has('key')) return;
      // Remove credentials even if validation/storage fails. Do not send them to the server.
      history.replaceState(null, '', location.pathname + location.search);
      const next = validate(params.get('url'), params.get('key'));
      try {localStorage.setItem(CONFIG, JSON.stringify(next));}
      catch (_) {throw new Error('이 폰에 연결 정보를 기억할 수 없음. 브라우저 저장 설정 확인');}
      config = next;
    },
    setReaderName(value) {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) throw new Error('이름은 1~80자 입력');
      try {localStorage.setItem(NAME, value.trim());}
      catch (_) {throw new Error('이 폰에 이름을 기억할 수 없음');}
      readerName = value.trim();
    },
    disconnect() {
      try {localStorage.removeItem(CONFIG);}
      catch (_) {throw new Error('연결 정보 삭제 실패. 브라우저 저장 설정 확인');}
      config = null;
    },
    request,
    async load() {
      // A changed text between reads must never attach old audio to new verses.
      for (let attempt = 0; attempt < 2; attempt++) {
        const text = await request('getText');
        const list = await request('listRecordings');
        if (text.revision !== list.revision) continue;
        const starts = text.pageStarts || [0];
        if (!Array.isArray(starts) || !starts.length || starts[0] !== 0 || starts.some((v,i) => !Number.isInteger(v) || v < 0 || (text.verses?.length ? v >= text.verses.length : v !== 0) || (i > 0 && v <= starts[i-1]))) throw new Error('페이지 정보 오류');
        if (typeof text.title !== 'string' || !Array.isArray(text.verses) || !text.verses.every(v=>typeof v === 'string') || !Array.isArray(list.recordings)) throw new Error('서버 응답 형식 오류');
        return {text, recordings: list.recordings};
      }
      throw new Error('본문이 변경됨. 다시 새로고침');
    }
  };
})(globalThis);
