import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, Camera, Check, Flashlight, FlashlightOff, LoaderCircle, ScanText, X } from 'lucide-react';
import { scanProductImage } from './ocr.js';
import { useTranslation } from './i18n.jsx';

const productIcons = ['🥑','🍎','🍌','🍇','🍓','🥕','🥦','🥛','🧀','🥚','🍞','🥫','🍚','🧃','💊','🧴','🧼','📦'];

export default function ProductForm({ product, close, save }) {
  const { language, t } = useTranslation();
  const [form, setForm] = useState(() => product ? { ...product, emoji: product.emoji || '📦' } : {
    name: '', brand: '', barcode: '', category: 'Produce', quantity: '', location: '',
    expiry: '',
    added: new Date().toISOString().slice(0, 10), emoji: '🥑', reminder: true, photo: ''
  });
  const [error, setError] = useState('');
  const [scanText, setScanText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanStage, setScanStage] = useState('');
  const [cameraStatus, setCameraStatus] = useState('closed');
  const [cameraError, setCameraError] = useState('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchBusy, setTorchBusy] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cameraRequestRef = useRef(0);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const alreadyExpired = Boolean(form.expiry && form.expiry < todayString);
  const formattedExpiry = form.expiry ? new Date(`${form.expiry}T12:00:00`).toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const closeCamera = () => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStatus('closed'); setCameraError(''); setTorchSupported(false); setTorchOn(false);
  };

  const openCamera = async () => {
    if (cameraStatus === 'starting' || cameraStatus === 'ready') return;
    const requestId = ++cameraRequestRef.current;
    let stream;
    setCameraStatus('starting'); setCameraError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (requestId !== cameraRequestRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      try { setTorchSupported(Boolean(stream.getVideoTracks()[0]?.getCapabilities?.().torch)); } catch { setTorchSupported(false); }
      setCameraStatus('ready');
    } catch {
      if (requestId !== cameraRequestRef.current) return;
      stream?.getTracks().forEach(track => track.stop());
      setCameraStatus('unavailable');
      setCameraError('Camera permission was not granted. Allow access or upload a label photo.');
    }
  };

  useEffect(() => {
    if (cameraStatus !== 'ready' || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    video.play().catch(() => setCameraError('Camera preview could not start.'));
  }, [cameraStatus]);

  useEffect(() => () => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const toggleTorch = async () => {
    if (torchBusy) return;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track?.applyConstraints) return setCameraError('Flashlight is not supported by this camera.');
    setTorchBusy(true);
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(current => !current); setCameraError('');
    } catch { setCameraError('Could not switch the flashlight. Try again or continue without it.'); }
    finally { setTorchBusy(false); }
  };

  const scanLabel = async (sourceImage = form.photo) => {
    if (!sourceImage || scanning) return;
    setError(''); setScanning(true); setProgress(0); setScanStage(t('Loading OCR…'));
    try {
      const found = await scanProductImage(sourceImage, message => {
        if (message.status === 'enhancing label image') setScanStage(t('Improving label image…'));
        if (message.status === 'trying clearer text pass') setScanStage(t('Trying another text-reading pass…'));
        if (message.status === 'loading language traineddata') setScanStage(t('Loading English text data…'));
        if (message.status === 'recognizing text') { setScanStage(t('Reading package text…')); setProgress(Math.round((message.progress || 0) * 100)); }
      });
      setScanText(found.text);
      setForm(current => ({ ...current, ...(found.name ? { name: found.name } : {}), ...(found.expiry ? { expiry: found.expiry } : {}) }));
      if (!found.name && !found.expiry) setError(t('Text found, but product name or expiry date could not be identified. Enter them manually.'));
      else if (!found.expiry) setError(t('Name detected; expiry date was not found. Check the date and enter it manually.'));
      else if (!found.name) setError(t('Expiry date detected; product name was not found. Enter the name manually.'));
    } catch {
      setError(t('Scan could not read the label. Check your internet connection, then try again or enter details manually.'));
    } finally { setScanning(false); setScanStage(''); }
  };

  const captureAndScan = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) { setCameraError('Camera is not ready yet. Try again in a moment.'); return; }
    const scale = Math.min(1, 2000 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) { setCameraError('Camera image could not be captured.'); return; }
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL('image/jpeg', .9);
    set('photo', image); setScanText(''); setError(''); closeCamera();
    await scanLabel(image);
  };

  const submit = event => {
    event.preventDefault();
    if (!form.name.trim()) return setError(t('Product name is required.'));
    if (!form.expiry) return setError(t('Expiry date is required.'));
    save({ ...form, name: form.name.trim(), id: product?.id || String(Date.now()) });
  };

  return <div className="modal-shade" onClick={close}><section className="modal" onClick={event => event.stopPropagation()}>
    <header className="modal-head"><div><div className="eyebrow">{t(product ? 'MAKE IT JUST RIGHT' : 'ADD TO YOUR HOME')}</div><h2>{t(product ? 'Edit product' : 'Add a product')}</h2><p>{t(product ? 'Keep the details up to date.' : 'Scan a label or enter the details yourself.')}</p></div><button className="icon" type="button" onClick={close} aria-label={t('Close')} title={t('Close')}><X/></button></header>
    <form onSubmit={submit}><div className="form-grid">
      <label className="field wide"><span>{t('Product name')} <i>*</i></span><input autoFocus maxLength="70" value={form.name} onChange={event => set('name', event.target.value)} placeholder={t('e.g. Greek yogurt')}/></label>
      <label className="field"><span>{t('Brand')}</span><input maxLength="50" value={form.brand} onChange={event => set('brand', event.target.value)} placeholder={t('e.g. Epigamia')}/></label>
      <label className="field"><span>{t('Category')}</span><select value={form.category} onChange={event => set('category', event.target.value)}>{['Produce','Dairy','Bakery','Pantry','Dairy alternatives','Healthcare','Other'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
      <div className="field wide"><span>{t('Product icon')}</span><div className="product-icon-picker" role="group" aria-label={t('Choose a product icon')}>{productIcons.map(icon => <button type="button" key={icon} className={`product-icon-choice ${form.emoji === icon ? 'selected' : ''}`} aria-label={`${t('Select product icon')} ${icon}`} aria-pressed={form.emoji === icon} onClick={() => set('emoji', icon)}>{icon}</button>)}</div></div>
      <label className="field"><span>{t('Quantity')}</span><input maxLength="40" value={form.quantity} onChange={event => set('quantity', event.target.value)} placeholder={t('e.g. 2 cups')}/></label>
      <label className="field"><span>{t('Storage location')}</span><input maxLength="60" value={form.location} onChange={event => set('location', event.target.value)} placeholder={t('e.g. Fridge · Top shelf')}/></label>
      <label className="field"><span>{t('Expiry / best-before')} <i>*</i></span><input type="date" value={form.expiry} onChange={event => set('expiry', event.target.value)}/></label>
      {alreadyExpired && <div className="scanner-expired-warning wide" role="alert"><AlertTriangle size={17}/><span><b>{t('This product has already expired.')}</b><small>{t('Expiry date {date} has passed. Do not use it; check the product label or disposal guidance.', { date: formattedExpiry })}</small></span></div>}
      <div className="field wide"><span>{t('Package photo and scanner')}</span><div className="ocr-controls"><button type="button" className="secondary camera-open-button" onClick={openCamera}><Camera size={15}/>{t('Open camera scanner')}</button><label className="file-picker"><Camera size={15}/>{form.photo ? t('Change photo') : t('Choose a photo')}<input type="file" accept="image/*" capture="environment" aria-label={t('Package photo')} onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        if (file.size > 2e6) { setError(t('Image must be smaller than 2 MB.')); return; }
        const reader = new FileReader(); reader.onerror = () => setError(t('Could not read the image. Try another photo.'));
        reader.onload = () => { const image = new Image(); image.onerror = () => setError(t('Could not read the image. Try another photo.')); image.onload = () => {
          const scale = Math.min(1, 1400 / Math.max(image.width, image.height)); const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
          const context = canvas.getContext('2d'); if (!context) { setError(t('Could not read the image. Try another photo.')); return; }
          context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
          context.drawImage(image, 0, 0, canvas.width, canvas.height); set('photo', canvas.toDataURL('image/jpeg', .86)); setScanText(''); setError('');
        }; image.src = reader.result; }; reader.readAsDataURL(file);
      }}/></label>{form.photo && <button type="button" className="secondary scan-button" onClick={scanLabel} disabled={scanning}>{scanning ? <LoaderCircle className="spin" size={15}/> : <ScanText size={15}/>} {scanning ? `${progress}%` : t('Scan label')}</button>}</div>
        {cameraStatus !== 'closed' && <div className="add-camera-box"><div className="add-camera-stage">
          {cameraStatus === 'ready' && <video ref={videoRef} autoPlay muted playsInline aria-label={t('Live product label camera')}/>}
          {cameraStatus === 'starting' && <div className="camera-placeholder"><LoaderCircle className="spin" size={23}/><span>{t('Camera opening…')}</span></div>}
          {cameraStatus === 'unavailable' && <div className="camera-placeholder"><Camera size={24}/><span>{t('Camera unavailable')}</span></div>}
          {cameraStatus === 'ready' && <div className="camera-frame" aria-hidden="true"><i/><i/><i/><i/></div>}
        </div><div className="add-camera-actions">
          {cameraStatus === 'ready' && <button type="button" className="primary" onClick={captureAndScan}><ScanText size={15}/>{t('Capture and scan label')}</button>}
          {cameraStatus === 'ready' && torchSupported && <button type="button" className="secondary" aria-pressed={torchOn} disabled={torchBusy} onClick={toggleTorch}>{torchOn ? <FlashlightOff size={15}/> : <Flashlight size={15}/>} {t(torchOn ? 'Turn flashlight off' : 'Turn flashlight on')}</button>}
          {cameraStatus !== 'starting' && <button type="button" className="secondary" onClick={closeCamera}>{t('Close camera')}</button>}
        </div>{cameraError && <p className="error" role="alert">{t(cameraError)}</p>}</div>}
        {form.photo && <img className="photo-preview" src={form.photo} alt={t('Package photo preview')}/>}
        {scanning && <div className="scan-progress" aria-live="polite"><span>{scanStage}</span><div><i style={{ width: `${Math.max(progress, 8)}%` }}/></div></div>}
        {scanText && <details className="ocr-result"><summary>{t('Scanned text · check detected fields')}</summary><pre>{scanText}</pre></details>}
      </div>
      <label className="reminder-check wide"><input type="checkbox" checked={!!form.reminder} onChange={event => set('reminder', event.target.checked)}/><span><Bell size={16}/></span><div><b>{t('Gentle reminder')}</b><small>{t('Give me a heads-up 3 days before expiry')}</small></div></label>
    </div>{error && <p className="error" role="alert"><AlertTriangle size={15}/>{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={close}>{t('Cancel')}</button><button type="submit" className="primary"><Check size={16}/>{t(product ? 'Save changes' : 'Add product')}</button></div></form>
  </section></div>;
}
