const multer = require('multer');

const maxMB = parseInt(process.env.MAX_IMAGE_UPLOAD_MB || '8', 10);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxMB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

module.exports = upload;
