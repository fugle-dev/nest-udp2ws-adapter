import { createSocket, Socket, SocketType, SocketOptions, BindOptions } from 'dgram';
import { WebSocket, WebSocketServer, ServerOptions } from 'ws';
import { WebSocketAdapter, INestApplicationContext } from '@nestjs/common';
import { isNil } from '@nestjs/common/utils/shared.utils';
import { MessageMappingProperties } from '@nestjs/websockets';
import { fromEvent, Observable } from 'rxjs';
import { filter, first, map, mergeMap, share, takeUntil } from 'rxjs/operators';
import { AdapterOptions, Relay } from '../interfaces';
import { CLOSE_EVENT, LISTENING_EVENT } from '../constants';

export class Udp2wsAdapter implements WebSocketAdapter {
  private readonly type: SocketType;
  private readonly port: number;
  private readonly address: string;
  private readonly multicastAddress: string;
  private readonly multicastInterface: string;
  private readonly socketOptions: SocketOptions;
  private readonly bindOptions: BindOptions;

  constructor(private app: INestApplicationContext, options: AdapterOptions = {}) {
    this.type = options.type ?? 'udp4';
    this.port = options.port;
    this.address = options.address;
    this.socketOptions = options.socketOptions;
    this.bindOptions = options.bindOptions;
    this.multicastAddress = options.multicastAddress;
    this.multicastInterface = options.multicastInterface;
  }

  public create(port: number, options: ServerOptions = {}) {
    const socket = (this.socketOptions)
      ? createSocket(this.socketOptions)
      : createSocket(this.type);

    socket.bind({ port: this.port, address: this.address, ...this.bindOptions }, () => {
      if (this.multicastAddress) {
        socket.addMembership(this.multicastAddress, this.multicastInterface);
      }
    });

    const wss = new WebSocketServer({ port, ...options });

    return { socket, wss } as Relay;
  }

  public bindClientConnect(relay: Relay, callback: Function) {
    relay.socket.on(LISTENING_EVENT, () => callback(relay));
  }

  public bindMessageHandlers(
    relay: Relay,
    handlers: MessageMappingProperties[],
    transform: (data: any) => Observable<any>,
  ) {
    const disconnect$ = fromEvent(relay.socket, CLOSE_EVENT).pipe(
      share(),
      first(),
    );
    handlers.forEach(({ message, callback }) => {
      const source$ = fromEvent(relay.socket, message).pipe(
        mergeMap((payload: any) => {
          const [msg, rinfo] = payload;
          return transform(callback(msg, rinfo)).pipe(
            filter((response: any) => !isNil(response)),
            map((response: any) => [response, rinfo]),
          );
        }),
        takeUntil(disconnect$),
      );
      source$.subscribe(([response, rinfo]) => {
        return relay.wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(response);
          }
        });
      });
    });
  }

  public close(relay: Relay) {
    relay.socket.close();
    relay.wss.close();
  }
}
