import '../styles/popup.scss';
import { openAuthTab } from './auth';
import { loggedOut } from './shared';
import { getStorageItem, setStorageItem } from './storage';

document.getElementById('login')?.addEventListener('click', openAuthTab);

document.getElementById('go-to-options')?.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/?options=' + chrome.runtime.id });
});

getStorageItem('user')
  .then((user) => {
    const usernameP = document.getElementById('username');
    if (usernameP !== null && user !== undefined) {
      usernameP.textContent = `Welcome, ${user.name}`;
      if (user.userPortalUrl !== undefined && user.userPortalUrl !== '') {
        const br = document.createElement('br');
        usernameP.appendChild(br);
        const a = document.createElement('a');
        const linkText = document.createTextNode('Portal');
        a.appendChild(linkText);
        a.title = 'Portal';
        a.href = user.userPortalUrl;
        a.addEventListener('click', () => {
          chrome.tabs.create({ url: user.userPortalUrl });
        });
        usernameP.appendChild(a);
      }
    }
  })
  .catch((error) => {
    console.error(error);
  });

document.getElementById('logout')?.addEventListener('click', async () => {
  await setStorageItem('user', {});
  await loggedOut();
  window.close();
});

getStorageItem('lastError').then((lastError) => {
  const errorP = document.getElementById('error');
  if (errorP == null) {
    return;
  }
  const message = lastError?.message;
  if (message === undefined) {
    errorP.remove();
  } else {
    errorP.textContent = message;
  }
});
