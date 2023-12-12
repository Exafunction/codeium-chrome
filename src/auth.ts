import { createPromiseClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { v4 as uuidv4 } from 'uuid';

import { getGeneralProfileUrl, getStorageItem } from './storage';
import { PUBLIC_API_SERVER } from './urls';
import { SeatManagementService } from '../proto/exa/seat_management_pb/seat_management_connect';

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

async function getApiServerUrl(): Promise<string | undefined> {
  const user = await getStorageItem('user');
  const userPortalUrl = user?.userPortalUrl;
  if (userPortalUrl === undefined || userPortalUrl === '') {
    if (CODEIUM_ENTERPRISE) {
      return undefined;
    }
    return PUBLIC_API_SERVER;
  }
  return `${userPortalUrl}/_route/api_server`;
}

// Runs in service worker.
// TODO(prem): Move to a service worker-specific source file.
export async function registerUser(token: string): Promise<{ api_key: string; name: string }> {
  const apiServerUrl = await getApiServerUrl();
  if (apiServerUrl === undefined) {
    throw new Error('apiServerUrl is undefined');
  }
  const client = createPromiseClient(
    SeatManagementService,
    createConnectTransport({
      baseUrl: apiServerUrl,
      useBinaryFormat: true,
      defaultTimeoutMs: 5000,
    })
  );
  const response = await client.registerUser({
    firebaseIdToken: token,
  });
  return {
    api_key: response.apiKey,
    name: response.name,
  };
}
