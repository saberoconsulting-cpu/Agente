/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_PROXY_TARGET || 'http://127.0.0.1:3001'}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
