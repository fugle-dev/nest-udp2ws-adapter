import * as http from 'http';
import * as dgram from 'dgram';
import { WebSocket, ServerOptions } from 'ws';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { normalizePath, isNil } from '@nestjs/common/utils/shared.utils';
import { AbstractWsAdapter } from '@nestjs/websockets';
import { CONNECTION_EVENT, ERROR_EVENT } from '@nestjs/websockets/constants';
import { MessageMappingProperties } from '@nestjs/websockets/gateway-metadata-explorer';
import { fromEvent, Observable } from 'rxjs';
import { filter, first, map, mergeMap, share, takeUntil } from 'rxjs/operators';
import { AdapterOptions, Relay } from '../interfaces';
import { CLOSE_EVENT, LISTENING_EVENT } from '../constants';

let wsPackage: any = {};

type HttpServerRegistryKey = number;
type HttpServerRegistryEntry = any;
type WsServerRegistryKey = number;
type WsServerRegistryEntry = any[];

const UNDERLYING_HTTP_SERVER_PORT = 0;

/**
 * @publicApi
 */
export class Udp2wsAdapter extends AbstractWsAdapter {
  protected readonly logger = new Logger(Udp2wsAdapter.name);
  protected readonly httpServersRegistry = new Map<
    HttpServerRegistryKey,
    HttpServerRegistryEntry
  >();
  protected readonly wsServersRegistry = new Map<
    WsServerRegistryKey,
    WsServerRegistryEntry
  >();
  protected readonly type: dgram.SocketType;
  protected readonly port: number;
  protected readonly address: string;
  protected readonly multicastAddress: string;
  protected readonly multicastInterface: string;
  protected readonly socketOptions: dgram.SocketOptions;
  protected readonly bindOptions: dgram.BindOptions;

  constructor(appOrHttpServer?: INestApplicationContext | any, options: AdapterOptions = {}) {
    super(appOrHttpServer);
    wsPackage = loadPackage('ws', 'Udp2wsAdapter', () => require('ws'));
    this.type = options.type ?? 'udp4';
    this.port = options.port;
    this.address = options.address;
    this.socketOptions = options.socketOptions;
    this.bindOptions = options.bindOptions;
    this.multicastAddress = options.multicastAddress;
    this.multicastInterface = options.multicastInterface;
  }

  public create( port: number, options?: ServerOptions) {
    const socket = (this.socketOptions)
      ? dgram.createSocket(this.socketOptions)
      : dgram.createSocket(this.type);

    socket.bind({ port: this.port, address: this.address, ...this.bindOptions }, () => {
      if (this.multicastAddress) {
        socket.addMembership(this.multicastAddress, this.multicastInterface);
      }
    });

    const wsServer = (() => {
      const { server, path, ...wsOptions } = options;
      if (port === UNDERLYING_HTTP_SERVER_PORT && this.httpServer) {
        this.ensureHttpServerExists(port, this.httpServer);
        const wsServer = this.bindErrorHandler(
          new wsPackage.Server({
            noServer: true,
            ...wsOptions,
          }),
        );

        this.addWsServerToRegistry(wsServer, port, path);
        return wsServer;
      }

      if (server) {
        return server;
      }
      if (path && port !== UNDERLYING_HTTP_SERVER_PORT) {
        // Multiple servers with different paths
        // sharing a single HTTP/S server running on different port
        // than a regular HTTP application
        const httpServer = this.ensureHttpServerExists(port);
        httpServer?.listen(port);

        const wsServer = this.bindErrorHandler(
          new wsPackage.Server({
            noServer: true,
            ...wsOptions,
          }),
        );
        this.addWsServerToRegistry(wsServer, port, path);
        return wsServer;
      }
      const wsServer = this.bindErrorHandler(
        new wsPackage.Server({
          port,
          path,
          ...wsOptions,
        }),
      );
      return wsServer;
    })();

    return { socket, wsServer } as Relay;
  }

  public bindMessageHandlers(
    relay: Relay,
    handlers: MessageMappingProperties[],
    transform: (data: any) => Observable<any>,
  ) {
    const close$ = fromEvent(relay.socket, CLOSE_EVENT).pipe(share(),first());
    handlers.forEach(({ message, callback }) => {
      const source$ = fromEvent(relay.socket, message).pipe(
        mergeMap((payload: any) => {
          const [msg, rinfo] = payload;
          return transform(callback(msg, rinfo)).pipe(
            filter((response: any) => !isNil(response)),
            map((response: any) => [response, rinfo]),
          );
        }),
        takeUntil(close$),
      );
      source$.subscribe(([response, rinfo]) => {
        return relay.wsServer.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(response);
          }
        });
      });
    });
  }

  public bindErrorHandler(server: any) {
    server.on(CONNECTION_EVENT, (ws: any) =>
      ws.on(ERROR_EVENT, (err: any) => this.logger.error(err)),
    );
    server.on(ERROR_EVENT, (err: any) => this.logger.error(err));
    return server;
  }

  public bindClientConnect(relay: any, callback: Function) {
    relay.socket.on(LISTENING_EVENT, () => callback(relay));
  }

  public bindClientDisconnect(relay: any, callback: Function) {
    relay.socket.on(CLOSE_EVENT, () => callback(relay));
  }

  public async dispose() {
    const closeEventSignals = Array.from(this.httpServersRegistry)
      .filter(([port]) => port !== UNDERLYING_HTTP_SERVER_PORT)
      .map(([_, server]) => new Promise(resolve => server.close(resolve)));

    await Promise.all(closeEventSignals);
    this.httpServersRegistry.clear();
    this.wsServersRegistry.clear();
  }

  protected ensureHttpServerExists(
    port: number,
    httpServer = http.createServer(),
  ) {
    if (this.httpServersRegistry.has(port)) {
      return;
    }
    this.httpServersRegistry.set(port, httpServer);

    httpServer.on('upgrade', (request, socket, head) => {
      const baseUrl = 'ws://' + request.headers.host + '/';
      const pathname = new URL(request.url, baseUrl).pathname;
      const wsServersCollection = this.wsServersRegistry.get(port);

      let isRequestDelegated = false;
      for (const wsServer of wsServersCollection) {
        if (pathname === wsServer.path) {
          wsServer.handleUpgrade(request, socket, head, (ws: unknown) => {
            wsServer.emit('connection', ws, request);
          });
          isRequestDelegated = true;
          break;
        }
      }
      if (!isRequestDelegated) {
        socket.destroy();
      }
    });
    return httpServer;
  }

  protected addWsServerToRegistry<T extends Record<'path', string> = any>(
    wsServer: T,
    port: number,
    path: string,
  ) {
    const entries = this.wsServersRegistry.get(port) ?? [];
    entries.push(wsServer);

    wsServer.path = normalizePath(path);
    this.wsServersRegistry.set(port, entries);
  }
}
