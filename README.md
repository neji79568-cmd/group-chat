# Групповой чат

React + TypeScript, Vinext/Vite. Реальные API и WebSocket, без собственного сервера авторизации.

## GitHub Pages

Ссылка для запуска: https://neji79568-cmd.github.io/group-chat/

Workflow `.github/workflows/pages.yml` проверяет TypeScript, собирает статическую версию и публикует её при каждом push в `main`.

```powershell
npm.cmd ci
# Локальная разработка версии для Pages
npm.cmd run dev:pages
# Статическая сборка в dist-pages
npm.cmd run build:pages
# Просмотр собранной версии
npm.cmd run preview:pages
```

Откройте показанный терминалом адрес с путём `/group-chat/`. Версия для Pages использует те же компоненты и API, что и приложение Sites.

## Запуск

Требуется Node.js 22.13+.

```powershell
npm.cmd ci
npm.cmd run dev
```

Откройте адрес, показанный в терминале (обычно http://localhost:5173).

```powershell
# Проверка типов
node node_modules/typescript/bin/tsc --noEmit
# Сборка
npm.cmd run build
# Запуск собранного приложения
npm.cmd start
```

## Возможности

- Регистрация, вход, выход.
- JWT access хранится только в памяти. Refresh сервер хранит в HttpOnly cookie.
- Восстановление входа при перезагрузке вкладки и обновление истекающего access.
- Первое сообщение WebSocket — AUTH с access. Отправка доступна только после AUTH_SUCCESS.
- Общие сообщения NEW_MESSAGE с отправителем и временем; без локальных дублей.
- При выходе закрывается WebSocket, очищаются сообщения и access, вызывается серверный logout.
- Ручное переподключение после разрыва, ошибки API и соединения, адаптивный интерфейс.
- Enter отправляет сообщение, Shift+Enter добавляет строку. Лимит клиента: 2000 символов.

## Backend

Swagger: https://inai-col3.fishrungames.com/api/docs/

- POST /api/register/ и /api/login/: JSON с username и password.
- POST /api/token/refresh/: без тела, refresh из cookie.
- POST /api/logout/: без тела, удаляет refresh cookie.
- Auth-запросы используют credentials: include.
- WebSocket: wss://inai-col3.fishrungames.com/chat/

Браузер должен разрешать cookie этого backend для восстановления входа и обновления JWT. Если cookie заблокированы, приложение попросит войти снова. Пароль и JWT не записываются в localStorage/sessionStorage. В sessionStorage находится только флаг состояния входа.

Backend не предоставляет историю сообщений: отображаются сообщения, полученные за время текущего подключения. При перезагрузке или выходе список очищается. При разрыве соединения сообщения могут быть пропущены; автоматической повторной отправки нет.

## Основные файлы

- app/page.tsx — формы, чат и интерфейс.
- app/use-chat.ts — авторизация, JWT, жизненный цикл WebSocket.
- app/globals.css — стили.
