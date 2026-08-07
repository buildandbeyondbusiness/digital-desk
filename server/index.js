const express = require('express');
const cors = require('cors');
const path = require('path');

const productsRouter = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const salesRouter = require('./routes/sales');
const authRouter = require('./routes/auth');
const employeesRouter = require('./routes/employees');
const suppliersRouter = require('./routes/suppliers');
const analyticsRouter = require('./routes/analytics');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Disable browser caching for static files so fresh UI edits load immediately
const staticOptions = {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
};

app.use('/uploads', express.static(path.join(__dirname, '../uploads'), staticOptions));
app.use('/pos', express.static(path.join(__dirname, '../public/pos'), staticOptions));
app.use('/admin', express.static(path.join(__dirname, '../public/admin'), staticOptions));

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/', (req, res) => {
  res.redirect('/pos/');
});

app.get('/pos', (req, res) => {
  res.redirect('/pos/');
});

app.get('/admin', (req, res) => {
  res.redirect('/admin/');
});

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/sales', salesRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/analytics', analyticsRouter);

// Alias root endpoints used by frontend helpers
app.post('/api/upload-image', (req, res, next) => {
  req.url = '/upload-image';
  analyticsRouter(req, res, next);
});

app.post('/api/dev/reset-data', (req, res, next) => {
  req.url = '/reset-data';
  analyticsRouter(req, res, next);
});

app.get('/api/export/:type/:format', (req, res) => {
  const { type, format } = req.params;
  res.setHeader('Content-Type', 'text/plain');
  res.send(`Export ${type} as ${format} - Demo Report Data`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
