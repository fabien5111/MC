/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'acbabqolghhyxksouaye.supabase.co' },
    ],
  },
  async headers() {
    return [
      {
        // Le service worker auto-destructeur ne doit jamais être servi depuis
        // un cache intermédiaire : sa raison d'être est justement d'atteindre
        // les navigateurs porteurs de l'ancien worker.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default nextConfig;
