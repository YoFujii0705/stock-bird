module.exports = {
  apps: [{
    name: 'stock-bird-bot',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};

{
  "name": "stock-bird-bot",
  "version": "1.0.0",
  "description": "Discord bot for fridge and rice management",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js",
    "pm2:start": "pm2 start ecosystem.config.js",
    "pm2:stop": "pm2 stop fridge-bot",
    "pm2:restart": "pm2 restart fridge-bot",
    "pm2:delete": "pm2 delete fridge-bot",
    "pm2:logs": "pm2 logs fridge-bot"
  },
  "dependencies": {
    "discord.js": "^14.14.1",
    "googleapis": "^128.0.0",
    "node-cron": "^3.0.3",
    "dayjs": "^1.11.10",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
