if (document.contentType === 'text/html') {
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('script.js?') + new URLSearchParams({ id: chrome.runtime.id });
  s.onload = function () {
    (this as HTMLScriptElement).remove();
  };
  (document.head || document.documentElement).prepend(s);
}
