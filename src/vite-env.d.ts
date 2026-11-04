/// <reference types="vite/client" />

/** 来自 package.json 的版本号，由 vite.config 的 define 注入。 */
declare const __APP_VERSION__: string;
/** 构建时的 git 短哈希，由 vite.config 的 define 注入；本地取不到时为 "dev"。 */
declare const __COMMIT__: string;
