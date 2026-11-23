import {defineConfig, loadEnv} from 'vite';
import {api, closeDatabase} from './src/server/api.js';

export default defineConfig(({mode}) => {
  process.env.DATABASE_URL ??= loadEnv(mode, process.cwd(), 'DATABASE_URL').DATABASE_URL;
  const mountApi = server => {
    server.middlewares.use(api);
    server.httpServer?.once('close', () => {
      closeDatabase().catch(error => console.error('Falha ao encerrar PostgreSQL:', error.message));
    });
  };
  return {
    base: './',
    server:{host:'127.0.0.1'},
    preview:{host:'127.0.0.1'},
    plugins:[{
      name:'machine-airsoft-api',
      configureServer: mountApi,
      configurePreviewServer: mountApi
    }]
  };
});
