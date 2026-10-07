import { createWorker } from 'tesseract.js';

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
  const isManufactureLine = line => /\b(mfg|mfd|manufactur(?:ed|ing)?|date of manufacture|packed (?:on|date)|pkd)\b/i.test(line);
  const hasExpiryMarker = line => /\b(exp(?:iry|iration)?(?:\s+date)?|use\s+(?:by|before)|best\s+(?:before|by)|bb(?:e)?|b\.b\.e)\b/i.test(line);
  const expiryLines = lines.filter(line => hasExpiryMarker(line) && !isManufactureLine(line));
  let expiry = expiryLines.map(expiryFromLine).find(Boolean);
  if (!expiry) {
    const dates = lines.filter(line => !isManufactureLine(line)).map(expiryFromLine).filter(Boolean);
    expiry = dates.find(date => date >= new Date().toISOString().slice(0, 10)) || dates[0] || '';
  }

  const name = lines.find(line => /[A-Za-z]/.test(line) && line.length >= 3 && line.length <= 70 && !hasExpiryMarker(line) && !isManufactureLine(line) && !/\b(batch|lot|ingredients|nutrition|net wt|mrp|barcode)\b/i.test(line) && !expiryFromLine(line)) || '';
  return { name, expiry: expiry || '' };
}

function preprocessImage(source, threshold = false) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('Could not load image for OCR'));
    image.onload = () => {
      const longestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
      const scale = Math.min(2, 2200 / longestSide);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return reject(new Error('Image canvas is unavailable'));
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const luminance = new Uint8Array(canvas.width * canvas.height);
      const histogram = new Uint32Array(256);
      for (let index = 0; index < luminance.length; index += 1) {
        const offset = index * 4;
        const gray = Math.round(pixels.data[offset] * 0.299 + pixels.data[offset + 1] * 0.587 + pixels.data[offset + 2] * 0.114);
        const enhanced = Math.max(0, Math.min(255, Math.round((gray - 128) * 1.45 + 128)));
        luminance[index] = enhanced;
        histogram[enhanced] += 1;
      }

      let cutoff = 145;
      if (threshold) {
        const total = luminance.length;
        let sum = 0;
        for (let value = 0; value < 256; value += 1) sum += value * histogram[value];
        let backgroundWeight = 0;
        let backgroundSum = 0;
        let bestVariance = -1;
        for (let value = 0; value < 256; value += 1) {
          backgroundWeight += histogram[value];
          if (!backgroundWeight) continue;
          const foregroundWeight = total - backgroundWeight;
          if (!foregroundWeight) break;
          backgroundSum += value * histogram[value];
          const backgroundMean = backgroundSum / backgroundWeight;
          const foregroundMean = (sum - backgroundSum) / foregroundWeight;
          const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
          if (variance > bestVariance) { bestVariance = variance; cutoff = value; }
        }
      }

      for (let index = 0; index < luminance.length; index += 1) {
        const value = threshold ? (luminance[index] > cutoff ? 255 : 0) : luminance[index];
        const offset = index * 4;
        pixels.data[offset] = value;
        pixels.data[offset + 1] = value;
        pixels.data[offset + 2] = value;
      }
      context.putImageData(pixels, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', threshold ? 0.94 : 0.9));
    };
    image.src = source;
  });
}

function rateRecognition(data) {
  const details = extractProductDetails(data.text || '');
  const hasDateLabel = /\b(exp(?:iry|iration)?|use\s+(?:by|before)|best\s+(?:before|by)|bb(?:e)?)\b/i.test(data.text || '');
  const score = (data.confidence || 0) + (details.expiry ? 38 : 0) + (details.name ? 14 : 0) + (hasDateLabel ? 12 : 0);
  return { details, score };
}

export async function scanProductImage(image, onProgress = () => {}) {
  let worker;
  try {
    onProgress({ status: 'enhancing label image', progress: 0 });
    const enhanced = await preprocessImage(image).catch(() => image);
    worker = await createWorker('eng', 1, { logger: onProgress });
    await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const first = await worker.recognize(enhanced);
    let best = first.data;
    let bestRating = rateRecognition(best);

    if (!(bestRating.details.name && bestRating.details.expiry && best.confidence >= 72)) {
      onProgress({ status: 'trying clearer text pass', progress: 0 });
      const highContrast = await preprocessImage(image, true).catch(() => enhanced);
      await worker.setParameters({ tessedit_pageseg_mode: '3' });
      const second = await worker.recognize(highContrast);
      const secondRating = rateRecognition(second.data);
      if (secondRating.score > bestRating.score) {
        best = second.data;
        bestRating = secondRating;
      }
    }

    const text = (best.text || '').trim();
    return { text, ...bestRating.details };
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
}
