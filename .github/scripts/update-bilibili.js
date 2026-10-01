/**
 * Fetch a Bilibili favorites folder (视频收藏夹) and emit assets/json/bilibili.js
 * for the custom iframe-based mini player.
 *
 * Env:
 *   BILIBILI_FID   favorites folder id  (default: 4207040106)
 *   BILIBILI_PS    page size            (default: 20, max 20)
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const FID = process.env.BILIBILI_FID || '4207040106';
const PS = Math.min(parseInt(process.env.BILIBILI_PS || '20', 10), 20);

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          Referer: 'https://www.bilibili.com/'
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode + ': ' + raw.slice(0, 200)));
          try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function toHttps(url) {
  return typeof url === 'string' ? url.replace(/^http:\/\//, 'https://') : '';
}

async function fetchAll(fid) {
  const songs = [];
  let pn = 1;
  // safety cap at 50 pages (1000 items)
  while (pn <= 50) {
    const url = `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${fid}&pn=${pn}&ps=${PS}&order=mtime&type=0&tid=0&keyword=`;
    const json = await httpGetJson(url);
    if (json.code !== 0) {
      throw new Error(`Bilibili API code ${json.code}: ${json.message}`);
    }
    const medias = (json.data && json.data.medias) || [];
    for (const m of medias) {
      // only playable videos with a bvid
      if (!m.bvid) continue;
      songs.push({
        bvid: m.bvid,
        aid: m.id,
        title: String(m.title || '').slice(0, 80),
        artist: (m.upper && m.upper.name) || 'bilibili',
        cover: toHttps(m.cover),
        duration: m.duration || 0
      });
    }
    if (!json.data.has_more) break;
    pn += 1;
  }
  return songs;
}

function main() {
  return fetchAll(FID).then((songs) => {
    const payload = {
      fid: Number(FID),
      updated_at: new Date().toISOString(),
      count: songs.length,
      songs
    };
    const outDir = path.join(__dirname, '../../assets/json');
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, 'bilibili.js');
    fs.writeFileSync(file, `window.BILIBILI_SONGS = ${JSON.stringify(payload, null, 2)};\n`);
    console.log(`Generated ${file} with ${songs.length} songs from fav folder ${FID}`);
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `count=${songs.length}\n`);
    }
  });
}

main().catch((err) => {
  console.error('Bilibili fav sync failed:', err);
  process.exit(1);
});
