import http from 'http';
import app from './app.js';
import connectDB from './config/db.js';
import env from './config/env.js';
import initSocket from './socket/index.js';

const start = async () => {
  try {
    await connectDB();

    const server = http.createServer(app);
    initSocket(server);

    server.listen(env.port, () => {
      console.log(`Brilliance API listening on port ${env.port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
};

start();
