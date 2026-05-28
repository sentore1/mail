/** @type {import('next').NextConfig} */

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  allowedDevOrigins: [
    'http://172.17.144.1:3000',
    'http://localhost:3000',
  ],
};

module.exports = nextConfig;
