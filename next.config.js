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

  // Puppeteer, nodemailer, imapflow use Node.js APIs — keep them server-side only
  serverExternalPackages: ['puppeteer', 'puppeteer-core', 'nodemailer', 'imapflow'],

  // Turbopack config (Next.js 16 default bundler)
  turbopack: {},

  // Suppress invalid source map warnings from third-party packages (e.g. @supabase/auth-js)
  webpack: (config) => {
    config.ignoreWarnings = [
      { message: /Failed to parse source map/ },
      { message: /Invalid source map/ },
      { message: /sourceMapURL could not be parsed/ },
    ];
    return config;
  },
};

module.exports = nextConfig;
