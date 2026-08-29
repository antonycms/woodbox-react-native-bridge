export type WoodboxBridgePlatform = 'android' | 'ios' | 'unknown';

export interface WoodboxBridgeAdapterInfo {
  id: string;
  label: string;
  kind: string;
  dialect: string;
  model: 'relational';
}

export interface WoodboxBridgeHelloMessage {
  type: 'hello';
  app: {
    id?: string;
    name?: string;
    platform?: WoodboxBridgePlatform;
    deviceName?: string;
  };
  adapters: WoodboxBridgeAdapterInfo[];
}

export interface WoodboxBridgeRequestMessage {
  type: 'request';
  id: string;
  adapterId: string;
  method: 'relational.executeSql';
  params?: ExecuteSqlParams;
}

export type WoodboxBridgeResponseMessage =
  | {
      type: 'response';
      id: string;
      ok: true;
      result: SqliteExecutionResult;
    }
  | {
      type: 'response';
      id: string;
      ok: false;
      error: {
        message: string;
        code?: string;
      };
    };

export type WoodboxBridgeMessage =
  | WoodboxBridgeHelloMessage
  | WoodboxBridgeRequestMessage
  | WoodboxBridgeResponseMessage;

export interface ExecuteSqlParams {
  sql: string;
  params?: unknown[];
}

export interface SqliteExecutionResult {
  rows: Record<string, unknown>[];
  rowsAffected?: number;
  insertId?: number;
}
