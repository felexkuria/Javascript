const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/videos');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });
const router = require('express').Router();

router.post('/upload', upload.single('video'), (req, res) => {
  // Handle the uploaded file
  res.redirect('/dashboard');
});

module.exports = router;