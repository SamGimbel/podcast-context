/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
  // Enable larger server-side responses
  experimental: {
    serverComponentsExternalPackages: ['@ffmpeg-installer/ffmpeg'],
  },
}

module.exports = nextConfig