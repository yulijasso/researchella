/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactStrictMode: true,

  // Increase API route limits for large PDF uploads (medical textbooks)
  api: {
    bodyParser: {
      sizeLimit: '100mb', // Allow up to 100MB file uploads
    },
    responseLimit: '100mb',
    externalResolver: true,
  },

  // Increase serverless function timeout for large file processing
  experimental: {
    // Disable if not needed, but helps with large files
    serverComponentsExternalPackages: ['pdf2json', 'pdfjs-dist', 'canvas'],
  },
};

export default nextConfig;
