"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChat } from "./use-chat";

const connectionLabels = {
  restoring: "Восстановление входа…",
  "signed-out": "Вход не выполнен",
  connecting: "Подключение…",
  connected: "Подключено",
  disconnected: "Нет соединения",
};

export default function Home() {
  const chat = useChat();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const signedIn = ["connecting", "connected", "disconnected"].includes(chat.status);
  const ready = chat.status === "connected";
  const authDisabled = chat.busy || chat.status === "restoring";

  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [chat.messages]);
  useEffect(() => { if (!signedIn) setText(""); }, [signedIn]);
  useEffect(() => { if (ready) composer.current?.focus(); }, [ready]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    if (await chat.authenticate(mode, loginName.trim(), password)) setPassword("");
  }

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (chat.send(text)) {
      setText("");
      composer.current?.focus();
    }
  }

  function changeMode(next: "login" | "register") {
    setMode(next);
    setPassword("");
    chat.clearFeedback();
  }

  return (
    <main>
      <h1>Групповой чат</h1>
      {chat.error && <p className="error" role="alert">{chat.error}</p>}
      {chat.notice && <p role="status">{chat.notice}</p>}

      {!signedIn ? (
        <section className="auth" aria-label="Вход в чат">
          <div className="auth-tabs">
            <button type="button" aria-pressed={mode === "login"} disabled={authDisabled} onClick={() => changeMode("login")}>Вход</button>
            <button type="button" aria-pressed={mode === "register"} disabled={authDisabled} onClick={() => changeMode("register")}>Регистрация</button>
          </div>
          <form className="auth-form" onSubmit={submitAuth}>
            <label htmlFor="username">Имя пользователя</label>
            <input id="username" name="username" autoComplete="username" required maxLength={150} value={loginName} onChange={(event) => setLoginName(event.target.value)} disabled={authDisabled} />
            <label htmlFor="password">Пароль</label>
            <input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 6 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} disabled={authDisabled} />
            <button type="submit" disabled={authDisabled || !loginName.trim() || !password}>
              {chat.status === "restoring" ? connectionLabels.restoring : chat.busy ? "Подождите…" : mode === "login" ? "Войти" : "Зарегистрироваться"}
            </button>
          </form>
        </section>
      ) : (
        <section aria-label="Общий чат">
          <div className="chat-header">
            <span className="username">{chat.username}</span>
            <button type="button" onClick={() => { setPassword(""); void chat.logout(); }} disabled={chat.busy}>Выйти</button>
          </div>
          <p role="status">{connectionLabels[chat.status]}</p>
          {chat.status === "disconnected" && <p><button type="button" onClick={chat.reconnect} disabled={chat.busy}>Подключиться снова</button></p>}

          <div className="messages" role="log" aria-label="Сообщения общего чата" aria-live="polite" aria-relevant="additions">
            {chat.messages.length === 0 && <p className="muted">Сообщений пока нет.</p>}
            {chat.messages.map((message) => (
              <article className="message" key={message.id}>
                <strong>{message.sender}</strong>{" "}
                <time dateTime={new Date(message.timestamp).toISOString()} title={new Date(message.timestamp).toLocaleString("ru-RU")}>
                  {new Date(message.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                </time>
                <p>{message.text}</p>
              </article>
            ))}
            <div ref={bottom} />
          </div>

          <form className="composer" onSubmit={sendMessage}>
            <label htmlFor="message">Сообщение</label>
            <textarea id="message" ref={composer} value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} rows={2} disabled={!ready} onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                sendMessage();
              }
            }} />
            <button type="submit" disabled={!ready || !text.trim()}>Отправить</button>
          </form>
        </section>
      )}
    </main>
  );
}
