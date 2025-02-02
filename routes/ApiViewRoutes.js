// ApiViewRoutes.js
const express = require('express');
const router = express.Router();
const apiViewController = require('../controllers/ApiViewController');

router.get('/:websiteId', apiViewController.getApisByWebsiteAndCategory);
module.exports = router;
