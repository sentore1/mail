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

  // Puppeteer and nodemailer use Node.js APIs not available in Edge runtime
  // Mark them as server-only so Next.js doesn't try to bundle them for the browser
  serverExternalPackages: ['puppeteer', 'puppeteer-core', 'nodemailer', 'imapflow'],

  // Webpack config — suppress warnings from server-only packages
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle these on the client side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        dns: false,
        child_process: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
