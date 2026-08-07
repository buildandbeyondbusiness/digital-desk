const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

const IMGBB_API_KEY = '9dbce1b1652dba7256659033badba4fc';

// Detailed analytics for Indian shopkeeper dashboard
router.get('/charts', async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const sales = await prisma.sale.findMany({
      where: {
        soldAt: { gte: sevenDaysAgo }
      },
      include: {
        items: {
          include: { product: true }
        }
      },
      orderBy: { soldAt: 'asc' }
    });

    // 1. 7-Day Revenue Trend
    const trendMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      trendMap[dateStr] = 0;
    }

    sales.forEach(s => {
      const dateStr = s.soldAt.toISOString().split('T')[0];
      if (trendMap[dateStr] !== undefined) {
        trendMap[dateStr] += s.totalAmount;
      }
    });

    const trend = Object.entries(trendMap).map(([date, total]) => ({
      date: date.substring(5), // MM-DD
      total
    }));

    // 2. Top Selling Products
    const prodMap = {};
    sales.forEach(s => {
      s.items.forEach(item => {
        const name = item.product?.name || 'Product';
        prodMap[name] = (prodMap[name] || 0) + item.quantity;
      });
    });

    const topProducts = Object.entries(prodMap)
      .map(([product_name, units_sold]) => ({ product_name, units_sold }))
      .sort((a, b) => b.units_sold - a.units_sold)
      .slice(0, 5);

    // 3. Preferred Payment Modes (UPI vs Cash vs Card)
    const paymentModeCounts = { UPI: 0, CASH: 0, CARD: 0 };
    sales.forEach(s => {
      // If sale items exist, count by sale
      const mode = (s.paymentMode || 'UPI').toUpperCase();
      if (paymentModeCounts[mode] !== undefined) {
        paymentModeCounts[mode] += 1;
      } else {
        paymentModeCounts.UPI += 1;
      }
    });

    const paymentModes = [
      { mode: 'UPI', count: paymentModeCounts.UPI || 1 },
      { mode: 'CASH', count: paymentModeCounts.CASH },
      { mode: 'CARD', count: paymentModeCounts.CARD }
    ];

    // 4. Peak Sales Hours (Hourly Breakdown)
    const hourlyMap = { "9 AM": 0, "12 PM": 0, "3 PM": 0, "6 PM": 0, "9 PM": 0 };
    sales.forEach(s => {
      const hour = s.soldAt.getHours();
      if (hour < 11) hourlyMap["9 AM"] += s.totalAmount;
      else if (hour < 14) hourlyMap["12 PM"] += s.totalAmount;
      else if (hour < 17) hourlyMap["3 PM"] += s.totalAmount;
      else if (hour < 20) hourlyMap["6 PM"] += s.totalAmount;
      else hourlyMap["9 PM"] += s.totalAmount;
    });

    const hourlySales = Object.entries(hourlyMap).map(([hour, total]) => ({ hour, total }));

    // 5. Financial Breakdown (GST 18% + Profit)
    const totalRev = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalProfit = sales.reduce((sum, s) => sum + s.totalProfit, 0);
    const estimatedGst = totalRev * 0.18;
    const profitMargin = totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(1) : 0;

    res.json({
      trend,
      topProducts,
      paymentModes,
      hourlySales,
      financials: {
        totalRev,
        totalProfit,
        estimatedGst,
        profitMargin
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate charts analytics' });
  }
});

// ImgBB base64 upload endpoint
router.post('/upload-image', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const formData = new URLSearchParams();
    formData.append('key', IMGBB_API_KEY);
    formData.append('image', cleanBase64);

    const imgbbRes = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      body: formData
    });

    if (!imgbbRes.ok) {
      throw new Error('ImgBB upload failed');
    }

    const data = await imgbbRes.json();
    res.json({ url: data.data.display_url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to upload image to ImgBB' });
  }
});

// Reset dev data
router.post('/reset-data', async (req, res) => {
  try {
    await prisma.saleItem.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.product.deleteMany();
    res.json({ success: true, message: 'All demo data cleared' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset data' });
  }
});

module.exports = router;
