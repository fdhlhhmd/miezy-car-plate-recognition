const { createWorker } = require('tesseract.js');
async function test() {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
    tessedit_pageseg_mode: '11',
  });
  // need an image to test, or just look at tesseract types
}
test();
