const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');

router.get('/summary', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const [allSales, todaySales, lowStockCount] = await Promise.all([
      prisma.sale.findMany(),
      prisma.sale.findMany({ where: { soldAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.product.count({ where: { stock: { lte: 5 } } })
    ]);

    const totalRevenue = allSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const todayRevenue = todaySales.reduce((sum, s) => sum + s.totalAmount, 0);

    res.json({
      totalRevenue,
      todayRevenue,
      lowStockCount
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch sales summary' });
  }
});

router.get('/report', async (req, res) => {
  try {
    const { from, to } = req.query;
    let whereClause = {};

    if (from || to) {
      whereClause.soldAt = {};
      if (from) whereClause.soldAt.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        whereClause.soldAt.lte = toDate;
      }
    }

    const sales = await prisma.sale.findMany({
      where: whereClause,
      include: {
        items: {
          include: { product: true }
        }
      },
      orderBy: { soldAt: 'desc' }
    });

    const revenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const gst = revenue * 0.18; // Estimated 18% GST for display

    // Find top product
    const prodCounts = {};
    sales.forEach(s => {
      s.items.forEach(i => {
        const name = i.product?.name || 'Item';
        prodCounts[name] = (prodCounts[name] || 0) + i.quantity;
      });
    });

    let topProduct = 'N/A';
    let maxQty = 0;
    for (const [name, qty] of Object.entries(prodCounts)) {
      if (qty > maxQty) {
        maxQty = qty;
        topProduct = name;
      }
    }

    const formattedSales = sales.map(s => ({
      id: s.id,
      date: s.soldAt.toISOString().split('T')[0],
      agentName: 'Admin',
      items: s.items.map(i => `${i.product?.name || 'Product'} x${i.quantity}`).join(', '),
      total: s.totalAmount,
      paymentMode: 'CASH'
    }));

    res.json({
      summary: {
        revenue,
        gst,
        count: sales.length,
        topProduct
      },
      sales: formattedSales
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch sales report' });
  }
});

router.get('/today', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    const sales = await prisma.sale.findMany({
      where: {
        soldAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
      include: {
        items: {
          include: {
            product: { select: { name: true } }
          }
        }
      },
      orderBy: { soldAt: 'desc' },
    });
    res.json(sales);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch today sales' });
  }
});

router.get('/month', async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const sales = await prisma.sale.findMany({
      where: {
        soldAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      include: {
        items: {
          include: {
            product: { select: { name: true } }
          }
        }
      },
      orderBy: { soldAt: 'desc' },
    });
    res.json(sales);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch month sales' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [todaySales, monthSales] = await Promise.all([
      prisma.sale.findMany({
        where: { soldAt: { gte: todayStart, lte: todayEnd } },
        include: { items: true }
      }),
      prisma.sale.findMany({
        where: { soldAt: { gte: monthStart, lte: monthEnd } },
        include: { items: { include: { product: true } } }
      })
    ]);

    const todayRevenue = todaySales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const todayProfit = todaySales.reduce((sum, sale) => sum + sale.totalProfit, 0);
    const todaySalesCount = todaySales.length;
    const todayItemsSold = todaySales.reduce((sum, sale) => sum + sale.items.reduce((s, item) => s + item.quantity, 0), 0);

    const monthRevenue = monthSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const monthProfit = monthSales.reduce((sum, sale) => sum + sale.totalProfit, 0);
    const monthSalesCount = monthSales.length;

    // Daily Sales for charts
    const dailySalesMap = {};
    monthSales.forEach(sale => {
      const dateStr = sale.soldAt.toISOString().split('T')[0];
      if (!dailySalesMap[dateStr]) {
        dailySalesMap[dateStr] = { date: dateStr, revenue: 0, profit: 0 };
      }
      dailySalesMap[dateStr].revenue += sale.totalAmount;
      dailySalesMap[dateStr].profit += sale.totalProfit;
    });
    const dailySales = Object.values(dailySalesMap).sort((a, b) => a.date.localeCompare(b.date));

    // Top Products
    const productCounts = {};
    monthSales.forEach(sale => {
      sale.items.forEach(item => {
        if (!productCounts[item.productId]) {
          productCounts[item.productId] = { 
            productId: item.productId, 
            name: item.product?.name || 'Product',
            quantity: 0 
          };
        }
        productCounts[item.productId].quantity += item.quantity;
      });
    });
    const topProducts = Object.values(productCounts)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    const profitMargin = monthRevenue > 0 ? (monthProfit / monthRevenue) * 100 : 0;

    res.json({
      todayRevenue,
      todayProfit,
      todaySalesCount,
      todayItemsSold,
      monthRevenue,
      monthProfit,
      monthSalesCount,
      dailySales,
      topProducts,
      profitMargin
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { items, paymentMode } = req.body; // [{ productId, quantity }]
    if (!items || !items.length) {
      return res.status(400).json({ error: 'Items required' });
    }

    const sale = await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      let totalProfit = 0;
      const saleItemsData = [];

      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: parseInt(item.productId) } });
        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }

        await tx.product.update({
          where: { id: product.id },
          data: { stock: { decrement: item.quantity } }
        });

        const itemTotalAmount = product.sellPrice * item.quantity;
        const itemTotalCost = product.buyPrice * item.quantity;
        const itemTotalProfit = itemTotalAmount - itemTotalCost;

        totalAmount += itemTotalAmount;
        totalProfit += itemTotalProfit;

        saleItemsData.push({
          productId: product.id,
          quantity: item.quantity,
          unitPrice: product.sellPrice,
          unitCost: product.buyPrice,
        });
      }

      const createdSale = await tx.sale.create({
        data: {
          totalAmount,
          totalProfit,
          items: {
            create: saleItemsData
          }
        },
        include: {
          items: true
        }
      });
      return createdSale;
    });

    res.status(201).json(sale);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
