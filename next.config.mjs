/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // External packages for server-side only (PDF processing and native modules)
  serverExternalPackages: [
    'pdf2json',
    'pdfjs-dist',
    'canvas',
    'tesseract.js',
    '@sparticuz/chromium',
    'puppeteer-core',
    'pdf2pic',
    'pdf-poppler',
    'officeparser',
  ],

  // Ignore build errors for Vercel deployment
  typescript: {
    ignoreBuildErrors: true,
  },

  // Allow large file uploads (default is 10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '1tb',
    },
    proxyClientMaxBodySize: '1tb',
  },
};

export default nextConfig;
