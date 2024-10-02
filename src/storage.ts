import { ValuesType } from 'utility-types';

import { PUBLIC_WEBSITE } from './urls';

export interface Storage {
  user?: {
    apiKey?: string;
    name?: string;
    userPortalUrl?: string;
  };
  settings: Record<string, unknown>;
  lastError?: {
    message?: string;
  };
  portalUrl?: string;
  // regexes of domains to watch
  allowlist?: {
    // Defaults at the time of saving the setting.
    defaults: string[];
    current: string[];
  };
  enterpriseDefaultModel?: string;
  jupyterlabKeybindingAccept?: string;
  jupyterlabKeybindingDismiss?: string;
  jupyterNotebookKeybindingAccept?: string;
  jupyterNotebookKeybindingDismiss?: string;
  jupyterDebounceMs?: number;
}

// In case the defaults change over time, reconcile the saved setting with the
// new default allowlist.
export function computeAllowlist(
  allowlist:
    | {
        defaults: string[];
        current: string[];
      }
    | undefined
): string[] {
  if (allowlist === undefined) {
    allowlist = {
      defaults: [],
      current: [],
    };
  }
  for (const newDefault of defaultAllowlist) {
    if (!allowlist.defaults.includes(newDefault) && !allowlist.current.includes(newDefault)) {
      allowlist.current.push(newDefault);
    }
  }
  for (const oldDefault of allowlist.defaults) {
    if (!defaultAllowlist.includes(oldDefault) && allowlist.current.includes(oldDefault)) {
      allowlist.current.splice(allowlist.current.indexOf(oldDefault), 1);
    }
  }
  return allowlist.current;
}

export async function populateFromManagedStorage(): Promise<void> {
  const managedStorageItems = chrome.storage.managed.get([
    'codeiumPortalUrl',
    'codeiumEnterpriseDefaultModel',
    'codeiumAllowlist',
  ]);
  void managedStorageItems.then((result) => {
    if (result.portalUrl !== undefined) {
      void setStorageItem('portalUrl', result.codeiumPortalUrl);
    }
    if (result.enterpriseDefaultModel !== undefined) {
      void setStorageItem('enterpriseDefaultModel', result.codeiumEnterpriseDefaultModel);
    }
    if (result.allowlist !== undefined) {
      const lst = result.codeiumAllowlist
        .split('\n')
        .map((x: string) => x.trim())
        .filter((x: string) => x !== '');
      void setStorageItem('allowlist', { defaults: defaultAllowlist, current: lst });
    }
  });
}

export function getStorageData(): Promise<Storage> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(null, (result) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }

      return resolve(result as Storage);
    });
  });
}

export function setStorageData(data: Storage): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(data, () => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }

      return resolve();
    });
  });
}

export function getStorageItem<Key extends keyof Storage>(key: Key): Promise<Storage[Key]> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get([key], (result) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }

      return resolve((result as Storage)[key]);
    });
  });
}

export function getStorageItems<Key extends (keyof Storage)[]>(
  keys: [...Key]
): Promise<Pick<Storage, ValuesType<Key>>> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }

      return resolve(result as Pick<Storage, ValuesType<Key>>);
    });
  });
}

export function setStorageItem<Key extends keyof Storage>(
  key: Key,
  value: Storage[Key]
): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }

      return resolve();
    });
  });
}

export async function initializeStorageWithDefaults(defaults: Storage) {
  if (CODEIUM_ENTERPRISE) {
    await populateFromManagedStorage();
  }
  const currentStorageData = await getStorageData();
  const newStorageData = Object.assign({}, defaults, currentStorageData);
  await setStorageData(newStorageData);
}

export async function getGeneralPortalUrl(): Promise<string | undefined> {
  const portalUrl = await getStorageItem('portalUrl');
  if (portalUrl === undefined || portalUrl === '') {
    return undefined;
  }
  try {
    new URL(portalUrl);
  } catch (error) {
    console.log('Invalid portal URL:', portalUrl);
    return undefined;
  }
  return portalUrl;
}

// Note that this gets you the profile URL given the current portal URL, not the
// specific profile URL of the logged in account.
// TODO(prem): Deduplicate with Options.tsx/serviceWorker.ts.
export async function getGeneralProfileUrl(): Promise<string | undefined> {
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
  if (portalUrl === undefined) {
    return undefined;
  }
  return `${portalUrl}/profile`;
}

// default allowlist
export const defaultAllowlist = [
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
  /http:\/\/(localhost|127\.0\.0\.1):[0-9]+\/.*\.ipynb/,
  /https:\/\/(.*\.)?script.google.com(\/.*)?/,
].map((reg) => reg.source);
