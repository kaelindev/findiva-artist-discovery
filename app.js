import { getSimilarArtists, getWikipediaImages } from './js/api.js';
import {
  deduplicateArtists,
  aggregateSimilarityScores,
  calculateMatchPercentage,
  getScoreColor,
} from './js/similarity.js';

const STRINGS = {
  en: {
    label: 'Artist Discovery',
    title: 'Looking for your\nnext diva?',
    sub: 'Find your next artist, same vibe, different name!',
    placeholder: 'Artist name',
    addArtist: 'Add artist',
    upTo: 'Up to 8',
    findBtn: 'Find artists',
    loadSearch: 'Searching similar artists…',
    loadImg: 'Loading artist images…',
    resultsTitle: 'Recommended for you',
    basedOn: 'Based on:',
    noResults: 'No results found. Try different artist names.',
    noInput: 'Enter at least one artist name.',
    errGeneric: 'Something went wrong. Please check your connection and try again.',
    yt: 'YouTube',
    sp: 'Spotify',
    lf: 'Last.fm',
    match: 'match',
  },
  id: {
    label: 'Temukan Artis Baru',
    title: 'Temukan artis favoritmu\nselanjutnya!',
    sub: 'Masukkan artis favoritmu dan temukan yang sevibes.',
    placeholder: 'Nama artis',
    addArtist: 'Tambah artis',
    upTo: 'Maks. 8',
    findBtn: 'Cari Artis',
    loadSearch: 'Mencari artis serupa…',
    loadImg: 'Memuat gambar artis…',
    resultsTitle: 'Rekomendasi untukmu',
    basedOn: 'Berdasarkan:',
    noResults: 'Tidak ada hasil. Coba nama artis yang lain.',
    noInput: 'Masukkan setidaknya satu nama artis.',
    errGeneric: 'Terjadi kesalahan. Periksa koneksimu dan coba lagi.',
    yt: 'YouTube',
    sp: 'Spotify',
    lf: 'Last.fm',
    match: 'cocok',
  },
  ja: {
    label: 'アーティスト探索',
    title: '同じバイブ、まだ知らないアーティスト',
    sub: '好きなアーティストから、次の出会いへ',
    placeholder: 'アーティスト名',
    addArtist: '追加する',
    upTo: '最大8件',
    findBtn: '探す',
    loadSearch: '似たアーティストを検索中…',
    loadImg: '画像を読み込み中…',
    resultsTitle: 'あなたへのおすすめ',
    basedOn: '入力アーティスト:',
    noResults: '結果が見つかりません。別の名前を試してください。',
    noInput: 'アーティスト名を少なくとも1つ入力してください。',
    errGeneric: 'エラーが発生しました。接続を確認して、もう一度お試しください。',
    yt: 'YouTube',
    sp: 'Spotify',
    lf: 'Last.fm',
    match: '一致',
  },
};

const MAX_INPUTS = 8;
const MIN_INPUTS = 1;
let currentLang = 'en';

const langButtons = document.querySelectorAll('.lang-btn');
const discoverBtn = document.getElementById('discoverBtn');
const resultsEl = document.getElementById('results');
const loadingEl = document.getElementById('loading');
const loadingText = document.getElementById('loadingText');
const cardsGrid = document.getElementById('cardsGrid');
const resultsSub = document.getElementById('resultsSub');
const errorMsg = document.getElementById('errorMsg');
const inputsList = document.getElementById('inputsList');
const addBtn = document.getElementById('addBtn');

function t(key) {
  return STRINGS[currentLang]?.[key] ?? STRINGS.en[key] ?? key;
}

function applyLanguage() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    const text = t(key);

    if (key === 'title') {
      el.replaceChildren();
      text.split('\n').forEach((line, index) => {
        if (index > 0) {
          el.appendChild(document.createElement('br'));
        }
        el.appendChild(document.createTextNode(line));
      });
      return;
    }

    el.textContent = text;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  langButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });

  document.documentElement.lang = currentLang;
}

langButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    currentLang = btn.dataset.lang || 'en';
    applyLanguage();
  });
});

function getInputRows() {
  return inputsList ? [...inputsList.querySelectorAll('.input-row')] : [];
}

function updateAddButtonState() {
  if (addBtn) {
    addBtn.disabled = getInputRows().length >= MAX_INPUTS;
  }
}

function renumberInputs() {
  getInputRows().forEach((row, index) => {
    const number = row.querySelector('.input-num');
    if (number) {
      number.textContent = String(index + 1).padStart(2, '0');
    }
  });
}

function createRemoveButton(row) {
  const button = document.createElement('button');
  button.className = 'remove-btn';
  button.type = 'button';
  button.title = 'Remove';
  button.setAttribute('aria-label', 'Remove artist');
  button.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;

  button.addEventListener('click', () => {
    row.remove();
    renumberInputs();
    updateAddButtonState();
    updateRemoveButtonsState();
  });

  return button;
}

