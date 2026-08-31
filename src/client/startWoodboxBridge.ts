import type {
  WoodboxBridgeHelloMessage,
  WoodboxBridgeRequestMessage,
  WoodboxBridgeResponseMessage,
  WoodboxBridgePlatform,
} from '../protocol';
import type { WoodboxBridgeAdapter } from '../adapters/types';

export interface StartWoodboxBridgeParams {
  /**
   * @default iOS simulator: 'ws://localhost:8123'
   * @default Android emulator: 'ws://10.0.2.2:8123'
   */
  url?: string;
  app: {
    id?: string;
    name?: string;
    platform?: WoodboxBridgePlatform;
    deviceName?: string;
  };

  /**
   * @default 2000
   */
  reconnectIntervalMs?: number;

  /**
   * @default 10000
   */
  maxReconnectIntervalMs?: number;

  /**
   * @default 5000
   */
  heartbeatIntervalMs?: number;

  /**
   * @default 10000
   */
  connectionTimeoutMs?: number;

  /**
   * @default true
   */
  enabled?: boolean;

  adapters: WoodboxBridgeAdapter[];
}

const toErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : String(error || 'Erro desconhecido');
};

const getDefaultWoodboxBridgeUrl = (platform?: WoodboxBridgePlatform) => {
  return platform === 'android' ? 'ws://10.0.2.2:8123' : 'ws://localhost:8123';
};

export const startWoodboxBridge = ({
  url,
  app,
  adapters,
  reconnectIntervalMs = 2000,
  maxReconnectIntervalMs = 10000,
  heartbeatIntervalMs = 5000,
  connectionTimeoutMs = 10000,
  enabled = true,
}: StartWoodboxBridgeParams) => {
  if (!enabled) return { stop: () => undefined };

  const bridgeUrl = url || getDefaultWoodboxBridgeUrl(app.platform);
  let socket: WebSocket | undefined;
  let closed = false;
  let reconnectAttempts = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
  let connectionTimeout: ReturnType<typeof setTimeout> | undefined;

  const adapterMap = new Map(adapters.map((adapter) => [adapter.id, adapter]));

  const clearReconnectTimeout = () => {
    if (!reconnectTimeout) return;

    clearTimeout(reconnectTimeout);
    reconnectTimeout = undefined;
  };

  const clearHeartbeat = () => {
    if (!heartbeatInterval) return;

    clearInterval(heartbeatInterval);
    heartbeatInterval = undefined;
  };

  const clearConnectionTimeout = () => {
    if (!connectionTimeout) return;

    clearTimeout(connectionTimeout);
    connectionTimeout = undefined;
  };

  const send = (
    message: WoodboxBridgeResponseMessage | WoodboxBridgeHelloMessage | { type: 'ping'; time: number },
  ) => {
    if (socket?.readyState !== WebSocket.OPEN) return false;

    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimeout) return;

    clearHeartbeat();
    clearConnectionTimeout();

    const delay = Math.min(
      reconnectIntervalMs * 2 ** reconnectAttempts,
      maxReconnectIntervalMs,
    );

    reconnectAttempts += 1;
    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = undefined;
      connect();
    }, delay);
  };

  const startHeartbeat = () => {
    clearHeartbeat();

    heartbeatInterval = setInterval(() => {
      const sent = send({ type: 'ping', time: Date.now() });

      if (!sent) {
        socket?.close();
        scheduleReconnect();
      }
    }, heartbeatIntervalMs);
  };

  const connect = () => {
    if (closed) return;

    clearReconnectTimeout();
    const currentSocket = new WebSocket(bridgeUrl);
    socket = currentSocket;

    connectionTimeout = setTimeout(() => {
      if (socket !== currentSocket || currentSocket.readyState !== WebSocket.CONNECTING) return;

      currentSocket.close();
      scheduleReconnect();
    }, connectionTimeoutMs);

    currentSocket.onopen = () => {
      if (socket !== currentSocket) return;

      clearConnectionTimeout();
      reconnectAttempts = 0;
      send({
        type: 'hello',
        app,
        adapters: adapters.map(({ executeSql: _executeSql, ...adapter }) => adapter),
      });
      startHeartbeat();
    };

    currentSocket.onmessage = async (event) => {
      if (socket !== currentSocket) return;

      const message = JSON.parse(String(event.data)) as WoodboxBridgeRequestMessage;

      if (message.type !== 'request') return;

      const adapter = adapterMap.get(message.adapterId);

      if (!adapter) {
        send({
          type: 'response',
          id: message.id,
          ok: false,
          error: { code: 'ADAPTER_NOT_FOUND', message: 'Adapter não encontrado.' },
        });
        return;
      }

      try {
        if (message.method !== 'relational.executeSql') {
          throw new Error(`Método não suportado: ${message.method}`);
        }

        const result = await adapter.executeSql(message.params || { sql: '' });

        send({ type: 'response', id: message.id, ok: true, result });
      } catch (error) {
        send({
          type: 'response',
          id: message.id,
          ok: false,
          error: { code: 'SQL_ERROR', message: toErrorMessage(error) },
        });
      }
    };

    currentSocket.onerror = () => {
      if (socket !== currentSocket || closed) return;

      currentSocket.close();
      scheduleReconnect();
    };

    currentSocket.onclose = () => {
      if (socket !== currentSocket) return;

      clearHeartbeat();
      clearConnectionTimeout();
      socket = undefined;
      scheduleReconnect();
    };
  };

  connect();

  return {
    stop() {
      closed = true;
      clearReconnectTimeout();
      clearHeartbeat();
      clearConnectionTimeout();
      socket?.close();
    },
  };
};
