import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(webRoot, '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.DGBOOK_NEXT_DIST_DIR || '.next',
  output: process.env.DGBOOK_WEB_STANDALONE === '1' ? 'standalone' : undefined,
  experimental: {
    outputFileTracingRoot: repositoryRoot,
    serverComponentsExternalPackages: ['better-sqlite3'],
    outputFileTracingIncludes: {
      '/*': [
        './database/**/*',
        './scripts/db-admin.mjs',
        './src/platform/db/**/*',
        './node_modules/better-sqlite3/**/*',
        './node_modules/bindings/**/*',
        './node_modules/file-uri-to-path/**/*',
        '../../textbook/5g/generated/p1-demo-content.json',
        '../../textbook/5g/generated/lesson-ast/P01.json',
        '../../textbook/5g/generated/lesson-ast/P02.json',
        '../../textbook/5g/generated/lesson-ast/P03.json',
      ],
    },
  },
  transpilePackages: [
    '@dgbook/animation',
    '@dgbook/widgets',
    '@dgbook/shared',
    '@dgbook/edugame-core',
    '@dgbook/edugame-assets',
  ],
  async redirects() {
    return [
      { source: '/platform', destination: '/', permanent: true },
      { source: '/projects/:path*', destination: '/course', permanent: true },
      { source: '/tasks/:path*', destination: '/course', permanent: true },
      { source: '/samples/:path*', destination: '/course', permanent: true },
      { source: '/maps/:path*', destination: '/course', permanent: true },
      { source: '/login/student', destination: '/', permanent: true },
      { source: '/login/teacher', destination: '/', permanent: true },
      { source: '/teacher', destination: '/teacher/workbench', permanent: true },
      { source: '/classroom', destination: '/classroom/P1T1-N02', permanent: true },
    ];
  },
  async headers() {
    const immutable = [
      {
        key: 'Cache-Control',
        value: 'public, max-age=31536000, immutable',
      },
    ];

    return [
      { source: '/media/home/:path*', headers: immutable },
      { source: '/media/capability-maps/:path*', headers: immutable },
      { source: '/media/tts/:path*', headers: immutable },
      {
        source: '/media/tts/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, no-cache, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
