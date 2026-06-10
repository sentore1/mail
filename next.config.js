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
  // Setting an empty object silences the "no turbopack config" warning
  // while letting Turbopack use its own defaults for everything
  turbopack: {},
};

module.exports = nextConfig;
