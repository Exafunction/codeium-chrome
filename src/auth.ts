import { v4 as uuidv4 } from 'uuid';

export const PROFILE_URL = 'https://www.codeium.com/profile';

export async function openAuthTab(): Promise<void> {
  const uuid = uuidv4();
  await chrome.runtime.sendMessage({
    type: 'state',
    payload: {
      state: uuid,
    },
  });
  await chrome.tabs.create({
    url: `${PROFILE_URL}?redirect_uri=chrome-extension://${chrome.runtime.id}&state=${uuid}`,
  });
}

export async function registerUser(token: string): Promise<{ api_key: string; name: string }> {
  const url = new URL('register_user/', 'https://api.codeium.com');
  const response = await fetch(url, {
    body: JSON.stringify({ firebase_id_token: token }),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  const user = await response.json();
  return user as { api_key: string; name: string };
}
