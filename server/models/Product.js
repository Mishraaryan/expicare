import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 70 },
  brand: { type: String, trim: true, maxlength: 50, default: '' },
  barcode: { type: String, trim: true, maxlength: 32, default: '' },
  category: { type: String, required: true, trim: true, maxlength: 40 },
  quantity: { type: String, trim: true, maxlength: 40, default: '' },
  location: { type: String, trim: true, maxlength: 60, default: '' },
  expiry: { type: Date, required: true },
  added: { type: Date, default: Date.now },
  reminder: { type: Boolean, default: true },
  photo: { type: String, default: '' },
  emoji: { type: String, default: '📦' },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

productSchema.index({ name: 1 });
productSchema.index({ expiry: 1, reminder: 1 });
export default mongoose.model('Product', productSchema);
