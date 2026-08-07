const express = require('express');
const router = express.Router();

let employees = [
  { id: 1, name: 'Sarah Jenkins', role: 'Store Manager', monthlyExpense: 32000, holidaysLeft: 12, phone: '9876543210', joinDate: '2025-01-15' },
  { id: 2, name: 'Mike Ross', role: 'Sales Agent', monthlyExpense: 22000, holidaysLeft: 8, phone: '9876543211', joinDate: '2025-03-10' }
];

router.get('/', (req, res) => {
  res.json(employees);
});

router.post('/', (req, res) => {
  const { name, role, monthlyExpense, holidaysLeft, phone, joinDate } = req.body;
  const newEmp = {
    id: Date.now(),
    name,
    role,
    monthlyExpense: Number(monthlyExpense) || 0,
    holidaysLeft: Number(holidaysLeft) || 10,
    phone: phone || '',
    joinDate: joinDate || new Date().toISOString().split('T')[0]
  };
  employees.push(newEmp);
  res.status(201).json(newEmp);
});

router.put('/:id/holidays', (req, res) => {
  const id = parseInt(req.params.id);
  const { adjust } = req.body;
  const emp = employees.find(e => e.id === id);
  if (emp) {
    emp.holidaysLeft = Math.max(0, emp.holidaysLeft + (adjust || 0));
    res.json(emp);
  } else {
    res.status(404).json({ error: 'Employee not found' });
  }
});

router.post('/:id/leave', (req, res) => {
  const id = parseInt(req.params.id);
  const { days } = req.body;
  const emp = employees.find(e => e.id === id);
  if (emp) {
    emp.holidaysLeft = Math.max(0, emp.holidaysLeft - (Number(days) || 1));
    res.json(emp);
  } else {
    res.status(404).json({ error: 'Employee not found' });
  }
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  employees = employees.filter(e => e.id !== id);
  res.json({ success: true });
});

module.exports = router;