function updateRemoveButtonsState() {
  const rows = getInputRows();

  rows.forEach((row) => {
    const existing = row.querySelector('.remove-btn');
    const wrap = row.querySelector('.input-wrap');

    if (rows.length > MIN_INPUTS && !existing && wrap) {
      wrap.appendChild(createRemoveButton(row));
    } else if (rows.length <= MIN_INPUTS && existing) {
      existing.remove();
    }
  });
}

function addInputRow() {
  const count = getInputRows().length;
  if (!inputsList || count >= MAX_INPUTS) return;

  const row = document.createElement('div');
  row.className = 'input-row';

  const wrap = document.createElement('div');
  wrap.className = 'input-wrap';

  const number = document.createElement('span');
  number.className = 'input-num';
  number.textContent = String(count + 1).padStart(2, '0');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'artistField';
  input.placeholder = t('placeholder');
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.dataset.i18nPlaceholder = 'placeholder';

  wrap.append(number, input);

  if (count >= MIN_INPUTS) {
    wrap.appendChild(createRemoveButton(row));
  }

  row.appendChild(wrap);
  inputsList.appendChild(row);

  updateAddButtonState();
  updateRemoveButtonsState();
  input.focus();
}

addBtn?.addEventListener('click', addInputRow);

function hideAllSections() {
  resultsEl?.classList.add('hidden');
  errorMsg?.classList.add('hidden');
  loadingEl?.classList.add('hidden');
  cardsGrid?.replaceChildren();
}

function showError(message) {
  loadingEl?.classList.add('hidden');
  if (errorMsg) {
    errorMsg.textContent = message;
    errorMsg.classList.remove('hidden');
  }
}

function createPlaceholder() {
  const placeholder = document.createElement('div');
  placeholder.className = 'card-img-placeholder';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '48');
  svg.setAttribute('height', '48');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('fill', 'none');
  svg.innerHTML = `
    <circle cx="24" cy="18" r="9" stroke="white" stroke-width="1.5" opacity="0.2"/>
    <path d="M6 42c0-9.94 8.06-18 18-18s18 8.06 18 18" stroke="white" stroke-width="1.5" stroke-linecap="round" opacity="0.2"/>
  `;

  placeholder.appendChild(svg);
  return placeholder;
}

function createPlatformLink(href, className, label, svgPath) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.className = `overlay-link ${className}`;
  link.title = label;
  link.setAttribute('aria-label', label);
  link.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      ${svgPath}
    </svg>
  `;
  return link;
}

function getArtistLinks(name) {
  const encoded = encodeURIComponent(name);
  const lastfmName = name.replace(/ /g, '+');

  return [
    {
      href: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} music`)}`,
      className: 'yt',
      label: t('yt'),
      svg: '<path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/>',
    },
    {
      href: `https://open.spotify.com/search/${encoded}`,
      className: 'sp',
      label: t('sp'),
      svg: '<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.28c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-.99-.12-1.11-.6-.12-.48.12-.99.6-1.11 4.38-1.32 9.78-.66 13.5 1.62.36.18.54.78.21 1.17zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.78 1.02.48 1.56-.3.42-1.02.66-1.62.3z"/>',
    },
    {
      href: `https://www.last.fm/music/${lastfmName}`,
      className: 'lf',
      label: t('lf'),
      svg: '<path d="M10.32 17.4l-.96-2.58s-1.56 1.74-3.9 1.74c-2.07 0-3.54-1.8-3.54-4.68 0-3.69 1.86-5.01 3.69-5.01 2.64 0 3.48 1.71 4.2 3.9l.96 2.97c.96 2.91 2.76 5.25 7.98 5.25 3.75 0 6.3-1.14 6.3-4.17 0-2.43-1.41-3.69-4.02-4.29l-1.95-.42c-1.35-.3-1.74-.84-1.74-1.74 0-1.02.81-1.62 2.13-1.62 1.44 0 2.22.54 2.34 1.83l2.97-.36c-.24-2.67-2.1-3.75-5.16-3.75-2.7 0-5.25 1.02-5.25 4.29 0 2.04.99 3.33 3.48 3.93l2.07.48c1.53.36 2.1.99 2.1 1.95 0 1.17-.99 1.65-3.27 1.65-3.18 0-4.5-1.65-5.25-3.87l-.99-2.97c-1.26-3.87-3.27-5.31-7.2-5.31C2.31 6.42 0 9.06 0 11.88 0 15.12 1.77 18 5.46 18c2.82 0 4.86-1.59 4.86-1.59z"/>',
    },
  ];
}

