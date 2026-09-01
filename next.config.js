/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Pin the workspace root: a stray yarn.lock in the parent directory otherwise wins inference.
  turbopack: { root: __dirname },
};

module.exports = nextConfig;
