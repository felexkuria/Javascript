const express = require('express');
const router = express.Router();

// Admin login page
router.get('/', (req, res) => {
  res.render('admin-login', {
    title: 'Admin Login - Course Platform'
  });
});

module.exports = router;