// Thin localStorage wrapper. Falls back to memory when storage is unavailable (private mode etc.).
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}
function remove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    memory.delete(key);
  }
}

const TOKEN_KEY = 'cashmine.token';
const ATTEMPT_KEY = 'cashmine.claimAttempt';
const GATE_KEY = 'cashmine.syncGate';

export const loadToken = () => read(TOKEN_KEY);
export const saveToken = (t: string) => write(TOKEN_KEY, t);
export const clearToken = () => remove(TOKEN_KEY);

export function loadJson<T>(): T | null {
  const raw = read(ATTEMPT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
export const saveJson = (v: unknown) => write(ATTEMPT_KEY, JSON.stringify(v));
export const clearJson = () => remove(ATTEMPT_KEY);

export function loadGate<T>(): T | null {
  const raw = read(GATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
export const saveGate = (v: unknown) => write(GATE_KEY, JSON.stringify(v));

/** Non-reversible-enough tag so a stored claim attempt is only resumed with the token that created it. */
export function tokenTag(token: string): string {
  let h = 5381;
  for (let i = 0; i < token.length; i++) h = ((h << 5) + h + token.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
