import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  // Optimize package imports to reduce bundle size
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-accordion',
      '@radix-ui/react-avatar',
      '@radix-ui/react-popover',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-tooltip',
      'framer-motion',
      'motion',
    ],
  },

  // Turbopack config (Next.js 16 default bundler)
  turbopack: {
    root: process.cwd(), // Explicitly set workspace root to this project
  },

  // Compiler optimizations
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Webpack optimizations for better code splitting
  webpack: (config, { dev, isServer }) => {
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        usedExports: true,
        minimize: true,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Separate MCP SDK (large dependency)
            mcp: {
              name: 'mcp',
              test: /[\\/]node_modules[\\/]@modelcontextprotocol[\\/]/,
              priority: 40,
              reuseExistingChunk: true,
            },
            // Separate AI SDK (large dependency)
            ai: {
              name: 'ai',
              test: /[\\/]node_modules[\\/](@ai-sdk|ai)[\\/]/,
              priority: 35,
              reuseExistingChunk: true,
            },
            // UI libraries (Radix + Framer Motion)
            ui: {
              name: 'ui',
              test: /[\\/]node_modules[\\/](@radix-ui|framer-motion|motion)[\\/]/,
              priority: 30,
              reuseExistingChunk: true,
            },
            // React and core libraries
            react: {
              name: 'react',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 25,
              reuseExistingChunk: true,
            },
            // Commons (shared code used in multiple places)
            commons: {
              name: 'commons',
              minChunks: 2,
              priority: 20,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    return config;
  },
};

export default withBotId(nextConfig);
