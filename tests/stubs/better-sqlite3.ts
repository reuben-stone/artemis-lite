// Stub for tests that don't need real SQLite
export default class Database {
  prepare() { return { run: () => {}, get: () => null, all: () => [] } }
  exec() {}
  pragma() {}
}
