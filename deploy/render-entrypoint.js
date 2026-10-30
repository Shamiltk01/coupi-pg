import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const port = Number(process.env.PORT || 10000);

const healthServer = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    const socket = net.createConnection({
      host: '127.0.0.1',
      port: Number(process.env.PAYMENT_API_PORT || 6100)
    });

    socket.setTimeout(1500);

    socket.on('connect', () => {
      socket.destroy();
      res.writeHead(200);
      res.end('CouPI is ready');
    });

    socket.on('error', () => {
      res.writeHead(503);
      res.end('CouPI starting');
    });

    socket.on('timeout', () => {
      socket.destroy();
      res.writeHead(503);
      res.end('CouPI starting');
    });

    return;
  }

  res.writeHead(200);
  res.end('CouPI Render service');
});

healthServer.listen(port, '0.0.0.0', () => {
  console.log(`Render health endpoint listening on ${port}`);
});

const app = spawn('node', ['scripts/start.js'], {
  stdio: 'inherit',
  env: process.env
});

function shutdown() {
  app.kill('SIGTERM');
  healthServer.close();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

app.on('exit', code => {
  console.log('CouPI process exited:', code);
  shutdown();
  process.exitCode = code ?? 1;
});