import { v4 as uuidv4 } from 'uuid';

import { getGeneralProfileUrl } from './storage';

// Runs in popup.
// TODO(prem): Move to a popup-specific source file.
export async function openAuthTab(): Promise<void> {
  const uuid = uuidv4();
  await chrome.runtime.sendMessage({
    type: 'state',
    payload: {
      state: uuid,
    },
  });
  const profileUrl = await getGeneralProfileUrl();
  if (profileUrl === undefined) {
    return;
  }

  await chrome.tabs.create({
    url: `${profileUrl}?redirect_uri=chrome-extension://${chrome.runtime.id}&state=${uuid}`,
  });
}

// Runs in service worker.
// TODO(prem): Move to a service worker-specific source file.
export async function registerUser(
  token: string,
  portalUrl: string | undefined
): Promise<{ api_key: string; name: string }> {
  const url = ((): URL => {
    if (portalUrl === undefined) {
      if (CODEIUM_ENTERPRISE) {
        throw new Error('portalUrl is undefined');
      }
      return new URL('register_user/', 'https://api.codeium.com');
    }
    return new URL(
      '_route/api_server/exa.seat_management_pb.SeatManagementService/RegisterUser',
      portalUrl
    );
  })();
  const response = await fetch(url, {
    body: JSON.stringify({ firebase_id_token: token }),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`${url}: ${response.statusText}`);
  }
  const user = await response.json();
  return user as { api_key: string; name: string };
}
