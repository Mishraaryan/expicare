import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Camera, Check, Flashlight, FlashlightOff, ImagePlus, LoaderCircle, RefreshCw, ScanLine, ShieldCheck } from 'lucide-react';
import { scanProductImage } from './ocr.js';
import { useTranslation } from './i18n.jsx';

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
  const { language, t } = useTranslation();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cameraRequestRef = useRef(0);
  const lookupRef = useRef(null);
  const lookupAbortRef = useRef(null);
  const [camera, setCamera] = useState('starting');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchBusy, setTorchBusy] = useState(false);
  const [torchMessage, setTorchMessage] = useState('');
  const [photo, setPhoto] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [scanText, setScanText] = useState('');
  const [barcodeStatus, setBarcodeStatus] = useState({ key: 'Keep the barcode in front of the camera; product details will be looked up automatically.', values: {} });
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', expiry: '', brand: '', category: 'Other', quantity: '', location: '', reminder: true });
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const showBarcodeStatus = (key, values = {}) => setBarcodeStatus({ key, values });
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const alreadyExpired = Boolean(form.expiry && form.expiry < todayString);
  const formattedExpiry = form.expiry ? new Date(`${form.expiry}T12:00:00`).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const stopCamera = useCallback((resetTorch = false) => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (resetTorch) {
      setTorchOn(false);
      setTorchSupported(false);
      setTorchMessage('');
    }
  }, []);

  const lookupBarcode = async code => {
    if (!/^\d{8,14}$/.test(code)) {
      showBarcodeStatus('Barcode {code} does not look like a product code.', { code });
      return;
    }
    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    showBarcodeStatus('Barcode {code} found. Looking up product details…', { code });
    try {
      const fields = 'product_name,brands,categories,categories_tags,quantity,product_quantity,product_quantity_unit,image_front_url';
      const response = await fetch(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(code)}.json?fields=${fields}`, { signal: controller.signal });
      if (response.status === 404) {
        showBarcodeStatus('Barcode {code} was not found in the product database. Scan the label or enter details.', { code });
        return;
      }
      if (!response.ok) throw new Error('lookup failed');
      const payload = await response.json();
      const product = payload.product;
      if (!product || payload.status === 'failure' || payload.status === 0) {
        showBarcodeStatus('Barcode {code} was not found in the product database. Scan the label or enter details.', { code });
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
      if (productName || brand) showBarcodeStatus('Product details found{productName}. The barcode does not contain an expiry date; scan the label or enter the date.', { productName: productName ? `: ${productName}` : '' });
      else showBarcodeStatus('Barcode {code} was found, but product details are unavailable. Scan the label or enter details.', { code });
    } catch (lookupError) {
      if (lookupAbortRef.current === controller) {
        if (lookupError.name === 'AbortError') showBarcodeStatus('Product lookup timed out. Check your internet connection or scan the label photo.');
        else showBarcodeStatus('Product database is unavailable. Scan the label photo or enter details manually.');
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
      const videoTrack = stream.getVideoTracks()[0];
      let supportsTorch = false;
      try { supportsTorch = Boolean(videoTrack?.getCapabilities?.().torch); } catch { /* Some browsers do not expose camera capabilities. */ }
      setTorchSupported(supportsTorch);
      setTorchOn(false);
      setTorchMessage(supportsTorch ? '' : 'Flashlight is not supported by this camera.');
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
        setError('Camera permission was not granted. Allow access or upload a label photo.');
      }
    }
  }, []);

  const toggleTorch = async () => {
    if (torchBusy) return;
    const videoTrack = streamRef.current?.getVideoTracks()[0];
    if (!videoTrack?.applyConstraints) {
      setTorchMessage('Flashlight is not supported by this camera.');
      return;
    }
    const nextTorchState = !torchOn;
    setTorchBusy(true);
    try {
      await videoTrack.applyConstraints({ advanced: [{ torch: nextTorchState }] });
      setTorchOn(nextTorchState);
      setTorchMessage('');
    } catch {
      setTorchMessage('Could not switch the flashlight. Try again or continue without it.');
    } finally { setTorchBusy(false); }
  };

  useEffect(() => { startCamera(); return stopCamera; }, [startCamera, stopCamera]);
  useEffect(() => {
    const video = videoRef.current;
    if (camera === 'ready' && streamRef.current && video) {
      video.srcObject = streamRef.current;
      video.play().catch(() => setError('Camera preview could not start.'));
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
        showBarcodeStatus('Automatic barcode scanning is not available in this browser. Capture a label photo to use OCR.');
        return;
      }
      try {
        const supported = await globalThis.BarcodeDetector.getSupportedFormats();
        const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'code_128'].filter(format => supported.includes(format));
        if (!formats.length) throw new Error('No supported product barcode format');
        detector = new globalThis.BarcodeDetector({ formats });
        showBarcodeStatus('Keep the barcode in front of the camera; product details will be looked up automatically.');
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
        showBarcodeStatus('Barcode scanning could not start. Capture a label photo to use OCR.');
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
    setScanning(true); setProgress(0); setStage('Preparing OCR…'); setError(''); setScanText('');
    try {
      const result = await scanProductImage(image, message => {
        if (message.status === 'enhancing label image') setStage('Improving label image…');
        if (message.status === 'trying clearer text pass') setStage('Trying another text-reading pass…');
        if (message.status === 'loading language traineddata') setStage('Loading English text data…');
        if (message.status === 'recognizing text') { setStage('Reading label…'); setProgress(Math.round((message.progress || 0) * 100)); }
      });
      setScanText(result.text);
      setForm(current => ({ ...current, ...(result.name ? { name: result.name } : {}), ...(result.expiry ? { expiry: result.expiry } : {}) }));
      if (!result.name && !result.expiry) setError('Photo scan finished, but the name or expiry date could not be identified. Enter details manually.');
      else if (!result.expiry) setError('Name detected; expiry date was not found. Enter the date manually.');
      else if (!result.name) setError('Expiry date detected; product name was not found. Enter the name manually.');
    } catch {
      setError('Scan failed. Check your internet connection and try again, or enter details manually.');
    } finally { setScanning(false); setStage(''); }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return setError('Camera is not ready yet. Try again in a moment.');
    const scale = Math.min(1, 1400 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) return setError('Camera image could not be captured.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', .82);
    setPhoto(image); setCamera('captured'); stopCamera(true); await recognize(image);
  };

  const upload = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 8e6) return setError('Photo must be smaller than 8 MB.');
    try { const image = await compressImage(file); setPhoto(image); setCamera('captured'); stopCamera(true); await recognize(image); }
    catch { setError('Could not read the photo. Try another image.'); }
  };

  const save = event => {
    event.preventDefault(); setError('');
    if (!form.name.trim()) return setError('Product name is required.');
    if (!form.expiry) return setError('Expiry date is required.');
    onSave({ ...form, name: form.name.trim(), photo: photo || form.photo, emoji: '📦', added: new Date().toISOString().slice(0, 10), id: String(Date.now()) });
  };

  return <div className="scanner-page">
    <button className="back" onClick={onBack}><ArrowLeft size={16}/> {t('Back')}</button>
    <div className="page-title scanner-title"><div><div className="eyebrow">{t('CAMERA + BARCODE + OCR')}</div><h1>{t('Scan a product')}</h1><p>{t('Look up catalogue details by barcode; scan the label to read its expiry date.')}</p></div></div>
    <div className="scanner-grid">
      <section className="panel scanner-camera-panel">
        <div className="camera-stage">
          {photo ? <img className="camera-image" src={photo} alt={t('Captured product label')}/> : <video ref={videoRef} className="camera-video" autoPlay muted playsInline aria-label={t('Live product label camera')}/>}
          {!photo && camera === 'ready' && <div className="camera-frame" aria-hidden="true"><i/><i/><i/><i/></div>}
          {!photo && camera === 'starting' && <div className="camera-placeholder"><LoaderCircle className="spin" size={24}/><span>{t('Camera opening…')}</span></div>}
          {!photo && camera === 'unavailable' && <div className="camera-placeholder"><Camera size={26}/><span>{t('Camera unavailable')}</span></div>}
          {!photo && camera === 'ready' && <div className="barcode-guide"><ScanLine size={16}/><span>{t('Barcode in frame')}</span></div>}
        </div>
        <div className="camera-actions">
          {camera === 'ready' && !photo ? <button className="primary capture-button" onClick={capture}><ScanLine size={17}/> {t('Capture & scan')}</button> : null}
          {camera === 'ready' && !photo && torchSupported && <button type="button" className={`secondary torch-button ${torchOn ? 'torch-active' : ''}`} aria-pressed={torchOn} disabled={torchBusy} onClick={toggleTorch}>{torchOn ? <FlashlightOff size={16}/> : <Flashlight size={16}/>} {t(torchOn ? 'Turn flashlight off' : 'Turn flashlight on')}</button>}
          {(camera === 'unavailable' || photo) && <label className="secondary upload-camera"><ImagePlus size={16}/>{photo ? t('Choose another photo') : t('Upload label photo')}<input type="file" accept="image/*" capture="environment" aria-label={photo ? t('Choose another photo') : t('Upload label photo')} onChange={upload}/></label>}
          {photo && !scanning && <button className="secondary" onClick={startCamera}><RefreshCw size={15}/> {t('Retake')}</button>}
          {scanning && <span className="scan-live"><LoaderCircle size={15} className="spin"/> {progress}%</span>}
        </div>
        {camera === 'ready' && !photo && torchMessage && <p className={`torch-message ${torchSupported ? 'torch-warning' : ''}`} aria-live="polite"><FlashlightOff size={14}/><span>{t(torchMessage)}</span></p>}
        {scanning && <div className="scanner-progress" aria-live="polite"><span>{t(stage)}</span><div><i style={{ width: `${Math.max(progress, 8)}%` }}/></div></div>}
        {(camera === 'ready' || (form.barcode && camera !== 'starting')) && <p className="barcode-status" aria-live="polite">{t(barcodeStatus.key, barcodeStatus.values)}</p>}
        <div className="privacy-note"><ShieldCheck size={15}/><span>{t('Label photos are scanned in your browser. The barcode number is sent to Open Food Facts to look up catalogue details.')}</span></div>
      </section>

      <section className="panel scanner-review">
        <div className="review-heading"><span className="review-icon"><Check size={17}/></span><div><h2>{t('Review details')}</h2><p>{t('OCR suggestions can be edited before saving.')}</p></div></div>
        <form onSubmit={save} className="scanner-form">
          <label className="field"><span>{t('Product name')} <i>*</i></span><input maxLength="70" value={form.name} onChange={event => set('name', event.target.value)} placeholder={t('Detected name or enter it')}/></label>
          <label className="field"><span>{t('Expiry / best-before date')} <i>*</i></span><input type="date" value={form.expiry} onChange={event => set('expiry', event.target.value)}/></label>
          {alreadyExpired && <div className="scanner-expired-warning" role="alert"><AlertTriangle size={17}/><span><b>{t('This product has already expired.')}</b><small>{t('Expiry date {date} has passed. Do not use it; check the product label or disposal guidance.', { date: formattedExpiry })}</small></span></div>}
          <div className="scanner-two-col"><label className="field"><span>{t('Brand')}</span><input maxLength="50" value={form.brand} onChange={event => set('brand', event.target.value)} placeholder={t('Optional')}/></label><label className="field"><span>{t('Category')}</span><select value={form.category} onChange={event => set('category', event.target.value)}>{categories.map(category => <option key={category} value={category}>{t(category)}</option>)}</select></label></div>
          <div className="scanner-two-col"><label className="field"><span>{t('Quantity')}</span><input maxLength="40" value={form.quantity} onChange={event => set('quantity', event.target.value)} placeholder={t('Optional')}/></label><label className="field"><span>{t('Storage location')}</span><input maxLength="60" value={form.location} onChange={event => set('location', event.target.value)} placeholder={t('Optional')}/></label></div>
          <label className="scanner-reminder"><input type="checkbox" checked={form.reminder} onChange={event => set('reminder', event.target.checked)}/><span>{t('Remind me 3 days before expiry')}</span></label>
          {error && <p className="scanner-error" role="alert"><AlertTriangle size={15}/>{t(error)}</p>}
          {scanText && <details className="ocr-result"><summary>{t('View scanned text')}</summary><pre>{scanText}</pre></details>}
          <button className="primary save-scanned" type="submit" disabled={scanning}><Check size={16}/> {t('Save product')}</button>
          <p className="scanner-hint">{t('Check the label once more—OCR can misread small or blurry text.')}</p>
        </form>
      </section>
    </div>
  </div>;
}
