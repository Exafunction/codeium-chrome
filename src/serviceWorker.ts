import { v4 as uuidv4 } from 'uuid';

import { registerUser } from './auth';
import {
  GetCompletionsResponseMessage,
  JupyterLabKeyBindings,
  JupyterNotebookKeyBindings,
  KeyCombination,
  LanguageServerServiceWorkerClient,
  LanguageServerWorkerRequest,
} from './common';
import { loggedIn, loggedOut, unhealthy } from './shared';
import {
  computeAllowlist,
  defaultAllowlist,
  getGeneralPortalUrl,
  getStorageItem,
  getStorageItems,
  initializeStorageWithDefaults,
  setStorageItem,
} from './storage';
import { PUBLIC_API_SERVER, PUBLIC_WEBSITE } from './urls';
import {
  AcceptCompletionRequest,
  GetCompletionsRequest,
} from '../proto/exa/language_server_pb/language_server_pb';

const authStates: string[] = [];

chrome.runtime.onInstalled.addListener(async () => {
  // Here goes everything you want to execute after extension initialization

  await initializeStorageWithDefaults({
    settings: {},
    allowlist: { defaults: defaultAllowlist, current: defaultAllowlist },
  });

  console.log('Extension successfully installed!');

  if ((await getStorageItem('user'))?.apiKey === undefined) {
    // TODO(prem): Is this necessary?
    await loggedOut();
    // Inline the code for openAuthTab() because we can't invoke sendMessage.
    const uuid = uuidv4();
    authStates.push(uuid);
    // TODO(prem): Deduplicate with Options.tsx/storage.ts.
    const portalUrl = await (async (): Promise<string | undefined> => {
      const url = await getGeneralPortalUrl();
      if (url === undefined) {
        if (CODEIUM_ENTERPRISE) {
          return undefined;
        }
        return PUBLIC_WEBSITE;
      }
      return url;
    })();
    if (portalUrl !== undefined) {
      await chrome.tabs.create({
        url: `${portalUrl}/profile?redirect_uri=chrome-extension://${chrome.runtime.id}&state=${uuid}`,
      });
    }
  } else {
    await loggedIn();
  }
});

const parseKeyCombination = (key: string): KeyCombination => {
  const parts = key.split('+').map((k) => k.trim());
  return {
    key: parts[parts.length - 1],
    ctrl: parts.includes('Ctrl'),
    alt: parts.includes('Alt'),
    shift: parts.includes('Shift'),
    meta: parts.includes('Meta'),
  };
};

// The only external messages:
//  - website auth
//  - request for api key
//  - set icon and error message
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'jupyter_notebook_allowed_and_keybindings') {
    (async () => {
      // If not allowed, the keybindings can be undefined.
      let allowed = false;
      const defaultKeyBindings: JupyterNotebookKeyBindings = {
        accept: { key: 'Tab', ctrl: false, alt: false, shift: false, meta: false },
      };
      if (sender.url === undefined) {
        sendResponse({ allowed: false, keyBindings: defaultKeyBindings });
        return;
      }
      const { allowlist: allowlist, jupyterNotebookKeybindingAccept: accept } =
        await getStorageItems(['allowlist', 'jupyterNotebookKeybindingAccept']);
      for (const addr of computeAllowlist(allowlist)) {
        const host = new RegExp(addr);
        if (host.test(sender.url)) {
          allowed = true;
          break;
        }
      }

      sendResponse({
        allowed,
        keyBindings: {
          accept: accept ? parseKeyCombination(accept) : defaultKeyBindings,
        },
      });
    })().catch((e) => {
      console.error(e);
    });
    return true;
  }
  if (message.type === 'jupyterlab') {
    (async () => {
      const { jupyterlabKeybindingAccept: accept, jupyterlabKeybindingDismiss: dismiss } =
        await getStorageItems(['jupyterlabKeybindingAccept', 'jupyterlabKeybindingDismiss']);

      const keybindings: JupyterLabKeyBindings = {
        accept: accept
          ? parseKeyCombination(accept)
          : { key: 'Tab', ctrl: false, alt: false, shift: false, meta: false },
        dismiss: dismiss
          ? parseKeyCombination(dismiss)
          : { key: 'Escape', ctrl: false, alt: false, shift: false, meta: false },
      };
      sendResponse(keybindings);
    })().catch((e) => {
      console.error(e);
    });
    return true;
  }
  if (message.type === 'debounce_ms') {
    (async () => {
      const { jupyterDebounceMs: jupyterDebounceMs } = await getStorageItems(['jupyterDebounceMs']);
      sendResponse({ debounceMs: jupyterDebounceMs ? jupyterDebounceMs : 0 });
    })().catch((e) => {
      console.error(e);
    });
    return true;
  }
  if (message.type == 'error') {
    unhealthy(message.message).catch((e) => {
      console.error(e);
    });
    // No response needed.
    return;
  }
  if (message.type == 'success') {
    loggedIn().catch((e) => {
      console.error(e);
    });
    // No response needed.
    return;
  }
  if (typeof message.token !== 'string' || typeof message.state !== 'string') {
    console.log('Unexpected message:', message);
    return;
  }
  (async () => {
    const typedMessage = message as { token: string; state: string };
    const user = await getStorageItem('user');
    if (user?.apiKey === undefined) {
      await login(typedMessage.token);
    }
  })().catch((e) => {
    console.error(e);
  });
});

chrome.runtime.onStartup.addListener(async () => {
  if ((await getStorageItem('user'))?.apiKey === undefined) {
    await loggedOut();
  } else {
    await loggedIn();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  // TODO(prem): Strongly type this.
  if (message.type === 'state') {
    const payload = message.payload as { state: string };
    authStates.push(payload.state);
  } else if (message.type === 'manual') {
    login(message.token).catch((e) => {
      console.error(e);
    });
  } else {
    console.log('Unrecognized message:', message);
  }
});

const clientMap = new Map<string, LanguageServerServiceWorkerClient>();

// TODO(prem): Is it safe to make this listener async to simplify the LanguageServerServiceWorkerClient constructor?
chrome.runtime.onConnectExternal.addListener((port) => {
  // TODO(prem): Technically this URL isn't synchronized with the user/API key.
  clientMap.set(
    port.name,
    new LanguageServerServiceWorkerClient(getLanguageServerUrl(), port.name)
  );
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
    const portalUrl = await getGeneralPortalUrl();
    const user = await registerUser(token);
    await setStorageItem('user', {
      apiKey: user.api_key,
      name: user.name,
      userPortalUrl: portalUrl,
    });
    await loggedIn();
    // TODO(prem): Open popup.
    // https://github.com/GoogleChrome/developer.chrome.com/issues/2602
    // await chrome.action.openPopup();
  } catch (error) {
    console.log(error);
  }
}

async function getLanguageServerUrl(): Promise<string | undefined> {
  const user = await getStorageItem('user');
  const userPortalUrl = user?.userPortalUrl;
  if (userPortalUrl === undefined || userPortalUrl === '') {
    if (CODEIUM_ENTERPRISE) {
      return undefined;
    }
    return PUBLIC_API_SERVER;
  }
  return `${userPortalUrl}/_route/language_server`;
}
