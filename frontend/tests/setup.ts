import '@testing-library/jest-dom';

// Polyfill localStorage para entornos donde no está disponible (Node 26+)
if (typeof localStorage === 'undefined' || localStorage === null) {
  const localStorageMap = new Map<string, string>();
  const localStorageMock = {
    getItem: (key: string) => localStorageMap.get(key) ?? null,
    setItem: (key: string, value: string) => localStorageMap.set(key, String(value)),
    removeItem: (key: string) => localStorageMap.delete(key),
    clear: () => localStorageMap.clear(),
    get length() { return localStorageMap.size; },
    key: (index: number) => Array.from(localStorageMap.keys())[index] ?? null,
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
}
