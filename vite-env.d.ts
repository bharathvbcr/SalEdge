/// <reference types="vite/client" />

/** Compile-time constant injected by Vite `define`. true during dev / `build:test`, false in production. */
declare const __TEST_LOGIN__: boolean;

interface ImportMetaEnv {
    /** Dev/testing only: enables seeded test-login UI + auto-login bypass in a build. Leave unset in production. */
    readonly VITE_ENABLE_TEST_LOGIN?: string;
    /** Dev/testing only: auto-login as this seeded account (admin|staff), skipping the login screen. */
    readonly VITE_AUTO_LOGIN?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
