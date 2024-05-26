module.exports = {
    apps: [
      {
        name: "instalasi-api",
        script: "dist/src/main.js",
        instances: 1,
        autorestart: true,
        watch: ['dist/src'],
        // max_memory_restart: "2G",
        // env: {
        //   PORT: 3039
        // }
      }
    ]
  };
  