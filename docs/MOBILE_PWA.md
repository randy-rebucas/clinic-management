# Mobile App / PWA Support Plan

1. Enable Next.js PWA plugin (next-pwa) for offline support and installable web app.
2. Add manifest.json and service worker configuration in public/.
3. Test app on mobile devices for responsiveness and installability.
4. Optionally, plan native mobile app (React Native or Flutter) for future.

Example steps:
- Install next-pwa: `npm install next-pwa`
- Configure next.config.ts:

```js
const withPWA = require('next-pwa');
module.exports = withPWA({
  pwa: {
    dest: 'public',
    register: true,
    skipWaiting: true,
  },
});
```

- Add public/manifest.json and icons
- Document in docs/MOBILE_PWA.md
