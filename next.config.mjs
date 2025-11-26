/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // External packages for server-side only (PDF processing)
  serverExternalPackages: ['pdf2json', 'pdfjs-dist', 'canvas'],
};

export default nextConfig;
