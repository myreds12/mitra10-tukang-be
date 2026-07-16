module.exports = {
    apps: [
      {
        name: 'tukang-api',
        script: 'dist/src/main.js',
        instances: 3,
        autorestart: true,
        watch: false,
        exec_mode: 'cluster',
        max_memory_restart: '4G',
      },
    ],
  };
