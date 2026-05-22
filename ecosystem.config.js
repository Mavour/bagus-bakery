module.exports = {
  apps: [{
    name: 'bagus-bakery',
    script: 'server.js',
    watch: false,
    env: { NODE_ENV: 'production', PORT: 8080 }
  }]
};
