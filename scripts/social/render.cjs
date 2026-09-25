/* Renders scripts/social/card.html to the 1200×630 share image used by the
   docs site (og:image / twitter:image).  npx electron scripts/social/render.cjs */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 630, show: true, x: -4000, y: 0, skipTaskbar: true,
    useContentSize: true, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(path.join(__dirname, 'card.html'));
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
  await new Promise(r => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1200, height: 630 });
  const out = path.join(__dirname, '..', '..', 'docs', 'public', 'og-image.png');
  fs.writeFileSync(out, img.resize({ width: 1200, height: 630 }).toPNG());
  console.log('wrote', out);
  app.quit();
});
