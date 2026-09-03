// server-only's real package throws unless the "react-server" build condition is set, which
// vitest never sets. Aliased in here instead of adding that condition to vitest.config, which
// would also swap React itself to the server build and break every jsdom render test.
export {};
