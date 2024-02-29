module.exports = {
    apps: [
      {
        name: "instalasi-api",
        script: "dist/src/main.js",
        instances: 1,
        autorestart: true,
        watch: false,
        // max_memory_restart: "2G",
        // env: {
        //   PORT: 3039
        // }
      }
    ]
  };
  