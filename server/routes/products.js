const express = require('express');
const router = express.Router();
const multer = require('multer');
const prisma = require('../prismaClient');

// Memory storage for ImgBB CDN uploads
const upload = multer({ storage: multer.memoryStorage() });

const IMGBB_API_KEY = '9dbce1b1652dba7256659033badba4fc';

async function uploadToImgBB(fileBuffer) {
  const base64 = fileBuffer.toString('base64');
  const formData = new URLSearchParams();
  formData.append('key', IMGBB_API_KEY);
  formData.append('image', base64);

  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error('ImgBB upload failed');
  }

  const data = await response.json();
  return data.data.display_url;
}

// Helper to ensure valid category ID
async function ensureCategoryId(categoryIdInput) {
  let catId = parseInt(categoryIdInput, 10);
  if (!isNaN(catId) && catId > 0) {
    const existing = await prisma.category.findUnique({ where: { id: catId } });
    if (existing) return existing.id;
  }

  // Fallback to first existing category or create General category
  let defaultCat = await prisma.category.findFirst({ orderBy: { id: 'asc' } });
  if (!defaultCat) {
    defaultCat = await prisma.category.create({ data: { name: 'General' } });
  }
  return defaultCat.id;
}

router.get('/', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/low-stock', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { stock: { lte: 5 } },
      include: { category: true },
      orderBy: { stock: 'asc' },
    });
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch low stock products' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true }
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.post('/', upload.single('photo'), async (req, res) => {
  try {
    const { name, categoryId, buyPrice, sellPrice, stock } = req.body;
    let photoUrl = null;

    if (req.file) {
      photoUrl = await uploadToImgBB(req.file.buffer);
    }

    const finalCategoryId = await ensureCategoryId(categoryId);

    const product = await prisma.product.create({
      data: {
        name: name || 'New Product',
        categoryId: finalCategoryId,
        buyPrice: parseFloat(buyPrice) || 0,
        sellPrice: parseFloat(sellPrice) || 0,
        stock: parseInt(stock, 10) || 0,
        photoUrl
      },
      include: { category: true }
    });
    res.status(201).json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

router.put('/:id', upload.single('photo'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const { name, categoryId, buyPrice, sellPrice, stock } = req.body;

    let updateData = {};
    if (name !== undefined) updateData.name = name;
    if (buyPrice !== undefined && !isNaN(parseFloat(buyPrice))) updateData.buyPrice = parseFloat(buyPrice);
    if (sellPrice !== undefined && !isNaN(parseFloat(sellPrice))) updateData.sellPrice = parseFloat(sellPrice);
    if (stock !== undefined && !isNaN(parseInt(stock, 10))) updateData.stock = parseInt(stock, 10);

    if (categoryId !== undefined) {
      updateData.categoryId = await ensureCategoryId(categoryId);
    }

    if (req.file) {
      updateData.photoUrl = await uploadToImgBB(req.file.buffer);
    }

    const product = await prisma.product.update({
      where: { id },
      data: updateData,
      include: { category: true }
    });
    res.json(product);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) {
      return res.json({ success: true, message: 'Product already deleted' });
    }

    // Delete linked sale items first to satisfy foreign key constraints
    await prisma.saleItem.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

module.exports = router;
