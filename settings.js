/* Device preferences only; version choice intentionally does not replace text. */
(function () {
  'use strict';
  const key = 'relay.settings.v1';
  const choices = {theme:['system','light','dark'], font:['system','serif','sans'], version:['1','2','3']};
  const fonts = {
    system:'system-ui, sans-serif',
    serif:'"Noto Serif KR", "Batang", "바탕", serif',
    sans:'"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
  };
  const preferences = {theme:'system',font:'system',version:'1'};
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    for (const name of Object.keys(choices)) if (choices[name].includes(saved?.[name])) preferences[name] = saved[name];
  } catch (_) { /* Invalid/unavailable storage falls back to device defaults. */ }
  const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
  function apply() {
    const root = document.documentElement;
    root.dataset.theme = preferences.theme === 'system' ? (scheme?.matches ? 'dark' : 'light') : preferences.theme;
    root.dataset.textVersion = preferences.version;
    root.style.setProperty('--reading-font', fonts[preferences.font]);
  }
  apply();
  scheme?.addEventListener?.('change', () => { if (preferences.theme === 'system') apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    for (const name of Object.keys(choices)) {
      const buttons = document.querySelectorAll(`[data-${name}-choice]`);
      const update = () => buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset[name + 'Choice'] === preferences[name])));
      buttons.forEach(button => button.addEventListener('click', () => {
        const value = button.dataset[name + 'Choice'];
        if (!choices[name].includes(value)) return;
        preferences[name] = value; apply(); update();
        try { localStorage.setItem(key, JSON.stringify(preferences)); } catch (_) { /* Current session remains usable. */ }
      }));
      update();
    }
  });
})();
