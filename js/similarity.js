function damerauLevenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }

  return dp[m][n];
}

function cleanString(str = '') {
  return str.toLowerCase().replace(/^(the|dj)\s+/, '').replace(/[^a-z0-9]/g, '');
}

export function normalizeArtistName(name = '') {
  return name.trim().toLowerCase();
}

export function isSameArtistOrTypo(candidateName = '', seedName = '') {
  const normCand = candidateName.trim().toLowerCase();
  const normSeed = seedName.trim().toLowerCase();

  if (!normCand || !normSeed) return false;
  if (normCand === normSeed) return true;

  const cleanCand = cleanString(candidateName);
  const cleanSeed = cleanString(seedName);

  if (cleanCand && cleanSeed && cleanCand === cleanSeed) return true;

  const maxLen = Math.max(cleanCand.length, cleanSeed.length);
  if (maxLen <= 4) return false;

  const dist = damerauLevenshtein(cleanCand, cleanSeed);
  if (maxLen <= 8) return dist <= 1;

  return dist <= 2 || (1 - dist / maxLen) >= 0.82;
}

export function deduplicateArtists(names = []) {
  const result = [];

  for (const raw of names) {
    const name = raw?.trim();
    if (!name) continue;

    const exists = result.some(item => isSameArtistOrTypo(name, item));
    if (!exists) {
      result.push(name);
    }
  }

  return result;
}

export function aggregateSimilarityScores(results = [], seedArtists = []) {
  const scoreMap = {};

  for (const r of results) {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) continue;

    for (const artist of r.value) {
      const name = artist?.name?.trim();
      if (!name) continue;

      // Skip artists that match or are typos of seed artists
      if (seedArtists.some(seed => isSameArtistOrTypo(name, seed))) continue;

      const key = normalizeArtistName(name);
      const match = parseFloat(artist.match || 0);
      if (match <= 0 || isNaN(match)) continue;

      if (!scoreMap[key]) {
        scoreMap[key] = { name: artist.name, score: 0 };
      }
      scoreMap[key].score += match;
    }
  }

  return Object.values(scoreMap).sort((a, b) => b.score - a.score);
}

export function calculateMatchPercentage(score, maxScore) {
  if (!maxScore || maxScore <= 0 || !score || score <= 0) return 0;
  return Math.min(100, Math.round((score / maxScore) * 100));
}

export function getScoreColor(pct) {
  if (pct >= 90) return '#1DB954';
  if (pct >= 70) return '#F5A623';
  return '#E8453C';
}
