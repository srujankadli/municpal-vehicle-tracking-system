import { buildApp } from './app.js';
import { config } from './config/index.js';
import { runMigrations } from './db/migrate.js';
import { closeDatabase } from './db/connection.js';

async function startServer() {
  try {
    console.log('[STARTUP] Checking database schema migrations...');
    runMigrations();

    const app = buildApp();
    await app.listen({ port: config.PORT, host: config.HOST });

    console.log(`[STARTUP] Municipal Waste Monitoring Backend active on http://${config.HOST}:${config.PORT}`);
    console.log(`[STARTUP] Environment: ${config.NODE_ENV} | Data Classification: SIMULATED_DEMO_DATA`);

    const shutdown = async () => {
      console.log('[SHUTDOWN] Terminating server gracefully...');
      await app.close();
      closeDatabase();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('[FATAL] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
