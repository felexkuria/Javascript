const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');

// Admin login page
router.get('/login', (req, res) => {
  res.render('admin-login', { message: null });
});

// Admin panel (protected)
router.get('/', adminAuth, (req, res) => {
  res.render('admin');
});

module.exports = router;