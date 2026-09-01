# @woodbox/react-native-bridge

Bridge de desenvolvimento para inspecionar e editar dados locais de apps React Native pelo Woodbox.


## Uso com AsyncStorage

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStorageAdapter, startWoodboxBridge } from '@woodbox/react-native-bridge';

if (__DEV__) {
  startWoodboxBridge({
    app: {
      id: 'meu-app-dev',
      name: 'Meu App',
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

No Woodbox, selecione o dialeto `React Native SQLite` e escolha o adapter `AsyncStorage`.
Ele aparece como uma tabela virtual chamada `async_storage`, com as colunas `key`, `value` e `type`.

## Uso com react-native-sqlite-storage

```ts
import SQLite from 'react-native-sqlite-storage';
import {
  createReactNativeSqliteStorageAdapter,
  startWoodboxBridge,
} from '@woodbox/react-native-bridge';

const db = SQLite.openDatabase({ name: 'app.db', location: 'default' });

if (__DEV__) {
  startWoodboxBridge({
    app: {
      id: 'meu-app-dev',
      name: 'Meu App',
      platform: 'android',
    },
    adapters: [
      createReactNativeSqliteStorageAdapter({
        id: 'main',
        label: 'SQLite principal',
        database: db,
      }),
    ],
  });
}
```
## Uso com expo-sqlite

```ts
import * as SQLite from 'expo-sqlite';
import { createExpoSqliteAdapter, startWoodboxBridge } from '@woodbox/react-native-bridge';

const db = await SQLite.openDatabaseAsync('app.db');

if (__DEV__) {
  startWoodboxBridge({
    app: {
      id: 'meu-app-dev',
      name: 'Meu App',
      platform: 'android',
    },
    adapters: [
      createExpoSqliteAdapter({
        id: 'main',
        label: 'SQLite principal',
        database: db,
      }),
    ],
  });
}
```

## Uso com react-native-nitro-sqlite

```ts
import { open } from 'react-native-nitro-sqlite';
import {
  createReactNativeNitroSqliteAdapter,
  startWoodboxBridge,
} from '@woodbox/react-native-bridge';

const db = open({ name: 'app.db' });

if (__DEV__) {
  startWoodboxBridge({
    app: {
      id: 'meu-app-dev',
      name: 'Meu App',
      platform: 'android',
    },
    adapters: [
      createReactNativeNitroSqliteAdapter({
        id: 'main',
        label: 'SQLite principal',
        database: db,
      }),
    ],
  });
}
```

