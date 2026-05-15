import sharp from "sharp";

sharp.cache({
  memory: 64,
  files: 0,
  items: 128
});
sharp.concurrency(2);

export const createSharp = (buffer: Buffer) =>
  sharp(buffer, {
    animated: true,
    failOn: "none"
  });
