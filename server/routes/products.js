import { Router } from 'express';
import Product from '../models/Product.js';

const router = Router();
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', asyncRoute(async (req, res) => {
  const filter = req.query.bin === 'true' ? { deletedAt: { $ne: null } } : { deletedAt: null };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.search) filter.name = { $regex: String(req.query.search).slice(0, 70), $options: 'i' };
  const products = await Product.find(filter).sort({ expiry: 1 }).limit(500).lean();
  res.json(products);
}));

router.get('/:id', asyncRoute(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, deletedAt: null });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
}));

router.post('/', asyncRoute(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json(product);
}));

router.patch('/:id', asyncRoute(async (req, res) => {
  const allowed = ['name', 'brand', 'category', 'quantity', 'location', 'expiry', 'reminder', 'photo', 'emoji'];
  const changes = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  const product = await Product.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, changes, { new: true, runValidators: true });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
}));

router.delete('/:id', asyncRoute(async (req, res) => {
  const product = await Product.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, { deletedAt: new Date() }, { new: true });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
}));

router.post('/:id/restore', asyncRoute(async (req, res) => {
  const product = await Product.findOneAndUpdate({ _id: req.params.id, deletedAt: { $ne: null } }, { deletedAt: null }, { new: true });
  if (!product) return res.status(404).json({ error: 'Product not found in recycle bin' });
  res.json(product);
}));

router.delete('/:id/permanent', asyncRoute(async (req, res) => {
  const result = await Product.deleteOne({ _id: req.params.id, deletedAt: { $ne: null } });
  if (!result.deletedCount) return res.status(404).json({ error: 'Product not found in recycle bin' });
  res.status(204).end();
}));

export default router;
