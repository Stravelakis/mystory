/* Real screenshots for the README and the docs site, taken from a running
   instance with demo entries in it (never the real vault).

     npx electron scripts/screenshots.cjs http://127.0.0.1:38727

   Writes PNGs to docs/public/screenshots/. */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const BASE = process.argv.find(a => /^https?:\/\//.test(a)) || 'http://127.0.0.1:38727';
const OUT = path.join(__dirname, '..', 'docs', 'public', 'screenshots');
// A hidden window gets its animation frames throttled, and the tab switch
// waits on an exit animation that then never finishes.
// A fresh in-memory partition each run, so no draft from an earlier run is
// "recovered" onto the first screen.
const NO_THROTTLE = { backgroundThrottling: false, partition: 'shots-' + Date.now() };
const wait = ms => new Promise(r => setTimeout(r, ms));

// Click the first button whose text contains `label`. Returns false if none.
const click = (win, label) =>
  win.webContents.executeJavaScript(`(() => {
    const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(label)}));
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  })()`);

// Poll until some text appears on the page, up to `ms`. textContent, not
// innerText: buttons are uppercased by CSS and innerText reports that.
async function until(win, text, ms = 90000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await win.webContents.executeJavaScript(`document.body.textContent.includes(${JSON.stringify(text)})`)) return true;
    await wait(500);
  }
  return false;
}

async function shot(win, name) {
  await wait(1200); // let the entrance animations settle
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, name), img.toPNG());
  console.log('  ' + name);
}

const scrollTo = (win, text) =>
  win.webContents.executeJavaScript(`(() => {
    const el = [...document.querySelectorAll('body *')].find(e => !e.childElementCount && e.textContent.trim() === ${JSON.stringify(text)});
    if (el) el.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -90);
    return !!el;
  })()`);

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: 1440, height: 960, show: true, x: -4000, y: 0, skipTaskbar: true, backgroundColor: '#1a0a0d', webPreferences: NO_THROTTLE });
  await win.loadURL(BASE);
  await wait(2500);

  await shot(win, '01-record.png');

  await click(win, 'What she told the family');
  await until(win, 'In English', 15000);
  await click(win, 'Translate');
  await until(win, 'imagined', 30000);
  await shot(win, '02-entry.png');
  await scrollTo(win, 'Indicators');
  await shot(win, '03-indicators.png');

  await click(win, 'Synthesis');
  await wait(1500);
  await click(win, 'Find my episodes');
  await until(win, 'Draft this episode', 20000);
  await click(win, 'Draft this episode');
  const drafted = await until(win, 'Copy the chapter', 120000);
  if (!drafted) console.log('  (the draft did not finish; shooting the list instead)');
  await scrollTo(win, 'Episodes');
  await shot(win, '04-episodes.png');

  await win.webContents.executeJavaScript('window.scrollTo(0, 0)');
  await click(win, 'Settings');
  await wait(1500);
  // Not the top of Settings: it prints the vault's full path.
  await scrollTo(win, 'Where your words go');
  await shot(win, '05-consent.png');
  await click(win, 'Load models');
  await until(win, 'Try it', 60000);
  // Show the slots filled (on screen only; nothing is saved): first choice,
  // then two fallbacks, from whatever the providers listed.
  // The slots are custom pickers: open each empty one and click an option.
  const filled = await win.webContents.executeJavaScript(`(() => {
    const want = ['gemini-3.8-live-extended-thinking', 'gemini-3.5-flash-lite', 'gemma-4-31b-it'];
    const transcribe = ['gemini-3.5-transcribe-live', 'gemini-3.5-transcribe', 'gemini-3.5-flash'];
    const pickers = [...document.querySelectorAll('.picker')].filter(p =>
      [...p.querySelectorAll('.pickopt')].some(o => o.textContent.trim() === '— none —'));
    let n = 0;
    pickers.forEach((p, i) => {
      const opts = [...p.querySelectorAll('.pickopt')];
      const list = i < 3 ? transcribe : want;
      const hit = opts.find(o => o.textContent.includes(list[i % 3]) && !o.textContent.includes(list[i % 3] + '-'))
        || opts.find(o => o.textContent.includes(list[i % 3]));
      if (hit) { hit.click(); n++; }
    });
    return n + ' of ' + pickers.length + ' slots filled';
  })()`);
  console.log('  models: ' + filled);
  await scrollTo(win, 'Which model does which job');
  await shot(win, '06-models.png');

  // A phone, through Tailscale.
  const phone = new BrowserWindow({ width: 390, height: 844, show: true, x: -4000, y: 0, skipTaskbar: true, backgroundColor: '#1a0a0d', webPreferences: { ...NO_THROTTLE, partition: 'phone-' + Date.now() } });
  await phone.loadURL(BASE);
  await wait(2500);
  await shot(phone, '07-phone.png');

  app.quit();
});
