import type {
  ExecuteSqlParams,
  SqliteExecutionResult,
  WoodboxBridgeAdapterInfo,
} from '../protocol';

export interface WoodboxBridgeAdapter extends WoodboxBridgeAdapterInfo {
  executeSql(params: ExecuteSqlParams): Promise<SqliteExecutionResult>;
}
