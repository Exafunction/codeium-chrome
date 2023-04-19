import { setStorageItem } from './storage';

export async function loggedOut(): Promise<void> {
  await Promise.all([
    chrome.action.setPopup({ popup: 'popup.html' }),
    chrome.action.setBadgeText({ text: 'Login' }),
    chrome.action.setIcon({
      path: {
        16: '/icons/16/codeium_square_inactive.png',
        32: '/icons/32/codeium_square_inactive.png',
        48: '/icons/48/codeium_square_inactive.png',
        128: '/icons/128/codeium_square_inactive.png',
      },
    }),
    chrome.action.setTitle({ title: 'Codeium' }),
    setStorageItem('lastError', {}),
  ]);
}

export async function loggedIn(): Promise<void> {
  await Promise.all([
    chrome.action.setPopup({ popup: 'logged_in_popup.html' }),
    chrome.action.setBadgeText({ text: '' }),
    chrome.action.setIcon({
      path: {
        16: '/icons/16/codeium_square_logo.png',
        32: '/icons/32/codeium_square_logo.png',
        48: '/icons/48/codeium_square_logo.png',
        128: '/icons/128/codeium_square_logo.png',
      },
    }),
    chrome.action.setTitle({ title: 'Codeium' }),
    setStorageItem('lastError', {}),
  ]);
}

export async function unhealthy(message: string): Promise<void> {
  // We don't set the badge text on purpose.
  await Promise.all([
    chrome.action.setPopup({ popup: 'logged_in_popup.html' }),
    chrome.action.setIcon({
      path: {
        16: '/icons/16/codeium_square_error.png',
        32: '/icons/32/codeium_square_error.png',
        48: '/icons/48/codeium_square_error.png',
        128: '/icons/128/codeium_square_error.png',
      },
    }),
    chrome.action.setTitle({ title: `Codeium (error: ${message})` }),
    setStorageItem('lastError', { message: message }),
  ]);
}
