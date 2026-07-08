/** @type {import('next').NextConfig} */
const SENSOR_URL = process.env.NEXT_PUBLIC_SENSOR_URL ?? 'http://127.0.0.1:3003';
const RESPONDER_URL = process.env.NEXT_PUBLIC_RESPONDER_URL ?? 'http://127.0.0.1:3004';

const nextConfig = {
  reactStrictMode: true,
  // Proxy the two backend services in local dev so the browser can call
  // relative /sensor and /responder paths without CORS. In a hosted/static
  // deploy, point the NEXT_PUBLIC_* URLs at the public backends instead.
  async rewrites() {
    return [
      { source: '/sensor/:path*', destination: `${SENSOR_URL}/:path*` },
      { source: '/responder/:path*', destination: `${RESPONDER_URL}/:path*` },
    ];
  },
};

export default nextConfig;
