Use Bun, not Node.js.

- `bun <file>` not `node <file>` or `ts-node <file>`
- `bun test` not `jest` or `vitest`
- `bun build <file.html|file.ts|file.css>` not `webpack` or `esbuild`
- `bun install` not `npm install` or `yarn install` or `pnpm install`
- `bun run <script>` not `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- `bunx <package> <command>` not `npx <package> <command>`
- Bun auto-loads .env; don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, routes. Not `express`.
- `bun:sqlite` for SQLite. Not `better-sqlite3`.
- `Bun.redis` for Redis. Not `ioredis`.
- `Bun.sql` for Postgres. Not `pg` or `postgres.js`.
- `WebSocket` built-in. Not `ws`.
- Prefer `Bun.file` over `node:fs` readFile/writeFile
- Bun.$`ls` not execa.

## Testing

Run tests with `bun test`.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

HTML imports with `Bun.serve()`. Not `vite`. Imports support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files import .tsx, .jsx, .js directly. Bun auto-transpiles + bundles. `<link>` tags point to stylesheets; Bun CSS bundler bundles.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Run:

```sh
bun --hot ./index.ts
```

More: `node_modules/bun-types/docs/**.mdx`.
