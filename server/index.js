import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';

// The IP salt protects the hashed IPs stored for abuse control. Never run public with the default.
if (process.env.NODE_ENV === 'production' && !process.env.IP_SALT) {
  console.error('Refusing to start: set IP_SALT (a long random string) when NODE_ENV=production.');
  process.exit(1);
}

const { server, close } = createApp();
server.listen(port, host, () => console.log(`mass-poll listening on http://${host}:${port}`));

// Let systemd stop us cleanly: finish open requests, then close the database.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    console.log(`${signal} received, shutting down`);
    setTimeout(() => process.exit(1), 10_000).unref();
    await close();
    process.exit(0);
  });
}
