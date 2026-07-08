import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const cryptoShim = fileURLToPath(new URL('./src/shims/crypto.ts', import.meta.url));
const output = process.env.NEXT_OUTPUT === 'export' ? 'export' : process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined;
const isStaticExport = output === 'export';

const rewriteConfig = isStaticExport
  ? {}
  : {
      async rewrites() {
        return [
          {
            source: '/sensor/:path*',
            destination: `${process.env.SENSOR_REWRITE_URL ?? 'http://localhost:3003'}/:path*`,
          },
          {
            source: '/responder/:path*',
            destination: `${process.env.RESPONDER_REWRITE_URL ?? 'http://localhost:3004'}/:path*`,
          },
        ];
      },
    };

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(output ? { output } : {}),
  ...rewriteConfig,
  allowedDevOrigins: ['127.0.0.1'],
  turbopack: {
    root: appRoot,
  },
  webpack(config, { isServer, webpack }) {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        crypto: cryptoShim,
        'node:crypto': cryptoShim,
      };
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^node:crypto$/, cryptoShim));
    }
    return config;
  },
};

export default nextConfig;
