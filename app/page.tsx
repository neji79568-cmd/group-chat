"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChat } from "./use-chat";

const connectionLabels = {
  restoring: "Восстанавливаем вход…",
  "signed-out": "Вход не выполнен",
  connecting: "Подключение…",
  connected: "На связи",
  disconnected: "Нет соединения",
};

function ChatIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M7 10h8M7 14h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

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

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [chat.messages]);
  useEffect(() => { if (!signedIn) setText(""); }, [signedIn]);
  useEffect(() => { if (ready) composer.current?.focus(); }, [ready]);

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    if (await chat.authenticate(mode, loginName.trim(), password)) setPassword("");
  }

  function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    if (chat.send(text)) { setText(""); composer.current?.focus(); }
  }

  function changeMode(next: "login" | "register") {
    setMode(next); setPassword(""); chat.clearFeedback();
  }

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="./" aria-label="Групповой чат — главная"><span className="brand-icon"><ChatIcon /></span><span>Групповой чат</span></a>
        <span className="topbar-caption">Место для вашей группы</span>
      </header>
      <main className={signedIn ? "chat-main" : "auth-main"}>
        {!signedIn ? (
          <section className="auth-card" aria-labelledby="auth-title">
            <span className="auth-icon"><ChatIcon /></span>
            <h1 id="auth-title">{mode === "login" ? "Рады вас видеть" : "Присоединяйтесь к чату"}</h1>
            <p className="subtitle">{mode === "login" ? "Войдите, чтобы общаться с группой." : "Создайте аккаунт и начните общение."}</p>
            <div className="auth-tabs" aria-label="Способ входа">
              <button type="button" className={mode === "login" ? "active" : ""} aria-pressed={mode === "login"} disabled={chat.busy || chat.status === "restoring"} onClick={() => changeMode("login")}>Вход</button>
              <button type="button" className={mode === "register" ? "active" : ""} aria-pressed={mode === "register"} disabled={chat.busy || chat.status === "restoring"} onClick={() => changeMode("register")}>Регистрация</button>
            </div>
            <form onSubmit={submitAuth} className="auth-form">
              <label htmlFor="username">Имя пользователя</label>
              <input id="username" name="username" autoComplete="username" required maxLength={150} value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="Ваш логин" disabled={chat.busy || chat.status === "restoring"} />
              <label htmlFor="password">Пароль</label>
              <input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 6 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "Не менее 6 символов" : "Ваш пароль"} disabled={chat.busy || chat.status === "restoring"} />
              {chat.error && <p className="feedback error" role="alert">{chat.error}</p>}
              {chat.notice && <p className="feedback notice" role="status">{chat.notice}</p>}
              <button className="primary auth-submit" type="submit" disabled={chat.busy || chat.status === "restoring" || !loginName.trim() || !password}>{chat.status === "restoring" ? "Восстанавливаем вход…" : chat.busy ? "Подождите…" : mode === "login" ? "Войти в чат" : "Создать аккаунт"}</button>
            </form>
            <p className="auth-footnote">Общий чат доступен после авторизации.</p>
          </section>
        ) : (
          <section className="chat-card" aria-labelledby="chat-title">
            <header className="chat-header">
              <div><h1 id="chat-title"><span className="hash" aria-hidden="true">#</span> Общий чат</h1><p className={`connection ${chat.status}`} role="status"><span className="status-dot" />{connectionLabels[chat.status]}</p></div>
              <div className="account"><span className="avatar" aria-hidden="true">{chat.username?.slice(0, 1).toUpperCase() ?? "…"}</span><span className="account-name" title={chat.username ?? ""}>{chat.username ?? "Подключение…"}</span><button className="secondary" type="button" onClick={() => { setPassword(""); void chat.logout(); }} disabled={chat.busy}>Выйти</button></div>
            </header>
            <div className="chat-info">Сообщения видны всем участникам. Здесь отображаются сообщения, полученные во время подключения.</div>
            {(chat.error || chat.notice || chat.status === "disconnected") && <div className="chat-feedback">
              {chat.error && <p className="feedback error" role="alert">{chat.error}</p>}
              {chat.notice && <p className="feedback notice" role="status">{chat.notice}</p>}
              {chat.status === "disconnected" && <button className="secondary" onClick={chat.reconnect} disabled={chat.busy}>Подключиться снова</button>}
            </div>}
            <div className="messages" role="log" aria-label="Сообщения общего чата" aria-live="polite" aria-relevant="additions">
              {chat.messages.length === 0 && <div className="empty-chat"><span className="empty-icon"><ChatIcon /></span><h2>{ready ? "Начните разговор" : "Подключаемся к группе"}</h2><p>{ready ? "Поздоровайтесь — ваше сообщение увидят все участники." : "Сообщения появятся после подключения к чату."}</p></div>}
              {chat.messages.map((message) => (
                <article className={`message ${message.sender === chat.username ? "own" : ""}`} key={message.id}>
                  <div className="message-meta"><strong>{message.sender}</strong><time dateTime={new Date(message.timestamp).toISOString()} title={new Date(message.timestamp).toLocaleString("ru-RU")}>{new Date(message.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</time></div>
                  <p>{message.text}</p>
                </article>
              ))}
              <div ref={bottom} />
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <label className="sr-only" htmlFor="message">Сообщение</label>
              <textarea id="message" ref={composer} value={text} onChange={(event) => setText(event.target.value)} placeholder={ready ? "Напишите сообщение…" : "Дождитесь подключения…"} maxLength={2000} rows={2} disabled={!ready} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); sendMessage(); } }} />
              <button className="primary send-button" type="submit" disabled={!ready || !text.trim()} aria-label="Отправить сообщение"><span>Отправить</span><svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
              <div className="composer-hint"><span>Enter — отправить · Shift + Enter — новая строка</span><span>{text.length}/2000</span></div>
            </form>
          </section>
        )}
      </main>
      <footer className="page-footer">Групповой чат · Общение в реальном времени</footer>
    </div>
  );
}
