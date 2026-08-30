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
  enabled = true,
}: StartWoodboxBridgeParams) => {
  if (!enabled) return { stop: () => undefined };

  const bridgeUrl = url || getDefaultWoodboxBridgeUrl(app.platform);
  let socket: WebSocket | undefined;
  let closed = false;
  let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;

  const adapterMap = new Map(adapters.map((adapter) => [adapter.id, adapter]));

  const send = (message: WoodboxBridgeResponseMessage | WoodboxBridgeHelloMessage) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const connect = () => {
    if (closed) return;

    socket = new WebSocket(bridgeUrl);

    socket.onopen = () => {
      send({
        type: 'hello',
        app,
        adapters: adapters.map(({ executeSql: _executeSql, ...adapter }) => adapter),
      });
    };

    socket.onmessage = async (event) => {
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

    socket.onclose = () => {
      if (closed) return;
      reconnectTimeout = setTimeout(connect, reconnectIntervalMs);
    };
  };

  connect();

  return {
    stop() {
      closed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      socket?.close();
    },
  };
};
