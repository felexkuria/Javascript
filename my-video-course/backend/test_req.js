const express = require('express');
const app = express();
const router = express.Router();
router.get('/test', (req, res) => {
  res.json({ path: req.path, originalUrl: req.originalUrl });
});
app.use('/api', router);
app.listen(3001, async () => {
  const r = await fetch('http://localhost:3001/api/test').then(r=>r.json());
  console.log(r);
  process.exit(0);
})
