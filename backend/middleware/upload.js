
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const uploadDirectory = path.join(
  __dirname,
  "..",
  "private_uploads",
  "driver_documents"
);

// Create the private upload directory if it does not exist.
fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

const allowedExtensions = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
]);

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, uploadDirectory);
  },

  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = `${crypto.randomUUID()}${extension}`;
    callback(null, safeName);
  },
});

const fileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (
    !allowedExtensions.has(extension) ||
    !allowedMimeTypes.has(file.mimetype)
  ) {
    return callback(
      new Error("Only PDF, JPG, JPEG, and PNG files are allowed.")
    );
  }

  callback(null, true);
};

const uploadDriverDocument = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
}).single("document");

module.exports = {
  uploadDriverDocument,
  uploadDirectory,
};
