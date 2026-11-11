import { useCallback, useEffect, useRef, useState } from 'react';

const API = 'https://inai-col3.fishrungames.com/api';
const CHAT = 'wss://inai-col3.fishrungames.com/chat/';
const SESSION_KEY = 'group-chat-session';

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

export type ChatStatus =
  | 'restoring'
  | 'signed-out'
  | 'connecting'
  | 'connected'
  | 'disconnected';

type AuthMode = 'login' | 'register';
type State = {
  username: string | null;
  messages: ChatMessage[];
  status: ChatStatus;
  busy: boolean;
  error: string;
  notice: string;
};
type Actions = {
  authenticate: (mode: AuthMode, username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  send: (text: string) => boolean;
  reconnect: () => void;
  clearFeedback: () => void;
};

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeError(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(describeError).filter(Boolean).join(' ');
  if (isObject(value)) {
    return Object.entries(value)
      .map(([key, item]) => {
        const label = key === 'username' ? 'Имя' : key === 'password' ? 'Пароль' : '';
        return `${label ? `${label}: ` : ''}${describeError(item)}`;
      })
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function readMarker(): string | null {
  try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
}

function writeMarker(value: 'active' | 'signed-out') {
  try { sessionStorage.setItem(SESSION_KEY, value); } catch { /* Storage is optional. */ }
}

function expiresAt(token: string): number | null {
  try {
    const payload: unknown = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return isObject(payload) && typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch { return null; }
}

function accessFrom(value: unknown): string {
  if (!isObject(value) || typeof value.access !== 'string' || !value.access) {
    throw new Error('Сервер не вернул access-токен. Попробуйте войти ещё раз.');
  }
  return value.access;
}

const initialState: State = {
  username: null,
  messages: [],
  status: 'restoring',
  busy: true,
  error: '',
  notice: '',
};

export function useChat() {
  const [state, setState] = useState<State>(initialState);
  const actions = useRef<Actions | null>(null);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let access: string | null = null;
    let socket: WebSocket | null = null;
    let authenticated = false;
    let authBusy = false;
    let sequence = 0;
    let authTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshInFlight: Promise<boolean> | null = null;
    const requests = new Set<AbortController>();

    const current = (version: number) => !disposed && generation === version;
    const patch = (next: Partial<State>) => {
      if (!disposed) setState(previous => ({ ...previous, ...next }));
    };

    async function request(path: string, body?: Record<string, string>): Promise<unknown> {
      const controller = new AbortController();
      requests.add(controller);
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetch(`${API}${path}`, {
          method: 'POST',
          credentials: 'include',
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        const text = await response.text();
        let data: unknown;
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        if (!response.ok) {
          throw new ApiError(describeError(data) || `Ошибка сервера (${response.status}).`, response.status);
        }
        return data;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (controller.signal.aborted) throw new Error('Сервер не ответил вовремя. Попробуйте ещё раз.');
        throw new Error('Не удалось связаться с сервером. Проверьте подключение к интернету.');
      } finally {
        clearTimeout(timeout);
        requests.delete(controller);
      }
    }

    function closeSocket() {
      clearTimeout(authTimer);
      authenticated = false;
      if (!socket) return;
      const previous = socket;
      socket = null;
      previous.onopen = previous.onmessage = previous.onerror = previous.onclose = null;
      try { previous.close(1000, 'Session changed'); } catch { /* Already closed. */ }
    }

    function invalidate() {
      generation += 1;
      clearTimeout(refreshTimer);
      closeSocket();
      for (const controller of requests) controller.abort();
      requests.clear();
      refreshInFlight = null;
      return generation;
    }

    function endSession(error: string) {
      invalidate();
      access = null;
      authBusy = false;
      writeMarker('signed-out');
      patch({ username: null, messages: [], status: 'signed-out', busy: false, error, notice: '' });
    }

    function scheduleRefresh(version: number) {
      clearTimeout(refreshTimer);
      const expiry = access ? expiresAt(access) : null;
      if (expiry === null) return;
      const delay = Math.max(1_000, Math.min(expiry - Date.now() - 30_000, 2_147_483_647));
      refreshTimer = setTimeout(() => {
        if (current(version)) void renew(version);
      }, delay);
    }

    function connect(token: string, version: number, allowAuthRefresh: boolean) {
      if (!current(version)) return;
      closeSocket();
      patch({ status: 'connecting', error: '' });
      let ws: WebSocket;
      try { ws = new WebSocket(CHAT); } catch {
        patch({ status: 'disconnected', error: 'Не удалось открыть соединение с чатом.' });
        return;
      }
      socket = ws;
      const isCurrentSocket = () => current(version) && socket === ws;
      authTimer = setTimeout(() => {
        if (!isCurrentSocket()) return;
        clearTimeout(refreshTimer);
        closeSocket();
        patch({ status: 'disconnected', error: 'Чат не подтвердил вход за 10 секунд. Попробуйте подключиться снова.' });
      }, 10_000);

      ws.onopen = () => {
        if (!isCurrentSocket()) return;
        try {
          ws.send(JSON.stringify({ type: 'AUTH', payload: { token } }));
        } catch {
          closeSocket();
          patch({ status: 'disconnected', error: 'Не удалось авторизоваться в чате. Подключитесь снова.' });
        }
      };
      ws.onmessage = event => {
        if (!isCurrentSocket() || typeof event.data !== 'string') return;
        let data: unknown;
        try { data = JSON.parse(event.data); } catch { return; }
        if (!isObject(data) || !isObject(data.payload)) return;
        const payload = data.payload;
        if (data.type === 'AUTH_SUCCESS' && typeof payload.username === 'string' && payload.username) {
          clearTimeout(authTimer);
          authenticated = true;
          scheduleRefresh(version);
          patch({ username: payload.username, status: 'connected', error: '', notice: '' });
        } else if (
          data.type === 'NEW_MESSAGE' && authenticated &&
          typeof payload.sender === 'string' && typeof payload.text === 'string' &&
          typeof payload.timestamp === 'number' && Number.isFinite(payload.timestamp) &&
          !Number.isNaN(new Date(payload.timestamp).getTime())
        ) {
          const message: ChatMessage = {
            id: `${version}-${++sequence}`,
            sender: payload.sender,
            text: payload.text,
            timestamp: payload.timestamp,
          };
          setState(previous => ({ ...previous, messages: [...previous.messages, message] }));
        }
      };
      ws.onerror = () => {
        if (!isCurrentSocket()) return;
        authenticated = false;
        patch({ status: 'disconnected', error: 'Соединение с чатом прервано. Попробуйте подключиться снова.' });
      };
      ws.onclose = event => {
        if (!isCurrentSocket()) return;
        clearTimeout(authTimer);
        socket = null;
        authenticated = false;
        if (event.code === 4003) {
          if (allowAuthRefresh) void renew(version);
          else endSession('Сервер отклонил токен. Войдите снова.');
        } else {
          clearTimeout(refreshTimer);
          patch({ status: 'disconnected', error: 'Соединение с чатом закрыто. Нажмите «Подключиться снова».' });
        }
      };
    }

    async function renew(version: number): Promise<boolean> {
      if (!current(version)) return false;
      if (refreshInFlight) return refreshInFlight;
      closeSocket();
      patch({ status: 'connecting' });
      const attempt = (async () => {
        try {
          const result = await request('/token/refresh/');
          if (!current(version)) return false;
          access = accessFrom(result);
          writeMarker('active');
          scheduleRefresh(version);
          // One refresh is enough: reject a second invalid-token close without looping.
          connect(access, version, false);
          return true;
        } catch (error) {
          if (!current(version)) return false;
          const message = error instanceof ApiError && (error.status === 401 || error.status === 403)
            ? 'Сеанс истёк или браузер заблокировал cookie для входа. Войдите снова.'
            : error instanceof Error ? error.message : 'Не удалось восстановить вход. Войдите снова.';
          endSession(message);
          return false;
        } finally {
          if (current(version)) refreshInFlight = null;
        }
      })();
      refreshInFlight = attempt;
      return attempt;
    }

    const service: Actions = {
      async authenticate(mode, username, password) {
        if (disposed || authBusy) return false;
        const name = username.trim();
        if (!name || !password) {
          patch({ error: 'Введите имя пользователя и пароль.', notice: '' });
          return false;
        }
        if (name.length > 150 || (mode === 'register' && password.length < 6)) {
          patch({ error: name.length > 150 ? 'Имя должно быть не длиннее 150 символов.' : 'Пароль должен содержать не меньше 6 символов.', notice: '' });
          return false;
        }
        const version = invalidate();
        authBusy = true;
        access = null;
        patch({ busy: true, error: '', notice: '', username: null, messages: [], status: 'signed-out' });
        try {
          const result = await request(`/${mode}/`, { username: name, password });
          if (!current(version)) return false;
          access = accessFrom(result);
          writeMarker('active');
          scheduleRefresh(version);
          patch({ notice: mode === 'register' ? 'Аккаунт создан. Подключаемся к чату.' : '' });
          connect(access, version, true);
          return true;
        } catch (error) {
          if (current(version)) {
            patch({ status: 'signed-out', error: error instanceof Error ? error.message : 'Не удалось войти.' });
          }
          return false;
        } finally {
          if (current(version)) {
            authBusy = false;
            patch({ busy: false });
          }
        }
      },
      async logout() {
        if (disposed) return;
        const version = invalidate();
        access = null;
        authBusy = true;
        writeMarker('signed-out');
        patch({ username: null, messages: [], status: 'signed-out', busy: true, error: '', notice: '' });
        try {
          await request('/logout/');
          if (current(version)) patch({ notice: 'Вы вышли из аккаунта.' });
        } catch {
          if (current(version)) {
            patch({ error: 'Вы вышли из чата на этом устройстве, но сервер недоступен. Автоматический вход отключён.' });
          }
        } finally {
          if (current(version)) {
            authBusy = false;
            patch({ busy: false });
          }
        }
      },
      send(value) {
        const text = value.trim();
        if (disposed || !text) return false;
        if (text.length > 2_000) {
          patch({ error: 'Сообщение должно быть не длиннее 2000 символов.' });
          return false;
        }
        if (!access || !authenticated || socket?.readyState !== WebSocket.OPEN) {
          patch({ error: 'Дождитесь подключения к чату.' });
          return false;
        }
        const expiry = expiresAt(access);
        if (expiry !== null && expiry <= Date.now()) {
          void renew(generation);
          patch({ notice: 'Обновляем вход. Отправьте сообщение после подключения.' });
          return false;
        }
        try {
          socket.send(JSON.stringify({ type: 'CHAT_MESSAGE', payload: { text } }));
          patch({ error: '', notice: '' });
          // Display only the server's NEW_MESSAGE, so a send never appears twice.
          return true;
        } catch {
          closeSocket();
          patch({ status: 'disconnected', error: 'Не удалось отправить сообщение. Подключитесь и повторите отправку.' });
          return false;
        }
      },
      reconnect() {
        if (disposed || authBusy || !access) return;
        patch({ error: '', notice: '' });
        const expiry = expiresAt(access);
        if (expiry !== null && expiry - Date.now() <= 30_000) void renew(generation);
        else connect(access, generation, true);
      },
      clearFeedback() { patch({ error: '', notice: '' }); },
    };

    actions.current = service;
    if (readMarker() === 'active') {
      authBusy = true;
      const version = generation;
      void renew(version).finally(() => {
        if (current(version)) {
          authBusy = false;
          patch({ busy: false });
        }
      });
    } else {
      patch({ status: 'signed-out', busy: false });
    }

    return () => {
      disposed = true;
      invalidate();
      access = null;
      if (actions.current === service) actions.current = null;
    };
  }, []);

  const authenticate = useCallback((mode: AuthMode, username: string, password: string) =>
    actions.current?.authenticate(mode, username, password) ?? Promise.resolve(false), []);
  const logout = useCallback(() => actions.current?.logout() ?? Promise.resolve(), []);
  const send = useCallback((text: string) => actions.current?.send(text) ?? false, []);
  const reconnect = useCallback(() => actions.current?.reconnect(), []);
  const clearFeedback = useCallback(() => actions.current?.clearFeedback(), []);

  return { ...state, authenticate, logout, send, reconnect, clearFeedback };
}
