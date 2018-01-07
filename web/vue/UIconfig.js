// This config is used in both the
// frontend as well as the web server.

// see https://github.com/askmike/gekko/blob/stable/docs/installing_gekko_on_a_server.md

const CONFIG = {
  headless: false,
  api: {
    host: '192.168.3.80',
    port: 5432,
    timeout: 120000 // 2 minutes
  },
  ui: {
    ssl: false,
    host: '192.168.3.80',
    port: 5432,
    path: '/'
  },
  adapter: 'sqlite'
}

if(typeof window === 'undefined')
  module.exports = CONFIG;
else
  window.CONFIG = CONFIG;
