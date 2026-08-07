const express = require('express');
const router = express.Router();

let suppliers = [
  { id: 1, name: 'FitnessGear Inc.' },
  { id: 2, name: 'Global Tech Supplies' }
];

router.get('/', (req, res) => {
  res.json(suppliers);
});

router.post('/', (req, res) => {
  const { name } = req.body;
  const newSup = { id: Date.now(), name };
  suppliers.push(newSup);
  res.status(201).json(newSup);
});

module.exports = router;
