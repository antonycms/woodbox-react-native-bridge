# @woodbox/react-native-bridge

Bridge de desenvolvimento para inspecionar e editar dados locais de apps React Native pelo Woodbox.

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
