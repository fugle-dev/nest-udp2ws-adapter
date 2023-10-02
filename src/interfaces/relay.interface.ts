import { Socket } from 'dgram';
import { WebSocketServer } from 'ws';

export interface Relay {
  socket: Socket;
  wsServer: WebSocketServer;
}
