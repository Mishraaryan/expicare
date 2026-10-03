import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Camera, Check, ImagePlus, LoaderCircle, RefreshCw, ScanLine, ShieldCheck } from 'lucide-react';
import { scanProductImage } from './ocr.js';

const categories = ['Produce','Dairy','Bakery','Pantry','Dairy alternatives','Healthcare','Other'];

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return reject(new Error('Image canvas is unavailable'));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function Scanner({ onBack, onSave }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cameraRequestRef = useRef(0);
  const lookupRef = useRef(null);
  const lookupAbortRef = useRef(null);
  const [camera, setCamera] = useState('starting');
  const [photo, setPhoto] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [scanText, setScanText] = useState('');
  const [barcodeStatus, setBarcodeStatus] = useState('Barcode ko camera ke saamne rakhein; product details automatically dhundhenge.');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', expiry: '', brand: '', category: 'Other', quantity: '', location: '', reminder: true });
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const lookupBarcode = async code => {
    if (!/^\d{8,14}$/.test(code)) {
      setBarcodeStatus(`Barcode ${code} mila, lekin yeh product code jaisa nahi lagta.`);
      return;
    }
    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    setBarcodeStatus(`Barcode ${code} mila. Product details dhundh rahe hain…`);
    try {
      const fields = 'product_name,brands,categories,categories_tags,quantity,product_quantity,product_quantity_unit,image_front_url';
      const response = await fetch(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}.json?fields=${fields}`, { signal: controller.signal });
      if (response.status === 404) {
        setBarcodeStatus(`Barcode ${code} database mein nahi mila. Label photo scan karke naam/date bharein.`);
        return;
      }
      if (!response.ok) throw new Error('lookup failed');
      const payload = await response.json();
      const product = payload.product;
      if (!product || payload.status === 'failure' || payload.status === 0) {
        setBarcodeStatus(`Barcode ${code} database mein nahi mila. Label photo scan karke naam/date bharein.`);
        return;
      }
      const productName = product.product_name?.trim() || product.abbreviated_product_name?.trim() || '';
      const brand = product.brands?.split(',')[0]?.trim() || '';
      const categoryText = `${product.categories || ''} ${(product.categories_tags || []).join(' ')}`.toLowerCase();
      let category = '';
      if (/oat|soy|soya|almond|plant.?based|dairy.?alternative/.test(categoryText)) category = 'Dairy alternatives';
      else if (/dairy|milk|cheese|yogurt|yoghurt/.test(categoryText)) category = 'Dairy';
      else if (/bakery|bread|pastr|cake/.test(categoryText)) category = 'Bakery';
      else if (/fruit|vegetable|produce/.test(categoryText)) category = 'Produce';
      else if (/health|vitamin|medicine/.test(categoryText)) category = 'Healthcare';
      else if (categoryText) category = 'Pantry';
      const quantity = product.quantity?.trim() || (product.product_quantity ? `${product.product_quantity} ${product.product_quantity_unit || ''}`.trim() : '');
      setForm(current => ({
        ...current,
        ...(productName ? { name: productName } : {}),
        ...(brand ? { brand } : {}),
        ...(category ? { category } : {}),
        ...(quantity ? { quantity } : {}),
        barcode: code,
        ...(product.image_front_url && !current.photo ? { photo: product.image_front_url } : {})
      }));
      setBarcodeStatus(productName || brand
        ? `Details mil gayin${productName ? `: ${productName}` : ''}. Expiry date ke liye label photo scan karein ya date bharein.`
        : `Barcode ${code} mila, par database mein product details khaali hain. Label scan ya manual entry karein.`);
    } catch (lookupError) {
      if (lookupAbortRef.current === controller) {
        if (lookupError.name === 'AbortError') setBarcodeStatus('Product lookup mein der hui. Internet check karein, ya label photo scan karein.');
        else setBarcodeStatus('Product database abhi nahi khul paaya. Label photo scan karke details bharein.');
      }
    } finally {
      clearTimeout(timeout);
      if (lookupAbortRef.current === controller) lookupAbortRef.current = null;
    }
  };
  lookupRef.current = lookupBarcode;

  const startCamera = useCallback(async () => {
    const requestId = ++cameraRequestRef.current;
    let stream;
    setCamera('starting'); setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhoto(''); setCamera('ready');
    } catch {
      if (requestId === cameraRequestRef.current) {
        stream?.getTracks().forEach(track => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        setCamera('unavailable');
        setError('Camera access nahi mila. Permission allow karein, ya label ki photo upload karein.');
      }
    }
  }, []);

  useEffect(() => { startCamera(); return stopCamera; }, [startCamera, stopCamera]);
  useEffect(() => {
    const video = videoRef.current;
    if (camera === 'ready' && streamRef.current && video) {
      video.srcObject = streamRef.current;
      video.play().catch(() => setError('Camera preview start nahi ho paaya.'));
    }
  }, [camera, photo]);
  useEffect(() => {
    if (camera !== 'ready' || photo) return undefined;
    let active = true;
    let detecting = false;
    let lastCode = '';
    let detector;
    let interval;
    const setup = async () => {
      if (!('BarcodeDetector' in globalThis)) {
        setBarcodeStatus('Is browser mein automatic barcode scan available nahi hai. Label photo capture karke OCR use karein.');
        return;
      }
      try {
        const supported = await globalThis.BarcodeDetector.getSupportedFormats();
        const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128'].filter(format => supported.includes(format));
        if (!formats.length) throw new Error('No supported product barcode format');
        detector = new globalThis.BarcodeDetector({ formats });
        setBarcodeStatus('Barcode ko camera ke saamne rakhein; product details automatically dhundhenge.');
        interval = setInterval(async () => {
          const video = videoRef.current;
          if (!active || detecting || !video || video.readyState < 2) return;
          detecting = true;
          try {
            const results = await detector.detect(video);
            const code = results.find(result => result.rawValue)?.rawValue;
            if (active && code && code !== lastCode) {
              lastCode = code;
              await lookupRef.current?.(code);
            }
          } catch { /* Keep the live camera ready for another frame. */ }
          finally { detecting = false; }
        }, 500);
      } catch {
        setBarcodeStatus('Barcode scan start nahi ho paaya. Label photo capture karke OCR use karein.');
      }
    };
    setup();
    return () => {
      active = false;
      if (interval) clearInterval(interval);
    };
  }, [camera, photo]);
  useEffect(() => () => {
    const controller = lookupAbortRef.current;
    lookupAbortRef.current = null;
    controller?.abort();
  }, []);

  const recognize = async image => {
    setScanning(true); setProgress(0); setStage('OCR taiyar ho raha hai…'); setError(''); setScanText('');
    try {
      const result = await scanProductImage(image, message => {
        if (message.status === 'loading language traineddata') setStage('English text data load ho raha hai…');
        if (message.status === 'recognizing text') { setStage('Label padha ja raha hai…'); setProgress(Math.round((message.progress || 0) * 100)); }
      });
      setScanText(result.text);
      setForm(current => ({ ...current, ...(result.name ? { name: result.name } : {}), ...(result.expiry ? { expiry: result.expiry } : {}) }));
      if (!result.name && !result.expiry) setError('Photo scan ho gayi, lekin naam/date nahi pehchan paaya. Details manually bhar dein.');
      else if (!result.expiry) setError('Naam detect hua; expiry date nahi mili. Date manually bharein.');
      else if (!result.name) setError('Expiry date detect hui; product name manually bharein.');
    } catch {
      setError('Scan nahi ho saka. Internet check karke dobara try karein, ya details manually bharein.');
    } finally { setScanning(false); setStage(''); }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return setError('Camera abhi taiyar nahi hai. Ek pal baad phir try karein.');
    const scale = Math.min(1, 1400 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) return setError('Camera image capture nahi ho payi.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', .82);
    setPhoto(image); setCamera('captured'); stopCamera(); await recognize(image);
  };

  const upload = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 8e6) return setError('Photo 8 MB se chhoti honi chahiye.');
    try { const image = await compressImage(file); setPhoto(image); setCamera('captured'); stopCamera(); await recognize(image); }
    catch { setError('Photo padh nahi paaya. Doosri image try karein.'); }
  };

  const save = event => {
    event.preventDefault(); setError('');
    if (!form.name.trim()) return setError('Product ka naam check karke bharein.');
    if (!form.expiry) return setError('Expiry date check karke bharein.');
    onSave({ ...form, name: form.name.trim(), photo: photo || form.photo, emoji: '📦', added: new Date().toISOString().slice(0, 10), id: String(Date.now()) });
  };

  return <div className="scanner-page">
    <button className="back" onClick={onBack}><ArrowLeft size={16}/> Back</button>
    <div className="page-title scanner-title"><div><div className="eyebrow">CAMERA + BARCODE + OCR</div><h1>Scan a product</h1><p>Barcode se catalog details laayein; label scan karke expiry date padhein.</p></div></div>
    <div className="scanner-grid">
      <section className="panel scanner-camera-panel">
        <div className="camera-stage">
          {photo ? <img className="camera-image" src={photo} alt="Captured product label"/> : <video ref={videoRef} className="camera-video" autoPlay muted playsInline aria-label="Live product label camera"/>}
          {!photo && camera === 'ready' && <div className="camera-frame" aria-hidden="true"><i/><i/><i/><i/></div>}
          {!photo && camera === 'starting' && <div className="camera-placeholder"><LoaderCircle className="spin" size={24}/><span>Camera open ho raha hai…</span></div>}
          {!photo && camera === 'unavailable' && <div className="camera-placeholder"><Camera size={26}/><span>Camera available nahi hai</span></div>}
          {!photo && camera === 'ready' && <div className="barcode-guide"><ScanLine size={16}/><span>Barcode ko frame mein rakhein</span></div>}
        </div>
        <div className="camera-actions">
          {camera === 'ready' && !photo ? <button className="primary capture-button" onClick={capture}><ScanLine size={17}/> Capture & scan</button> : null}
          {(camera === 'unavailable' || photo) && <label className="secondary upload-camera"><ImagePlus size={16}/>{photo ? 'Choose another photo' : 'Upload label photo'}<input type="file" accept="image/*" capture="environment" onChange={upload}/></label>}
          {photo && !scanning && <button className="secondary" onClick={startCamera}><RefreshCw size={15}/> Retake</button>}
          {scanning && <span className="scan-live"><LoaderCircle size={15} className="spin"/> {progress}%</span>}
        </div>
        {scanning && <div className="scanner-progress" aria-live="polite"><span>{stage}</span><div><i style={{ width: `${Math.max(progress, 8)}%` }}/></div></div>}
        {(camera === 'ready' || (form.barcode && camera !== 'starting')) && <p className="barcode-status" aria-live="polite">{barcodeStatus}</p>}
        <div className="privacy-note"><ShieldCheck size={15}/><span>Label photo browser mein OCR hoti hai. Barcode number product catalogue lookup ke liye Open Food Facts ko bheja jata hai.</span></div>
      </section>

      <section className="panel scanner-review">
        <div className="review-heading"><span className="review-icon"><Check size={17}/></span><div><h2>Review details</h2><p>OCR suggestions can be edited before saving.</p></div></div>
        <form onSubmit={save} className="scanner-form">
          <label className="field"><span>Product name <i>*</i></span><input maxLength="70" value={form.name} onChange={event => set('name', event.target.value)} placeholder="Detected name or enter it"/></label>
          <label className="field"><span>Expiry / best-before date <i>*</i></span><input type="date" value={form.expiry} onChange={event => set('expiry', event.target.value)}/></label>
          <div className="scanner-two-col"><label className="field"><span>Brand</span><input maxLength="50" value={form.brand} onChange={event => set('brand', event.target.value)} placeholder="Optional"/></label><label className="field"><span>Category</span><select value={form.category} onChange={event => set('category', event.target.value)}>{categories.map(category => <option key={category}>{category}</option>)}</select></label></div>
          <div className="scanner-two-col"><label className="field"><span>Quantity</span><input maxLength="40" value={form.quantity} onChange={event => set('quantity', event.target.value)} placeholder="Optional"/></label><label className="field"><span>Storage location</span><input maxLength="60" value={form.location} onChange={event => set('location', event.target.value)} placeholder="Optional"/></label></div>
          <label className="scanner-reminder"><input type="checkbox" checked={form.reminder} onChange={event => set('reminder', event.target.checked)}/><span>Remind me 3 days before expiry</span></label>
          {error && <p className="scanner-error"><AlertTriangle size={15}/>{error}</p>}
          {scanText && <details className="ocr-result"><summary>View scanned text</summary><pre>{scanText}</pre></details>}
          <button className="primary save-scanned" type="submit" disabled={scanning}><Check size={16}/> Save product</button>
          <p className="scanner-hint">Check the label once more—OCR can misread small or blurry text.</p>
        </form>
      </section>
    </div>
  </div>;
}
