import '../styles/options.scss';
import { v4 as uuidv4 } from 'uuid';

import { PROFILE_URL } from './auth';

document.getElementById('tokenpage')?.addEventListener('click', async () => {
  const params = new URLSearchParams({
    response_type: 'token',
    redirect_uri: 'chrome-show-auth-token',
    scope: 'openid profile email',
    prompt: 'login',
    redirect_parameters_type: 'query',
    state: uuidv4(),
  });
  await chrome.tabs.create({ url: `${PROFILE_URL}?${params}` });
});

document.getElementById('entertoken')?.addEventListener('click', async () => {
  const token = window.prompt('Enter token:');
  if (token === null) {
    return;
  }
  await chrome.runtime.sendMessage({ type: 'manual', token: token });
});
