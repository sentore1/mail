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
  // Allow cross-origin requests from local network IPs during development
  // (e.g. accessing via WSL2 or a local network device)
  allowedDevOrigins: [
    'http://172.17.144.1:3000',
    'http://localhost:3000',
  ],
};

module.exports = nextConfig;
