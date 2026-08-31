/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'acbabqolghhyxksouaye.supabase.co' },
    ],
  },
  // Rien ici pour `/sw.js` : il est désormais servi par `app/sw.js/route.ts`,
  // qui pose lui-même `Cache-Control: no-store` et son `Content-Type` — un
  // service worker ne doit jamais être servi depuis un cache intermédiaire,
  // sans quoi le navigateur mettrait des heures à voir un remplacement
  // (interrupteur d'arrêt compris).
};

export default nextConfig;
