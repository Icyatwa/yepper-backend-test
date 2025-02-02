// // routes/PictureRoutes.js
// const express = require('express');
// const router = express.Router();
// const pictureController = require('../controllers/PictureController');

// router.post('/upload', pictureController.uploadPicture);
// router.get('/all', pictureController.getAllPictures);
// router.get('/earnings/:creatorId', pictureController.getEarnings);

// module.exports = router;




// routes/PictureRoutes.js
const express = require('express');
const router = express.Router();
const pictureController = require('../controllers/PictureController');

router.post('/upload', pictureController.uploadPicture);
router.get('/all', pictureController.getAllPictures);
router.get('/earnings/:creatorId', pictureController.getEarnings);

module.exports = router;
