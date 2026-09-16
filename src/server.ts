import { openDatabase } from './db/database.ts';
import { createApp } from './app.ts';
import { ensureAdminUser } from './services/auth.ts';
const db = openDatabase(process.env.DB_PATH);
ensureAdminUser(db, process.env.DEMO_ADMIN_EMAIL, process.env.DEMO_ADMIN_PASSWORD);
const app = createApp(db, {
  readOnly: process.env.DEMO_READ_ONLY !== 'false',
  adminToken: process.env.ADMIN_TOKEN ?? '',
  origins: (
    process.env.ALLOWED_ORIGINS ??
    'http://localhost:8080,http://127.0.0.1:8080,http://localhost:8081,http://127.0.0.1:8081'
  ).split(','),
});
// Render and outros provedores precisam que o servidor escute em todas as interfaces.
const host = process.env.HOST ?? '0.0.0.0',
  port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, host, () =>
  console.log(`Conecta API: http://${host}:${port} | dados simulados`),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
