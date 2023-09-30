import { Socket } from 'dgram';
import { WebSocketServer } from 'ws';

export interface Relay {
  socket: Socket;
  wss: WebSocketServer;
}
