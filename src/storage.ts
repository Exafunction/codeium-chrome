// Define your storage data here
export interface Storage {
  user?: {
    apiKey?: string;
    name?: string;
  };
  settings: Record<string, unknown>;
  lastError?: {
    message?: string;
  };
  // regexes of domains to watch
  allowList: string[];
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
  const currentStorageData = await getStorageData();
  const newStorageData = Object.assign({}, defaults, currentStorageData);
  await setStorageData(newStorageData);
}

// default allowlist
export const defaultAllowList = [
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
].map((reg) => reg.source);
