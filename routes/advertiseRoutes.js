// routes/advertiseRoutes.js

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  // This will render the advertise page
  res.redirect(`/websites?preselect=true&websiteId=${req.query.websiteId}&categoryId=${req.query.categoryId}`);
});

module.exports = router;