import { v4 as uuidv4 } from 'uuid';

import { registerUser } from './auth';
import {
  GetCompletionsResponseMessage,
  LanguageServerServiceWorkerClient,
  LanguageServerWorkerRequest,
} from './common';
import { loggedIn, loggedOut, unhealthy } from './shared';
import { getStorageItem, initializeStorageWithDefaults, setStorageItem } from './storage';
import {
  AcceptCompletionRequest,
  GetCompletionsRequest,
} from '../proto/exa/language_server_pb/language_server_pb';

const authStates: string[] = [];

const initWhiteListRegs = [
  /https:\/\/colab.research\.google\.com\/.*/,
  /https:\/\/(.*\.)?stackblitz\.com\/.*/,
  /https:\/\/(.*\.)?deepnote\.com\/.*/,
  /https:\/\/(.*\.)?(databricks\.com|azuredatabricks\.net)\/.*/,
  /https:\/\/(.*\.)?quadratichq\.com\/.*/,
  /https?:\/\/(.*\.)?jsfiddle\.net(\/.*)?/,
  /https:\/\/(.*\.)?codepen\.io(\/.*)?/,
  /https:\/\/(.*\.)?codeshare\.io(\/.*)?/,
  /https:\/\/console\.paperspace\.com\/.*\/notebook\/.*/,
  /https?:\/\/www\.codewars\.com(\/.*)?/,
  /https:\/\/(.*\.)?github\.com(\/.*)?/,
];
chrome.runtime.onInstalled.addListener(async () => {
  // Here goes everything you want to execute after extension initialization

  await initializeStorageWithDefaults({
    settings: {},
    whitelist: initWhiteListRegs.map((reg) => reg.source),
  });

  console.log('Extension successfully installed!');

  if ((await getStorageItem('user'))?.apiKey === undefined) {
    // TODO(prem): Is this necessary?
    await loggedOut();
    // Inline the code for openAuthTab() because we can't invoke sendMessage.
    const uuid = uuidv4();
    authStates.push(uuid);
    await chrome.tabs.create({
      url: `https://www.codeium.com/profile?redirect_uri=chrome-extension://${chrome.runtime.id}&state=${uuid}`,
    });
  } else {
    await loggedIn();
  }
});

// The only external messages:
//  - website auth
//  - request for api key
//  - set icon and error message
chrome.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
  if (message.type === 'user') {
    const user = await getStorageItem('user');
    sendResponse(user);
    if (user?.apiKey === undefined) {
      await loggedOut();
    }
    return;
  }
  if (message.type === 'whitelist') {
    const whitelist = await getStorageItem('whitelist');
    sendResponse(whitelist);
    return;
  }
  if (message.type == 'error') {
    await unhealthy(message.message);
    return;
  }
  if (message.type == 'success') {
    await loggedIn();
    return;
  }
  if (typeof message.token !== 'string' || typeof message.state !== 'string') {
    console.log('Unexpected message:', message);
    return;
  }
  const typedMessage = message as { token: string; state: string };
  const stateIndex = authStates.indexOf(typedMessage.state);
  if (stateIndex === -1) {
    console.log('Unexpected state:', typedMessage.state);
    return;
  }
  authStates.splice(stateIndex, 1);
  console.log('Obtained token');
  await login(typedMessage.token);
});

chrome.runtime.onStartup.addListener(async () => {
  if ((await getStorageItem('user'))?.apiKey === undefined) {
    await loggedOut();
  } else {
    await loggedIn();
  }
});

chrome.runtime.onMessage.addListener(async (message) => {
  // TODO(prem): Strongly type this.
  if (message.type === 'state') {
    const payload = message.payload as { state: string };
    authStates.push(payload.state);
  } else if (message.type === 'manual') {
    await login(message.token);
  } else {
    console.log('Unrecognized message:', message);
  }
});

const clientMap = new Map<string, LanguageServerServiceWorkerClient>();

chrome.runtime.onConnectExternal.addListener((port) => {
  clientMap.set(port.name, new LanguageServerServiceWorkerClient(port.name));
  port.onDisconnect.addListener((port) => {
    clientMap.delete(port.name);
  });
  port.onMessage.addListener(async (message: LanguageServerWorkerRequest, port) => {
    const client = clientMap.get(port.name);
    if (message.kind === 'getCompletions') {
      const response = await client?.getCompletions(
        GetCompletionsRequest.fromJsonString(message.request)
      );
      const reply: GetCompletionsResponseMessage = {
        kind: 'getCompletions',
        requestId: message.requestId,
        response: response?.toJsonString(),
      };
      port.postMessage(reply);
    } else if (message.kind == 'acceptCompletion') {
      await client?.acceptedLastCompletion(AcceptCompletionRequest.fromJsonString(message.request));
    } else {
      console.log('Unrecognized message:', message);
    }
  });
});

async function login(token: string) {
  try {
    const user = await registerUser(token);
    await setStorageItem('user', { apiKey: user.api_key, name: user.name });
    await loggedIn();
    // TODO(prem): Open popup.
    // https://github.com/GoogleChrome/developer.chrome.com/issues/2602
    // await chrome.action.openPopup();
  } catch (error) {
    console.log(error);
  }
}
