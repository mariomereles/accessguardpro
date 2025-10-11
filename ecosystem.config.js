module.exports = {
  apps: [{
    name: 'event-api',
    script: 'dist/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5001,
      DATABASE_URL: process.env.DATABASE_URL,
      REDIS_URL: process.env.REDIS_URL,
      JWT_PRIVATE_KEY_PATH: './keys/private.pem',
      JWT_PUBLIC_KEY_PATH: './keys/public.pem',
      GATE_HS_SECRET_DEFAULT: process.env.GATE_HS_SECRET_DEFAULT,
      HASH_CHAIN_SALT: process.env.HASH_CHAIN_SALT,
      CORS_ORIGIN: process.env.CORS_ORIGIN || 'https://yourdomain.com'
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};