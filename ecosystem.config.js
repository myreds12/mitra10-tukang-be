module.exports = {
  apps: [
    {
      name: 'tukang-backend',
      script: 'npm',
      args: 'run start:dev',
      watch: true,
      ignore_watch: ['node_modules', 'dist'],
      env: {
        NODE_ENV: 'development',
      },
    },
    // {
    //   script: './service-worker/',
    //   watch: ['./service-worker'],
    // },
  ],

  deploy: {
    production: {
      user: 'SSH_USERNAME',
      host: 'SSH_HOSTMACHINE',
      ref: 'origin/master',
      repo: 'GIT_REPOSITORY',
      path: 'DESTINATION_PATH',
      'pre-deploy-local': '',
      'post-deploy':
        'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
};
