const WIKIPEDIA_BASE_URL = 'https://en.wikipedia.org/w/api.php';

export async function getSimilarArtists(artistName) {
  const query = artistName?.trim();
  if (!query) return { canonicalName: '', artists: [] };

  const res = await fetch(`/api/similar?artist=${encodeURIComponent(query)}`);
  if (!res.ok) {
    let errorMsg = `Server error ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) errorMsg = data.error;
    } catch (err) {
      console.error('Failed to parse error response:', err);
    }
    throw new Error(errorMsg);
  }

  const data = await res.json();
  if (Array.isArray(data)) {
    return { canonicalName: query, artists: data };
  }

  return {
    canonicalName: data?.canonicalName || query,
    artists: Array.isArray(data?.similar) ? data.similar : [],
  };
}

export async function getWikipediaImages(artistNames = []) {
  const titles = artistNames.map(name => name?.trim()).filter(Boolean);
  if (!titles.length) return {};

  const queryParams = new URLSearchParams({
    action: 'query',
    titles: titles.join('|'),
    prop: 'pageimages',
    format: 'json',
    pithumbsize: '400',
    origin: '*',
  });

  try {
    const res = await fetch(`${WIKIPEDIA_BASE_URL}?${queryParams.toString()}`);
    if (!res.ok) return {};

    const data = await res.json();
    const map = {};
    const pages = Object.values(data?.query?.pages || {});

    for (const page of pages) {
      if (page?.thumbnail?.source && page.title) {
        map[page.title.toLowerCase()] = page.thumbnail.source;
      }
    }
    return map;
  } catch (err) {
    console.error('Wikipedia image fetch failed:', err);
    return {};
  }
}
