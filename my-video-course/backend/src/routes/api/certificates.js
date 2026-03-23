const express = require('express');
const router = express.Router();
const certificateController = require('../../controllers/certificateController');
const sessionAuth = require('../../middleware/sessionAuth');

router.post('/generate', sessionAuth, certificateController.generateCertificate);
router.get('/my', sessionAuth, certificateController.getUserCertificates);

module.exports = router;
