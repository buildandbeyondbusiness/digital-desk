const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  // Simple auth endpoint for demo
  if (email && password) {
    res.json({
      token: 'jwt_token_' + Date.now(),
      role: 'MANAGER',
      user: { name: 'Admin User', email }
    });
  } else {
    res.status(400).json({ error: 'Email and password required' });
  }
});

module.exports = router;
