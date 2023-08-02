import '../styles/popup.scss';
import { openAuthTab } from './auth';
import { loggedOut } from './shared';
import { getStorageItem, setStorageItem } from './storage';

if (CODEIUM_ENTERPRISE) {
  const element = document.getElementById('extension-name');
  if (element !== null) {
    element.textContent = 'Codeium Enterprise';
  }
}

document.getElementById('login')?.addEventListener('click', openAuthTab);

async function maybeShowPortalWarning() {
  const portalUrl = await getStorageItem('portalUrl');
  let portalUrlWarningDisplay = 'none';
  let loginButtonDisplay = 'block';
  if (portalUrl === undefined || portalUrl === '') {
    portalUrlWarningDisplay = 'block';
    loginButtonDisplay = 'none';
  }
  const portalUrlWarning = document.getElementById('portal-url-warning');
  if (portalUrlWarning !== null) {
    portalUrlWarning.style.display = portalUrlWarningDisplay;
  }
  const loginButton = document.getElementById('login');
  if (loginButton !== null) {
    loginButton.style.display = loginButtonDisplay;
  }
}
if (CODEIUM_ENTERPRISE) {
  maybeShowPortalWarning().catch((e) => {
    console.error(e);
  });
  setInterval(maybeShowPortalWarning, 1000);
}

document.getElementById('go-to-options')?.addEventListener('click', async () => {
  await chrome.tabs.create({ url: 'chrome://extensions/?options=' + chrome.runtime.id });
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
        a.addEventListener('click', async () => {
          await chrome.tabs.create({ url: user.userPortalUrl });
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

getStorageItem('lastError').then(
  (lastError) => {
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
  },
  (e) => {
    console.error(e);
  }
);
