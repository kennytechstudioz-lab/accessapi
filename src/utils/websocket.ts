import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

interface ClientSocket extends WebSocket {
  role?: string;
  username?: string;
  isAlive?: boolean;
}

let wss: WebSocketServer | null = null;
const adminSockets = new Set<ClientSocket>();
const userSockets = new Map<string, ClientSocket>();

export const initWebSocketServer = (server: HttpServer) => {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: ClientSocket) => {
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (messageBuffer) => {
      try {
        const data = JSON.parse(messageBuffer.toString());
        if (data.type === 'REGISTER') {
          if (data.role === 'admin' || data.username === 'Admin') {
            ws.role = 'admin';
            adminSockets.add(ws);
            console.log('Registered Admin WebSocket client.');
          }
          if (data.username) {
            ws.username = data.username;
            userSockets.set(data.username, ws);
            console.log(`Registered User WebSocket client for @${data.username}`);
          }
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    });

    ws.on('close', () => {
      if (ws.role === 'admin') adminSockets.delete(ws);
      if (ws.username) userSockets.delete(ws.username);
    });

    ws.on('error', (err) => {
      console.error('WebSocket connection error:', err);
      if (ws.role === 'admin') adminSockets.delete(ws);
      if (ws.username) userSockets.delete(ws.username);
    });
  });

  // Heartbeat interval to clean up stale connections
  const interval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws: ClientSocket) => {
      if (ws.isAlive === false) {
        if (ws.role === 'admin') adminSockets.delete(ws);
        if (ws.username) userSockets.delete(ws.username);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  console.log('WebSocket server initialized on path /ws');
};

// Broadcast message to all connected admin clients
export const broadcastToAdmins = (payload: any) => {
  const messageStr = JSON.stringify(payload);
  adminSockets.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr);
    }
  });
};

// Send message to specific connected user
export const sendToUser = (username: string, payload: any) => {
  const ws = userSockets.get(username);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
};
