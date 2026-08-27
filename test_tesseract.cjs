const { createWorker } = require('tesseract.js');
async function test() {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
    tessedit_pageseg_mode: '11',
  });
  // generate a tiny image buffer in memory or just download an image
  const fs = require('fs');
  // I will just download a small image
}
test();
