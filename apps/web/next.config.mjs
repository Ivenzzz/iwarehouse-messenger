/** @type {import('next').NextConfig} */
const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig = {
  output: 'standalone',
  async rewrites() {
    // In production NGINX proxies /api → api service; this rewrite makes plain
    // `next dev` / `next start` work without NGINX too.
    return [
      { source: '/api/:path*', destination: `${API_URL}/:path*` },
    ];
  },
};

export default nextConfig;
