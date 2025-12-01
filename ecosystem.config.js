// PM2 Ecosystem Configuration
// Handles both development (WSL) and production (VPS) environments

module.exports = {
  apps: [
    // Next.js Application (Development - WSL)
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
      }
    },

    // Next.js Application (Production - VPS)
    {
      name: 'rust-plus-web',
      script: './start-production.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/rust-plus-web-error.log',
      out_file: './logs/rust-plus-web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
      }
    },

    // Cloud Shim (FCM listener + RustPlus manager)
    // Production by default - use cloud-shim-dev for development
    {
      name: 'cloud-shim',
      script: 'src/index.js',
      cwd: './cloud-shim',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '../logs/cloud-shim-error.log',
      out_file: '../logs/cloud-shim-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
      }
    },

    // Cloud Shim - Development version (use for WSL dev)
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

    // Status Monitor (optional worker)
    // Production by default - use status-monitor-dev for development
    {
      name: 'status-monitor',
      script: 'status-monitor.js',
      cwd: './worker',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      error_file: '../logs/status-monitor-error.log',
      out_file: '../logs/status-monitor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production'
      }
    },

    // Status Monitor - Development version (use for WSL dev)
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
