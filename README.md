# Групповой чат

Простой чат на React, TypeScript и Vite: регистрация, вход, сообщения и выход.

Сайт: https://neji79568-cmd.github.io/group-chat/

## Запуск

Нужен Node.js 22.13 или новее.

```powershell
npm.cmd ci
npm.cmd run dev
```

Откройте адрес из терминала.

## Проверка и сборка

```powershell
node node_modules/typescript/bin/tsc --noEmit
npm.cmd run build
```

Обычная сборка сохраняется в `dist`. Для GitHub Pages команда `npm.cmd run build:pages` создаёт `dist-pages` с путём `/group-chat/`. Workflow публикует её после push в `main`.

## Файлы

- `app/main.tsx` — запуск React.
- `app/page.tsx` — формы и сообщения.
- `app/use-chat.ts` — авторизация и WebSocket.
- `app/globals.css` — стили.

Backend: `https://inai-col3.fishrungames.com/api`, WebSocket: `wss://inai-col3.fishrungames.com/chat/`.

Access JWT хранится в памяти, refresh — в HttpOnly cookie сервера. Отправка доступна после подтверждения входа через WebSocket. Истории на сервере нет: сообщения сохраняются только до перезагрузки или выхода.
