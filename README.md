# woodbox-react-native-bridge

Development bridge for inspecting and editing local React Native app data directly from [Woodbox](https://github.com/antonycms/woodbox).

It exposes supported local storage engines as SQLite-compatible adapters over a WebSocket connection, so Woodbox can browse tables, run SQL, inspect rows, and edit development data without adding one-off debug screens to your app.

## Features

- Connects a React Native app to Woodbox during development.
- Supports multiple adapters in the same app.
- Works with common React Native storage layers:
  - `@react-native-async-storage/async-storage`
  - `react-native-sqlite-storage`
  - `expo-sqlite`
  - `react-native-nitro-sqlite`
- Automatically reconnects when Woodbox or the app restarts.
- Sends heartbeat messages to keep the bridge connection healthy.
- Keeps the bridge opt-in through an `enabled` flag, so it can stay disabled outside development.

## Installation

```bash
npm install woodbox-react-native-bridge
```

Install only the storage package you use in your app. Storage packages are optional peer dependencies.

## Quick start

Start the bridge only in development builds:

```ts
import { startWoodboxBridge } from 'woodbox-react-native-bridge';

if (__DEV__) {
  const bridge = startWoodboxBridge({
    app: {
      id: 'my-app-dev',
      name: 'My App',
      platform: 'android',
    },
    adapters: [],
  });

  // Optional: call this when your app tears down the debug bridge.
  // bridge.stop();
}
```

Default connection URLs:

- Android emulator: `ws://10.0.2.2:8123`
- iOS simulator: `ws://localhost:8123`

Use `url` when running on a physical device or custom network setup.

```ts
startWoodboxBridge({
  url: 'ws://192.168.1.20:8123',
  app: { name: 'My App', platform: 'android' },
  adapters: [],
});
```

## Using AsyncStorage

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStorageAdapter, startWoodboxBridge } from 'woodbox-react-native-bridge';

if (__DEV__) {
  startWoodboxBridge({
    app: {
      id: 'my-app-dev',
      name: 'My App',
      platform: 'android',
    },
    adapters: [
      createAsyncStorageAdapter({
        id: 'async-storage',
        label: 'AsyncStorage',
        storage: AsyncStorage,
      }),
    ],
  });
}
```

In Woodbox, select the `React Native SQLite` dialect and choose the `AsyncStorage` adapter.

AsyncStorage is exposed as a virtual table named `async_storage` with these columns:

| Column | Type | Description |
| --- | --- | --- |
| `key` | `text` | Storage key. |
| `value` | `text` | Stored string value. |
| `type` | `text` | Inferred value type: `string`, `number`, `boolean`, `json`, or `null`. |

Supported AsyncStorage SQL operations include simple `SELECT`, `INSERT`, `UPDATE`, and `DELETE` statements against `async_storage`. Mutating statements must target rows by `key`.

```sql
select * from async_storage order by key;
select key, value from async_storage where key like '%session%';
update async_storage set value = '{"theme":"dark"}' where key = 'settings';
delete from async_storage where key = 'old-cache';
```

## Using react-native-sqlite-storage

```ts
import SQLite from 'react-native-sqlite-storage';
import {
  createReactNativeSqliteStorageAdapter,
  startWoodboxBridge,
} from 'woodbox-react-native-bridge';

const db = SQLite.openDatabase({ name: 'app.db', location: 'default' });

if (__DEV__) {
  startWoodboxBridge({
    app: {
      id: 'my-app-dev',
      name: 'My App',
      platform: 'android',
    },
    adapters: [
      createReactNativeSqliteStorageAdapter({
        id: 'main',
        label: 'Main SQLite database',
        database: db,
      }),
    ],
  });
}
```

## Using expo-sqlite

```ts
import * as SQLite from 'expo-sqlite';
import { createExpoSqliteAdapter, startWoodboxBridge } from 'woodbox-react-native-bridge';

const db = await SQLite.openDatabaseAsync('app.db');

if (__DEV__) {
  startWoodboxBridge({
    app: {
      id: 'my-app-dev',
      name: 'My App',
      platform: 'android',
    },
    adapters: [
      createExpoSqliteAdapter({
        id: 'main',
        label: 'Main SQLite database',
        database: db,
      }),
    ],
  });
}
```

## Using react-native-nitro-sqlite

```ts
import { open } from 'react-native-nitro-sqlite';
import {
  createReactNativeNitroSqliteAdapter,
  startWoodboxBridge,
} from 'woodbox-react-native-bridge';

const db = open({ name: 'app.db' });

if (__DEV__) {
  startWoodboxBridge({
    app: {
      id: 'my-app-dev',
      name: 'My App',
      platform: 'android',
    },
    adapters: [
      createReactNativeNitroSqliteAdapter({
        id: 'main',
        label: 'Main SQLite database',
        database: db,
      }),
    ],
  });
}
```

## Multiple adapters

You can expose more than one data source at the same time. Each adapter must have a unique `id`.

```ts
startWoodboxBridge({
  app: { name: 'My App', platform: 'android' },
  adapters: [
    createAsyncStorageAdapter({
      id: 'async-storage',
      label: 'AsyncStorage',
      storage: AsyncStorage,
    }),
    createReactNativeSqliteStorageAdapter({
      id: 'main-db',
      label: 'Main database',
      database: db,
    }),
  ],
});
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `url` | Platform-specific | Woodbox bridge WebSocket URL. |
| `app` | Required | App metadata shown in Woodbox. |
| `adapters` | Required | List of storage/database adapters to expose. |
| `enabled` | `true` | Set to `false` to skip opening the bridge. |
| `reconnectIntervalMs` | `2000` | Initial reconnect delay. |
| `maxReconnectIntervalMs` | `10000` | Maximum reconnect delay. |
| `heartbeatIntervalMs` | `5000` | Ping interval while connected. |
| `connectionTimeoutMs` | `10000` | Timeout for opening the WebSocket connection. |

## Safety notes

This package is intended for development and debugging. Do not enable it in production builds unless you fully control the network and understand the risk of exposing local app data and SQL execution.

Recommended guard:

```ts
if (__DEV__) {
  startWoodboxBridge({
    app: { name: 'My App', platform: 'android' },
    adapters: [/* ... */],
  });
}
```

## License

MIT