function createArtistCard(artist, index, maxScore) {
  const percentage = calculateMatchPercentage(artist.score, maxScore);
  const scoreColor = getScoreColor(percentage);

  const card = document.createElement('div');
  card.className = 'artist-card';

  const imageWrap = document.createElement('div');
  imageWrap.className = 'card-img-wrap';

  if (artist.imgUrl) {
    const image = document.createElement('img');
    image.className = 'card-img';
    image.src = artist.imgUrl;
    image.alt = artist.name;
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      imageWrap.replaceChild(createPlaceholder(), image);
    });
    imageWrap.appendChild(image);
  } else {
    imageWrap.appendChild(createPlaceholder());
  }

  const rankBadge = document.createElement('div');
  rankBadge.className = `rank-badge${index < 3 ? ` rank-${index + 1}` : ''}`;
  rankBadge.textContent = `#${index + 1}`;
  imageWrap.appendChild(rankBadge);

  const overlay = document.createElement('div');
  overlay.className = 'card-overlay';

  const links = document.createElement('div');
  links.className = 'overlay-links';

  getArtistLinks(artist.name).forEach(({ href, className, label, svg }) => {
    links.appendChild(createPlatformLink(href, className, label, svg));
  });

  overlay.appendChild(links);
  imageWrap.appendChild(overlay);

  const body = document.createElement('div');
  body.className = 'card-body';

  const name = document.createElement('div');
  name.className = 'card-name';
  name.textContent = artist.name;

  const score = document.createElement('div');
  score.className = 'card-score';
  score.style.color = scoreColor;

  const dot = document.createElement('span');
  dot.style.cssText = `
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${scoreColor};
    margin-right: 5px;
    vertical-align: middle;
  `;

  score.append(dot, document.createTextNode(`${percentage}% ${t('match')}`));

  const scoreBar = document.createElement('div');
  scoreBar.className = 'card-score-bar';

  const scoreFill = document.createElement('div');
  scoreFill.className = 'card-score-fill';
  scoreFill.style.cssText = `width: 0%; background: ${scoreColor};`;

  scoreBar.appendChild(scoreFill);
  body.append(name, score, scoreBar);
  card.append(imageWrap, body);

  requestAnimationFrame(() => {
    setTimeout(() => {
      scoreFill.style.width = `${percentage}%`;
    }, 60 + index * 50);
  });

  return card;
}

function renderResults(artists, seedArtists) {
  if (!cardsGrid) return;

  cardsGrid.replaceChildren();

  const maxScore = artists.length ? artists[0].score : 1;
  const fragment = document.createDocumentFragment();

  artists.forEach((artist, index) => {
    fragment.appendChild(createArtistCard(artist, index, maxScore));
  });

  cardsGrid.appendChild(fragment);

  if (resultsSub) {
    resultsSub.textContent = `${t('basedOn')} ${seedArtists.join(', ')}`;
  }

  resultsEl?.classList.remove('hidden');

  setTimeout(() => {
    resultsEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

async function discoverArtists() {
  if (!inputsList) return;

  const rawInputs = [...inputsList.querySelectorAll('.artistField')]
    .map(input => input.value.trim())
    .filter(Boolean);

  const seedArtists = deduplicateArtists(rawInputs);
  if (!seedArtists.length) {
    showError(t('noInput'));
    return;
  }

  hideAllSections();
  loadingEl?.classList.remove('hidden');
  if (discoverBtn) discoverBtn.disabled = true;

  try {
    if (loadingText) loadingText.textContent = t('loadSearch');

    const results = await Promise.allSettled(
      seedArtists.map(artist => getSimilarArtists(artist))
    );

    // Use canonical/corrected artist names (e.g., "Mistki" -> "Mitski") for the "Based on:" label
    const canonicalSeedArtists = results.map((r, idx) => {
      if (r.status === 'fulfilled' && r.value?.canonicalName) {
        return r.value.canonicalName;
      }
      return seedArtists[idx];
    });

    const similarityResults = results.map(r => ({
      status: r.status,
      value: r.status === 'fulfilled' && Array.isArray(r.value?.artists) ? r.value.artists : [],
      reason: r.reason,
    }));

    const rankedArtists = aggregateSimilarityScores(similarityResults, canonicalSeedArtists);
    const topArtists = rankedArtists.slice(0, 10);

    if (!topArtists.length) {
      showError(t('noResults'));
      return;
    }

    if (loadingText) loadingText.textContent = t('loadImg');

    const imageMap = await getWikipediaImages(topArtists.map(a => a.name));
    const artistsWithImages = topArtists.map(artist => ({
      ...artist,
      imgUrl: imageMap[artist.name.toLowerCase()] || null,
    }));

    // Render recommendations with corrected seed names
    renderResults(artistsWithImages, canonicalSeedArtists);
  } catch (err) {
    console.error('Findiva error:', err);
    showError(t('errGeneric'));
  } finally {
    loadingEl?.classList.add('hidden');
    if (discoverBtn) discoverBtn.disabled = false;
  }
}

discoverBtn?.addEventListener('click', discoverArtists);

applyLanguage();
updateAddButtonState();
updateRemoveButtonsState();
