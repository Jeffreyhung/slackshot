'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const SAMPLE = [
    'Ada Lovelace  [9:44 AM]',
    'Hey @grace, @Alan Turing, could I get your eyes on a couple of changes?',
    '',
    '• engine #12 (parser): https://github.com/example/engine/pull/12',
    '• engine #15 (renderer): https://github.com/example/engine/pull/15',
    '',
    '#12 is the base, #15 sits on top of it.',
    'Alan Turing  [3:08 PM]',
    'Looks good. One thing my linter found:',
    '',
    '```',
    'warning: unused variable `tape` in machine.rs:42',
    '```',
    'Grace Hopper  [3:35 PM]',
    'Found a bug. Literally.',
  ].join('\n');

  // ---------- storage (settings and avatars only, never the conversation) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('slackshot:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('slackshot:' + k, JSON.stringify(v)); } catch {} },
  };
  // Only accept avatar entries that are the PNG data URLs this page itself wrote.
  const avatars = Object.create(null);
  for (const [k, v] of Object.entries(store.get('avatars', {}) || {})) {
    if (typeof v === 'string' && v.startsWith('data:image/png;base64,')) avatars[k] = v;
  }

  // ---------- parsing ----------
  const TIME = String.raw`(\d{1,2}:\d{2}(?:\s?[AaPp][Mm])?)`;
  const BRACKET = new RegExp(String.raw`^(.*?)\s+\[` + TIME + String.raw`\]\s*$`);
  const BARE = new RegExp(String.raw`^(\S.{0,48}?)\s{2,}(\d{1,2}:\d{2}\s?[AaPp][Mm])\s*$`);

  const isName = (s) => s.length > 0 && s.length <= 50 && s.split(/\s+/).length <= 5 &&
    !/[!?:;]|[.,]\s|[.!?]\S|https?:|^[@•\-*>`#(]/.test(s);

  function strictHeader(line) {
    const m = BRACKET.exec(line) || BARE.exec(line);
    if (!m) return null;
    const name = m[1].trim();
    return isName(name) ? { name, time: m[2] } : null;
  }

  function parse(text) {
    const lines = text.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n');
    const known = new Set();
    for (const l of lines) { const h = strictHeader(l); if (h) known.add(h.name); }
    const names = [...known].sort((a, b) => b.length - a.length);

    const msgs = [];
    let cur = null;
    const push = (name, time) => { cur = { name, time, lines: [] }; msgs.push(cur); };
    const body = (l) => { if (!cur) push('', ''); cur.lines.push(l); };

    for (const l of lines) {
      const h = strictHeader(l);
      if (h) { push(h.name, h.time); continue; }
      // A header glued to the end of the previous message ("…the problem.Max Kosty  [3:12 PM]")
      const m = BRACKET.exec(l);
      if (m) {
        const pre = m[1];
        const n = names.find((n) => pre.endsWith(n));
        let split = n ? pre.length - n.length : -1;
        if (split < 0) {
          const g = /^(.*[.!?)"”`])\s*([A-Z][^.!?]{1,40})$/.exec(pre);
          if (g && isName(g[2].trim())) split = g[1].length;
        }
        if (split >= 0) {
          const before = pre.slice(0, split).trimEnd();
          if (before) body(before);
          push(pre.slice(split).trim(), m[2]);
          continue;
        }
      }
      body(l);
    }
    for (const m of msgs) {
      while (m.lines.length && !m.lines[0].trim()) m.lines.shift();
      while (m.lines.length && !m.lines[m.lines.length - 1].trim()) m.lines.pop();
    }
    return { msgs: msgs.filter((m) => m.name || m.lines.length), names };
  }

  function toBlocks(lines) {
    const out = [];
    let para = null, code = null;
    const flush = () => { para = null; };
    for (const raw of lines) {
      if (code) {
        const end = raw.indexOf('```');
        if (end >= 0) { if (raw.slice(0, end).trim()) code.push(raw.slice(0, end)); out.push({ t: 'code', text: code.join('\n') }); code = null; }
        else code.push(raw);
        continue;
      }
      if (/^\s*```/.test(raw)) {
        flush();
        const rest = raw.replace(/^\s*```/, '');
        const end = rest.indexOf('```');
        if (end >= 0) out.push({ t: 'code', text: rest.slice(0, end) });
        else { code = []; if (rest.trim()) code.push(rest); }
        continue;
      }
      const line = raw.trim();
      if (!line) { flush(); continue; }
      let m;
      if ((m = /^[•◦▪\-*]\s+(.*)$/.exec(line))) { flush(); out.push({ t: 'li', text: m[1] }); continue; }
      if ((m = /^(?:>|&gt;)\s?(.*)$/.exec(line))) {
        flush();
        const last = out[out.length - 1];
        if (last && last.t === 'quote') last.lines.push(m[1]); else out.push({ t: 'quote', lines: [m[1]] });
        continue;
      }
      if (!para) { para = { t: 'p', lines: [] }; out.push(para); }
      para.lines.push(line);
    }
    if (code) out.push({ t: 'code', text: code.join('\n') });
    return out;
  }

  // ---------- rendering ----------
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const COLORS = ['#e01e5a', '#2eb67d', '#36c5f0', '#ecb22e', '#4a154b', '#1264a3', '#e8912d', '#007a5a', '#9b59b6', '#d94f70'];
  const colorFor = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
  const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  function inline(parent, text, ctx) {
    const edited = /\s*\(edited\)\s*$/.exec(text);
    if (edited) text = text.slice(0, edited.index);
    const namesAlt = ctx.names.length ? ctx.names.map(esc).join('|') + '|' : '';
    const re = new RegExp(
      '(`[^`\\n]+`)|(https?:\\/\\/[^\\s<>]+)|((?<![\\w/@])@(?:' + namesAlt +
      "[A-Z][\\w'’-]*(?: [A-Z][\\w'’-]+)?|[\\w-]+(?:\\.[\\w-]+)*))", 'g');
    let last = 0, m;
    const plain = (s) => { if (s) parent.append(s); };
    while ((m = re.exec(text))) {
      plain(text.slice(last, m.index));
      last = re.lastIndex;
      if (m[1]) parent.append(el('code', '', m[1].slice(1, -1)));
      else if (m[2]) {
        let url = m[2], tail = '';
        const t = /[.,;:!?'"]+$/.exec(url);
        if (t) { tail = t[0]; url = url.slice(0, -tail.length); }
        while (url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) { url = url.slice(0, -1); tail = ')' + tail; }
        const a = el('a', '', url); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        parent.append(a); plain(tail);
      } else {
        const who = m[3].slice(1).toLowerCase();
        parent.append(el('span', 'mention' + (ctx.me.includes(who) ? ' me' : ''), m[3]));
      }
    }
    plain(text.slice(last));
    if (edited) parent.append(' ', el('span', 'edited', '(edited)'));
  }

  function lines(parent, arr, ctx) {
    arr.forEach((l, i) => { if (i) parent.append(el('br')); inline(parent, l, ctx); });
    return parent;
  }

  function render() {
    const { msgs, names } = parse($('input').value);
    const ctx = { names, me: $('me').value.split(',').map((s) => s.trim().replace(/^@/, '').toLowerCase()).filter(Boolean) };
    const prefix = $('prefix').value.trim();
    const shot = $('shot'), card = $('card');
    shot.className = [$('theme').value === 'dark' ? 'dark' : '', $('framed').checked ? 'framed' : ''].join(' ').trim();
    card.style.width = $('width').value + 'px';
    card.replaceChildren();
    if (!msgs.length) { card.append(el('div', 'empty', 'Paste a conversation on the left to see it here.')); return; }

    for (const m of msgs) {
      const row = el('div', 'msg');
      const av = el('div', 'avatar' + (m.name ? '' : ' none'));
      if (m.name) {
        av.dataset.name = m.name; av.title = 'Click to set a photo for ' + m.name;
        if (avatars[m.name]) { const img = el('img'); img.src = avatars[m.name]; img.alt = ''; av.append(img); }
        else { av.style.background = colorFor(m.name); av.textContent = initials(m.name); }
      }
      const content = el('div', 'content');
      if (m.name) {
        const head = el('div', 'head');
        head.append(el('span', 'name', m.name));
        if (m.time) head.append(el('span', 'time', (prefix ? prefix + ' ' : '') + m.time));
        content.append(head);
      }
      const bodyEl = el('div', 'body');
      for (const b of toBlocks(m.lines)) {
        if (b.t === 'code') bodyEl.append(el('pre', '', b.text));
        else if (b.t === 'li') { const li = el('div', 'li'); li.append(el('span', 'dot', '•'), lines(el('span'), [b.text], ctx)); bodyEl.append(li); }
        else if (b.t === 'quote') bodyEl.append(lines(el('div', 'quote'), b.lines, ctx));
        else bodyEl.append(lines(el('p'), b.lines, ctx));
      }
      content.append(bodyEl);
      row.append(av, content);
      card.append(row);
    }
  }

  // ---------- avatar upload ----------
  let pendingName = null;
  $('card').addEventListener('click', (e) => {
    const av = e.target.closest('.avatar');
    if (!av || !av.dataset.name) return;
    if (avatars[av.dataset.name] && e.altKey) { delete avatars[av.dataset.name]; store.set('avatars', avatars); render(); return; }
    pendingName = av.dataset.name; $('file').value = ''; $('file').click();
  });
  $('file').addEventListener('change', () => {
    const f = $('file').files[0];
    if (!f || !pendingName) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 144;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 144, 144);
      avatars[pendingName] = c.toDataURL('image/png');
      store.set('avatars', avatars);
      URL.revokeObjectURL(img.src);
      render();
    };
    img.src = URL.createObjectURL(f);
  });

  // ---------- export ----------
  const status = (s) => { $('status').textContent = s; };
  let warmed = false;
  async function toBlob() {
    await document.fonts.ready;
    const node = $('shot');
    const opts = { pixelRatio: 2, backgroundColor: getComputedStyle(node).backgroundColor };
    if (!warmed) { await htmlToImage.toBlob(node, opts); warmed = true; } // first pass can miss fonts in Safari
    return htmlToImage.toBlob(node, opts);
  }
  async function run(btn, fn, done) {
    btn.disabled = true; status('Rendering…');
    try { await fn(); status(done); } catch (e) { console.error(e); status('Failed: ' + (e && e.message || e)); }
    btn.disabled = false;
  }
  $('download').addEventListener('click', (e) => run(e.target, async () => {
    const blob = await toBlob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'slack-conversation.png'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'Downloaded.'));
  $('copy').addEventListener('click', (e) => run(e.target, async () => {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob() })]);
  }, 'Copied to clipboard.'));

  // ---------- wiring ----------
  for (const id of ['prefix', 'me', 'theme', 'width', 'framed']) {
    const e = $(id), key = e.type === 'checkbox' ? 'checked' : 'value';
    const saved = store.get(id, null);
    if (saved != null) e[key] = saved;
    e.addEventListener('input', () => { store.set(id, e[key]); render(); });
  }
  $('input').value = SAMPLE;
  $('input').addEventListener('input', render);
  render();
})();
