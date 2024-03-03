// avoid injecting the script into redundant frames
if (window.top === window.self) {
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('script.js?') + new URLSearchParams({ id: chrome.runtime.id });
  s.onload = function () {
    (this as HTMLScriptElement).remove();
  };
  (document.head || document.documentElement).prepend(s);

  let codeiumEnabled = true;

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'codeium_toggle') {
      codeiumEnabled = !codeiumEnabled;
      window.dispatchEvent(
        new CustomEvent('CodeiumEvent', { detail: { enabled: codeiumEnabled } })
      );
    }
  });
}
