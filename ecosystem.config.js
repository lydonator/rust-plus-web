// PM2 Ecosystem Configuration
// Development environment only (WSL)
// Production is managed separately via CI/CD

module.exports = {
  apps: [
    // Next.js Application (Development)
    {
      name: 'rust-plus-web-dev',
      script: 'npm',
      args: 'run dev',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/rust-plus-web-dev-error.log',
      out_file: './logs/rust-plus-web-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'development',
        NEXT_PUBLIC_SHIM_URL: 'http://localhost:4001',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      }
    },

    // Cloud Shim (FCM listener + RustPlus manager)
    {
      name: 'cloud-shim-dev',
      script: 'src/index.js',
      cwd: './cloud-shim',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '../logs/cloud-shim-dev-error.log',
      out_file: '../logs/cloud-shim-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'development',
      }
    },

    // Status Monitor
    {
      name: 'status-monitor-dev',
      script: 'status-monitor.js',
      cwd: './worker',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      error_file: '../logs/status-monitor-dev-error.log',
      out_file: '../logs/status-monitor-dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'development'
      }
    }
  ]
};
