const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

function isoDate(year, month, day) {
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function expiryFromLine(line) {
  const value = line.replace(/[|]/g, '1').replace(/\s+/g, ' ').trim();
  let match = value.match(/\b(20\d{2})[./-](0?[1-9]|1[0-2])[./-](0?[1-9]|[12]\d|3[01])\b/);
  if (match) return isoDate(match[1], match[2], match[3]);

  match = value.match(/\b(0?[1-9]|[12]\d|3[01])[./-](0?[1-9]|1[0-2])[./-](\d{2}|20\d{2})\b/);
  if (match) return isoDate(Number(match[3]) < 100 ? 2000 + Number(match[3]) : match[3], match[2], match[1]);

  match = value.match(/\b(0?[1-9]|1[0-2])[./-](\d{2}|20\d{2})\b/);
  if (match) {
    const year = Number(match[2]) < 100 ? 2000 + Number(match[2]) : Number(match[2]);
    return isoDate(year, match[1], new Date(year, Number(match[1]), 0).getDate());
  }

  const monthPattern = Object.keys(MONTHS).join('|');
  match = value.match(new RegExp(`\\b(\\d{1,2})\\s*(${monthPattern})[,. ]+((?:20)?\\d{2})\\b`, 'i'));
  if (match) return isoDate(Number(match[3]) < 100 ? 2000 + Number(match[3]) : match[3], MONTHS[match[2].toLowerCase()], match[1]);
  match = value.match(new RegExp(`\\b(${monthPattern})\\s*(\\d{1,2})[,. ]+((?:20)?\\d{2})\\b`, 'i'));
  if (match) return isoDate(Number(match[3]) < 100 ? 2000 + Number(match[3]) : match[3], MONTHS[match[1].toLowerCase()], match[2]);
  return null;
}

export function extractProductDetails(rawText) {
  const lines = rawText.split(/\r?\n/).map(line => line.replace(/[^\p{L}\p{N}\s:/.\-,]/gu, ' ').trim()).filter(Boolean);
  const expiryLines = lines.filter(line => /\b(exp(?:iry|iration)?|use by|best before|bb(?:e)?)\b/i.test(line) && !/\b(mfg|manufactur(?:ed|ing)?|packed on)\b/i.test(line));
  let expiry = expiryLines.map(expiryFromLine).find(Boolean);
  if (!expiry) {
    const dates = lines.map(expiryFromLine).filter(Boolean);
    expiry = dates.find(date => date >= new Date().toISOString().slice(0, 10)) || dates[0] || '';
  }

  const name = lines.find(line => /[A-Za-z]/.test(line) && line.length >= 3 && line.length <= 70 && !/\b(exp|expiry|expiration|best before|use by|mfg|manufactur|packed on|batch|lot|ingredients|nutrition|net wt|mrp|barcode)\b/i.test(line) && !expiryFromLine(line)) || '';
  return { name, expiry: expiry || '' };
}
