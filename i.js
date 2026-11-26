(function () {
  'use strict';

  /* ------------------------------------------------------------------
     CONFIG: edit these
  ------------------------------------------------------------------ */
  const CONFIG = {
    web3formsKey: 'YOUR_WEB3FORMS_ACCESS_KEY',
    subject: 'Cyber health check result',
    fromName: 'Cyber Health Check',
    itemsPerFeed: 4
  };

  // Feeds shown in the sidebar. Verify each URL still resolves before launch.
  const FEEDS = [
    { name: 'MITRE ATT&CK blog',  url: 'https://medium.com/feed/mitre-attack' },
    { name: 'ACSC 1',  url: 'https://www.cyber.gov.au/rss/advisories' },
    { name: 'ACSC 2',  url: 'https://www.cyber.gov.au/rss/news' },
    { name: 'ACSC 3',  url: 'https://www.cyber.gov.au/rss/alerts' },
    { name: 'CISA advisories',    url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml' },
    { name: 'Krebs on Security',  url: 'https://krebsonsecurity.com/feed/' },
    { name: 'Schneier on Security', url: 'https://www.schneier.com/feed/atom/' }
  ];

  // Score bands, checked from the top. min is a fraction of the maximum score.
  const BANDS = [
    { min: 0.75, title: 'Lower risk',     text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.' },
    { min: 0.45, title: 'Moderate risk',  text: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo.' },
    { min: 0,    title: 'Elevated risk',  text: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.' }
  ];

  /* ------------------------------------------------------------------
     QUESTIONS: replace the lorem ipsum
     Text questions: options are {label, points}.
     Image questions: two images, give points 2 to the correct one, 0 to the other.
  ------------------------------------------------------------------ */
  const opt = (label, points) => ({ label, points });
  const textOptions = () => [
    opt('Lorem ipsum dolor sit amet', 2),
    opt('Consectetur adipiscing elit', 1),
    opt('Sed do eiusmod tempor incididunt', 0)
  ];

  const QUESTIONS = [
    { type: 'text',  prompt: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit?', options: textOptions() },
    { type: 'text',  prompt: 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua?', options: textOptions() },
    { type: 'text',  prompt: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco?', options: textOptions() },
    { type: 'image', prompt: 'Which of these messages is the phishing attempt?',
      note: 'Select Enlarge to inspect each image, then choose one.',
      images: [
        { src: 'images/phish-1-a.jpg', alt: 'Message A', points: 0 },
        { src: 'images/phish-1-b.jpg', alt: 'Message B', points: 2 }
      ] },
    { type: 'text',  prompt: 'Duis aute irure dolor in reprehenderit in voluptate velit?', options: textOptions() },
    { type: 'text',  prompt: 'Excepteur sint occaecat cupidatat non proident?', options: textOptions() },
    { type: 'text',  prompt: 'Sunt in culpa qui officia deserunt mollit anim id est laborum?', options: textOptions() },
    { type: 'image', prompt: 'Which of these pages is the fake login?',
      note: 'Select Enlarge to inspect each image, then choose one.',
      images: [
        { src: 'images/phish-2-a.jpg', alt: 'Page A', points: 2 },
        { src: 'images/phish-2-b.jpg', alt: 'Page B', points: 0 }
      ] },
    { type: 'text',  prompt: 'Curabitur pretium tincidunt lacus, nulla gravida orci a odio?', options: textOptions() },
    { type: 'text',  prompt: 'Nullam varius, turpis et commodo pharetra, est eros bibendum elit?', options: textOptions() }
  ];

  /* ------------------------------------------------------------------
     Helpers
  ------------------------------------------------------------------ */
  const $ = (sel, root) => (root || document).querySelector(sel);
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function placeholderImage(label) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
      '<rect width="800" height="600" fill="#eef2f5"/>' +
      '<rect x="40" y="40" width="720" height="520" fill="none" stroke="#aebdc6" stroke-width="2" stroke-dasharray="10 8"/>' +
      '<text x="400" y="310" font-family="sans-serif" font-size="32" fill="#566873" text-anchor="middle">' + label + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function safeUrl(u) {
    try {
      const p = new URL(u, location.href);
      return (p.protocol === 'http:' || p.protocol === 'https:') ? p.href : '#';
    } catch (e) { return '#'; }
  }

  /* ------------------------------------------------------------------
     RSS feeds (client side)
  ------------------------------------------------------------------ */
  const ROUTES = [
    u => 'https://feeds.cyberhealthcheck.org/?u=' + encodeURIComponent(u)
  ];

  async function fetchFeedText(url) {
    let lastErr = new Error('No route');
    for (const route of ROUTES) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(route(url), { signal: ctrl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        if (!/<(rss|feed|rdf)/i.test(text)) throw new Error('Not a feed');
        return text;
      } catch (e) {
        lastErr = e;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  }

  function parseFeed(xml) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Parse error');
    return Array.from(doc.querySelectorAll('item, entry')).map(n => {
      const title = (n.querySelector('title') || {}).textContent;
      const linkEl = n.querySelector('link[rel="alternate"], link');
      const link = linkEl ? (linkEl.getAttribute('href') || linkEl.textContent.trim()) : '';
      const dateEl = n.querySelector('pubDate, published, updated, date');
      const d = dateEl ? new Date(dateEl.textContent.trim()) : null;
      return {
        title: (title || 'Untitled').trim(),
        link: link,
        date: d && !isNaN(d) ? d : null
      };
    });
  }

  async function loadFeeds() {
    const root = $('#feeds');
    root.textContent = '';

    const box = el('section', 'feed');
    box.appendChild(el('h3', null, ''));
    const status = el('p', 'state', 'Loading...');
    box.appendChild(status);
    root.appendChild(box);

    const feedStore = {
      items: [],
      errors: {}
    };

    await Promise.all(
      FEEDS.map(async feed => {
        try {
          const items = parseFeed(await fetchFeedText(feed.url))
            .slice(0, CONFIG.itemsPerFeed)
            .map(it => ({
              ...it,
              feedName: feed.name
            }));

          feedStore.items.push(...items);
        } catch (e) {
          feedStore.errors[feed.name] = e;
        }
      })
    );

    feedStore.items.sort((a, b) => {
      const timeA = a.date ? a.date.getTime() : -Infinity;
      const timeB = b.date ? b.date.getTime() : -Infinity;
      return timeB - timeA;
    });

    if (!feedStore.items.length) {
      status.textContent = 'This feed could not be loaded right now.';
      return;
    }

    const ul = el('ul');
    feedStore.items.forEach(it => {
      const li = el('li');
      const a = el('a', null, it.title);
      a.href = safeUrl(it.link);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.appendChild(a);
      ul.appendChild(li);
    });
    status.replaceWith(ul);
  }

  /* ------------------------------------------------------------------
     Quiz rendering
  ------------------------------------------------------------------ */
  const form = $('#quizForm');
  const qRoot = $('#questions');
  const zoom = $('#zoom');
  const zoomImg = $('#zoomImg');
  const zoomBody = $('#zoomBody');
  let zoomTarget = null;

  function renderQuestions() {
    qRoot.innerHTML = '';
    QUESTIONS.forEach((q, i) => {
      const fs = el('fieldset', 'q');
      const legend = el('legend');
      legend.appendChild(el('span', 'qn', (i + 1) + '.'));
      legend.appendChild(document.createTextNode(q.prompt));
      fs.appendChild(legend);
      if (q.note) fs.appendChild(el('p', 'qnote', q.note));

      if (q.type === 'text') {
        q.options.forEach((o, j) => {
          const label = el('label', 'option');
          const input = el('input');
          input.type = 'radio';
          input.name = 'q' + i;
          input.value = String(j);
          label.appendChild(input);
          label.appendChild(el('span', null, o.label));
          fs.appendChild(label);
        });
      } else {
        const grid = el('div', 'row g-3 row-cols-1 row-cols-sm-2');
        q.images.forEach((im, j) => {
          const col = el('div', 'col');
          const card = el('div', 'img-choice');
          const label = el('label');
          const img = el('img');
          img.alt = im.alt;
          img.loading = 'lazy';
          img.addEventListener('error', function onErr() {
            img.removeEventListener('error', onErr);
            img.src = placeholderImage(im.alt + ' (add image)');
          });
          img.src = im.src;
          const pick = el('div', 'pick');
          const input = el('input');
          input.type = 'radio';
          input.name = 'q' + i;
          input.value = String(j);
          pick.appendChild(input);
          pick.appendChild(el('span', null, im.alt));
          label.appendChild(img);
          label.appendChild(pick);
          const btn = el('button', 'zoom-btn', 'Enlarge');
          btn.type = 'button';
          btn.setAttribute('aria-label', 'Enlarge ' + im.alt);
          btn.addEventListener('click', () => openZoom(img, input, im.alt));
          card.appendChild(label);
          card.appendChild(btn);
          col.appendChild(card);
          grid.appendChild(col);
        });
        fs.appendChild(grid);
      }
      fs.appendChild(el('p', 'q-error', 'Choose an answer to continue.'));
      qRoot.appendChild(fs);
    });
    updateProgress();
  }

  function answeredCount() {
    return QUESTIONS.filter((q, i) => form.querySelector('input[name="q' + i + '"]:checked')).length;
  }
  function updateProgress() {
    const n = answeredCount();
    const pct = Math.round((n / QUESTIONS.length) * 100);
    $('#progressText').textContent = n + ' of ' + QUESTIONS.length + ' answered';
    const bar = $('#progressBar');
    bar.style.width = (n / QUESTIONS.length * 100) + '%';
    const progressWrap = bar.closest('.progress');
    if (progressWrap) progressWrap.setAttribute('aria-valuenow', String(pct));
  }
  form.addEventListener('change', e => {
    if (e.target.matches('input[type="radio"]')) {
      const fs = e.target.closest('fieldset');
      if (fs) fs.classList.remove('unanswered');
      updateProgress();
    }
  });

  /* ------------------------------------------------------------------
     Image zoom modal
  ------------------------------------------------------------------ */
  function openZoom(img, input, caption) {
    zoomImg.src = img.currentSrc || img.src;
    zoomImg.alt = img.alt;
    $('#zoomCap').textContent = caption;
    zoomTarget = input;
    zoomBody.classList.remove('full');
    zoom.showModal();
  }
  zoomImg.addEventListener('click', () => zoomBody.classList.toggle('full'));
  $('#zoomClose').addEventListener('click', () => zoom.close());
  $('#zoomSelect').addEventListener('click', () => {
    if (zoomTarget) {
      zoomTarget.checked = true;
      zoomTarget.dispatchEvent(new Event('change', { bubbles: true }));
    }
    zoom.close();
  });
  zoom.addEventListener('click', e => { if (e.target === zoom) zoom.close(); });

  /* ------------------------------------------------------------------
     Scoring and submission
  ------------------------------------------------------------------ */
  function collect() {
    let score = 0, max = 0;
    const lines = [];
    QUESTIONS.forEach((q, i) => {
      const chosen = Number(form.querySelector('input[name="q' + i + '"]:checked').value);
      const choices = q.type === 'text' ? q.options : q.images;
      const best = Math.max.apply(null, choices.map(c => c.points));
      const pick = choices[chosen];
      score += pick.points;
      max += best;
      lines.push('Q' + (i + 1) + '. ' + q.prompt + '\n    Answer: ' + (pick.label || pick.alt) + ' (' + pick.points + '/' + best + ')');
    });
    return { score, max, lines };
  }

  function bandFor(ratio) {
    return BANDS.find(b => ratio >= b.min) || BANDS[BANDS.length - 1];
  }

  async function sendResult(payload) {
    const key = CONFIG.web3formsKey;
    if (!key || key.indexOf('YOUR_') === 0) return { ok: false, notConfigured: true };
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(Object.assign({ access_key: key }, payload))
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok && data.success === true, message: data.message };
    } catch (e) {
      return { ok: false, message: 'Network error' };
    }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();

    let firstMissing = null;
    QUESTIONS.forEach((q, i) => {
      const fs = qRoot.children[i];
      const missing = !form.querySelector('input[name="q' + i + '"]:checked');
      fs.classList.toggle('unanswered', missing);
      if (missing && !firstMissing) firstMissing = fs;
    });
    if (firstMissing) {
      firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const r = firstMissing.querySelector('input');
      if (r) r.focus({ preventScroll: true });
      return;
    }

    const { score, max, lines } = collect();
    const ratio = max ? score / max : 0;
    const band = bandFor(ratio);
    const pct = Math.round(ratio * 100);

    const btn = $('#submitBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    const email = form.email.value.trim();
    const payload = {
      subject: CONFIG.subject + ': ' + score + '/' + max + ' (' + band.title + ')',
      from_name: CONFIG.fromName,
      message: 'Score: ' + score + ' / ' + max + ' (' + pct + '%)\nBand: ' + band.title + '\n\n' + lines.join('\n\n'),
      score: score + '/' + max,
      band: band.title,
      botcheck: form.botcheck.checked
    };
    if (email) payload.email = email;

    const outcome = await sendResult(payload);

    $('#scoreNum').textContent = score;
    $('#scoreMax').textContent = '/ ' + max;
    const meter = $('#scoreMeter');
    meter.style.width = pct + '%';
    const meterWrap = meter.closest('.progress');
    if (meterWrap) meterWrap.setAttribute('aria-valuenow', String(pct));
    $('#bandTitle').textContent = band.title;
    $('#bandText').textContent = band.text;
    const status = $('#sendStatus');
    status.classList.toggle('bad', !outcome.ok);
    if (outcome.ok) {
      status.textContent = 'Your answers have been sent to us. We appreciate your time.';
    } else if (outcome.notConfigured) {
      status.textContent = 'Results were not emailed because no Web3Forms access key is set.';
    } else {
      status.textContent = 'We could not send your answers' + (outcome.message ? ' (' + outcome.message + ')' : '') + '. Your score is shown above.';
    }

    form.hidden = true;
    $('.lede', $('#quiz')).hidden = true;
    const result = $('#result');
    result.hidden = false;
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    result.focus({ preventScroll: true });
    btn.disabled = false;
    btn.textContent = 'Get my result';
  });

  $('#retake').addEventListener('click', () => {
    form.reset();
    renderQuestions();
    form.hidden = false;
    $('.lede', $('#quiz')).hidden = false;
    $('#result').hidden = true;
    $('#quiz').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  renderQuestions();
  loadFeeds();
})();
