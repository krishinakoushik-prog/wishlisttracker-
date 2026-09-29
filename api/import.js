// api/import.js: Vercel serverless function (free Hobby plan). Served at /api/import on the same site as index.html.
const blocked = h => /^(localhost|.*\.(local|internal))$/i.test(h) || /^(\[|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h);
const dec = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const meta = (html, keys) => {
  for (const k of keys) {
    const tag = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${k}["'][^>]*>`, 'i'))?.[0];
    const c = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (c) return dec(c);
  }
  return '';
};
function findProduct(n) {
  if (!n || typeof n !== 'object') return null;
  if (Array.isArray(n)) { for (const x of n) { const r = findProduct(x); if (r) return r; } return null; }
  if ([].concat(n['@type'] || []).includes('Product')) return n;
  return findProduct(n['@graph']);
}
module.exports = async (req, res) => {
  try {
    const u = new URL(req.query.url || '');
    if (!/^https?:$/.test(u.protocol) || blocked(u.hostname)) return res.status(400).json({ error: 'Invalid URL' });
    const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-IN,en;q=0.9' } });
    if (blocked(new URL(r.url).hostname)) return res.status(400).json({ error: 'Invalid URL' });
    const html = r.ok ? (await r.text()).slice(0, 1500000) : '';
    let p = null;
    for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
      try { p = findProduct(JSON.parse(m[1])); if (p) break; } catch { /* skip bad JSON-LD */ }
    }
    const off = [].concat(p?.offers || [])[0] || {};
    const img0 = [].concat(p?.image || [])[0];
    let image = (typeof img0 === 'string' ? img0 : img0?.url) || meta(html, ['og:image', 'twitter:image']);
    try { const a = new URL(image, r.url); image = /^https?:$/.test(a.protocol) ? a.href : ''; } catch { image = ''; }
    const pm = String(off.price ?? off.lowPrice ?? meta(html, ['product:price:amount', 'og:price:amount'])).match(/\d[\d,]*(?:\.\d+)?/);
    let name = dec(String(p?.name || meta(html, ['og:title', 'twitter:title']) || html.match(/<title[^>]*>([^<]*)/i)?.[1] || '')).trim().slice(0, 200);
    if (/robot check|captcha|access denied|just a moment|are you a human|attention required/i.test(name)) name = '';
    const host = new URL(r.url).hostname.replace(/^www\./, '').split('.');
    return res.status(200).json({
      name, image: name ? image : '', price: name && pm ? pm[0].replace(/,/g, '') : null,
      currency: off.priceCurrency || meta(html, ['product:price:currency', 'og:price:currency']) || null,
      store: meta(html, ['og:site_name']) || host[host.length > 2 ? host.length - 2 : 0],
    });
  } catch { return res.status(500).json({ error: 'Import failed' }); }
};
