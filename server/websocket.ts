import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { Message } from '@shared/schema';

interface WebSocketClient extends WebSocket {
  userId?: number;
  isAlive: boolean;
}

interface WSMessage {
  event: string;
  userId?: number;
  isTyping?: boolean;
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Store client connections
  const clients = new Map<number, Set<WebSocketClient>>();

  const broadcast = (userId: number, event: string, data: any) => {
    const userClients = clients.get(userId);
    if (userClients) {
      const message = JSON.stringify({ event, data });
      userClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  };

  const heartbeat = (client: WebSocketClient) => {
    client.isAlive = true;
  };

  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as WebSocketClient;
      if (!client.isAlive) {
        if (client.userId) {
          const userClients = clients.get(client.userId);
          if (userClients) {
            userClients.delete(client);
            if (userClients.size === 0) {
              clients.delete(client.userId);
            }
          }
        }
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  wss.on('connection', (ws: WebSocketClient) => {
    ws.isAlive = true;

    ws.on('pong', () => heartbeat(ws));

    ws.on('message', async (data: WebSocket.RawData) => {
      try {
        const message = JSON.parse(data.toString()) as WSMessage;

        switch (message.event) {
          case 'auth':
            if (message.userId) {
              ws.userId = message.userId;
              let userClients = clients.get(message.userId);
              if (!userClients) {
                userClients = new Set();
                clients.set(message.userId, userClients);
              }
              userClients.add(ws);
            }
            break;

          case 'typing':
            if (ws.userId && typeof message.isTyping === 'boolean') {
              broadcast(ws.userId, 'typing', {
                userId: ws.userId,
                isTyping: message.isTyping
              });
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      if (ws.userId) {
        const userClients = clients.get(ws.userId);
        if (userClients) {
          userClients.delete(ws);
          if (userClients.size === 0) {
            clients.delete(ws.userId);
          }
        }
      }
    });
  });

  return {
    broadcast,
    notifyMessageUpdate: (userId: number, message: Message) => {
      broadcast(userId, 'messageUpdate', message);
    },
    notifyMessageDelete: (userId: number, messageId: number) => {
      broadcast(userId, 'messageDelete', { id: messageId });
    },
    notifyTyping: (userId: number, typingUserId: number, isTyping: boolean) => {
      broadcast(userId, 'typing', { userId: typingUserId, isTyping });
    }
  };
}