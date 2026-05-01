/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'a0.muscache.com' },
      { protocol: 'https', hostname: '**.airbnbusercontent.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Vendored package — let Next transpile the ESM SDK.
  transpilePackages: ['@repull/sdk', '@repull/types'],
};

export default nextConfig;
