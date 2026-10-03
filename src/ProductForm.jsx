import React, { useState } from 'react';
import { createWorker } from 'tesseract.js';
import { AlertTriangle, Bell, Camera, Check, LoaderCircle, ScanText, X } from 'lucide-react';
import { extractProductDetails } from './ocr.js';

export default function ProductForm({ product, close, save }) {
  const [form, setForm] = useState(() => product ? { ...product } : {
    name: '', brand: '', category: 'Produce', quantity: '', location: '',
    expiry: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    added: new Date().toISOString().slice(0, 10), emoji: '🥑', reminder: true, photo: ''
  });
  const [error, setError] = useState('');
  const [scanText, setScanText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scanStage, setScanStage] = useState('');
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const scanLabel = async () => {
    if (!form.photo || scanning) return;
    let worker;
    setError(''); setScanning(true); setProgress(0); setScanStage('Loading OCR…');
    try {
      worker = await createWorker('eng', 1, {
        logger: message => {
          if (message.status === 'loading language traineddata') setScanStage('Loading English text data…');
          if (message.status === 'recognizing text') {
            setScanStage('Reading package text…');
            setProgress(Math.round((message.progress || 0) * 100));
          }
        }
      });
      const { data: { text } } = await worker.recognize(form.photo);
      const found = extractProductDetails(text);
      setScanText(text.trim());
      setForm(current => ({ ...current, ...(found.name ? { name: found.name } : {}), ...(found.expiry ? { expiry: found.expiry } : {}) }));
      if (!found.name && !found.expiry) setError('Text mila, par naam ya expiry date pehchan nahi paaya. Details manually bhar dein.');
      else if (!found.expiry) setError('Naam scan ho gaya; expiry date nahi mili. Date check karke manually bharein.');
      else if (!found.name) setError('Expiry scan ho gayi; product name nahi mila. Naam manually bharein.');
    } catch {
      setError('Scan nahi ho saka. Internet check karein, phir dobara try karein ya details manually bharein.');
    } finally {
      if (worker) await worker.terminate().catch(() => {});
      setScanning(false); setScanStage('');
    }
  };

  const submit = event => {
    event.preventDefault();
    if (!form.name.trim()) return setError('Product ka naam zaroori hai.');
    if (!form.expiry) return setError('Expiry date zaroori hai.');
    save({ ...form, name: form.name.trim(), id: product?.id || String(Date.now()) });
  };

  return <div className="modal-shade" onClick={close}><section className="modal" onClick={event => event.stopPropagation()}>
    <header className="modal-head"><div><div className="eyebrow">{product ? 'MAKE IT JUST RIGHT' : 'ADD TO YOUR HOME'}</div><h2>{product ? 'Edit product' : 'Add a product'}</h2><p>{product ? 'Keep the details up to date.' : 'Scan a label or enter the details yourself.'}</p></div><button className="icon" type="button" onClick={close} aria-label="Close"><X/></button></header>
    <form onSubmit={submit}><div className="form-grid">
      <label className="field wide"><span>Product name <i>*</i></span><input autoFocus maxLength="70" value={form.name} onChange={event => set('name', event.target.value)} placeholder="e.g. Greek yogurt"/></label>
      <label className="field"><span>Brand</span><input maxLength="50" value={form.brand} onChange={event => set('brand', event.target.value)} placeholder="e.g. Epigamia"/></label>
      <label className="field"><span>Category</span><select value={form.category} onChange={event => set('category', event.target.value)}>{['Produce','Dairy','Bakery','Pantry','Dairy alternatives','Healthcare','Other'].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="field"><span>Quantity</span><input maxLength="40" value={form.quantity} onChange={event => set('quantity', event.target.value)} placeholder="e.g. 2 cups"/></label>
      <label className="field"><span>Storage location</span><input maxLength="60" value={form.location} onChange={event => set('location', event.target.value)} placeholder="e.g. Fridge · Top shelf"/></label>
      <label className="field"><span>Expiry / best-before <i>*</i></span><input type="date" value={form.expiry} onChange={event => set('expiry', event.target.value)}/></label>
      <div className="field"><span>Package photo</span><div className="ocr-controls"><label className="file-picker"><Camera size={15}/>{form.photo ? 'Change photo' : 'Choose a photo'}<input type="file" accept="image/*" capture="environment" onChange={event => {
        const file = event.target.files?.[0]; if (!file) return;
        if (file.size > 2e6) { setError('Image 2 MB se chhoti honi chahiye.'); return; }
        const reader = new FileReader(); reader.onerror = () => setError('Image padh nahi paaya; doosri photo try karein.');
        reader.onload = () => { const image = new Image(); image.onerror = () => setError('Image padh nahi paaya; doosri photo try karein.'); image.onload = () => {
          const scale = Math.min(1, 900 / Math.max(image.width, image.height)); const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); set('photo', canvas.toDataURL('image/jpeg', .76)); setScanText(''); setError('');
        }; image.src = reader.result; }; reader.readAsDataURL(file);
      }}/></label>{form.photo && <button type="button" className="secondary scan-button" onClick={scanLabel} disabled={scanning}>{scanning ? <LoaderCircle className="spin" size={15}/> : <ScanText size={15}/>} {scanning ? `${progress}%` : 'Scan label'}</button>}</div>
        {form.photo && <img className="photo-preview" src={form.photo} alt="Selected package preview"/>}
        {scanning && <div className="scan-progress" aria-live="polite"><span>{scanStage}</span><div><i style={{ width: `${Math.max(progress, 8)}%` }}/></div></div>}
        {scanText && <details className="ocr-result"><summary>Scanned text · check detected fields</summary><pre>{scanText}</pre></details>}
      </div>
      <label className="reminder-check wide"><input type="checkbox" checked={!!form.reminder} onChange={event => set('reminder', event.target.checked)}/><span><Bell size={16}/></span><div><b>Gentle reminder</b><small>Give me a heads-up 3 days before expiry</small></div></label>
    </div>{error && <p className="error"><AlertTriangle size={15}/>{error}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button type="submit" className="primary"><Check size={16}/>{product ? 'Save changes' : 'Add product'}</button></div></form>
  </section></div>;
}
