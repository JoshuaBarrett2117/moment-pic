import { PassThrough, type Readable } from "node:stream";

import { extractJpegFromPsd, PSD_MAGIC } from "../archive-utils.js";

export const createSingleRun = (fn: () => void) => {
  let called = false;
  return () => {
    if (called) {
      return;
    }
    called = true;
    fn();
  };
};

export const toArchiveBody = async (streamPromise: Promise<Readable>): Promise<Readable | Buffer> => {
  const stream = await streamPromise;

  return new Promise((resolve, reject) => {
    const headChunks: Buffer[] = [];
    let headLength = 0;
    let resolved = false;

    const cleanupHeadListeners = () => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("error", onError);
    };

    const resolveWith = (body: Readable | Buffer) => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanupHeadListeners();
      resolve(body);
    };

    const rejectWith = (error: Error) => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanupHeadListeners();
      reject(error);
    };

    const onError = (error: Error) => {
      rejectWith(error);
    };

    const onEnd = () => {
      resolveWith(Buffer.concat(headChunks));
    };

    const onData = (chunk: Buffer | string) => {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      headChunks.push(bufferChunk);
      headLength += bufferChunk.length;

      if (headLength < 4) {
        return;
      }

      const headBuffer = Buffer.concat(headChunks);
      cleanupHeadListeners();
      if (headBuffer.subarray(0, 4).equals(PSD_MAGIC)) {
        const remainingChunks = [headBuffer];
        stream.on("data", (data) => {
          remainingChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
        });
        stream.once("end", () => {
          resolveWith(extractJpegFromPsd(Buffer.concat(remainingChunks)));
        });
        stream.once("error", onError);
        return;
      }

      const output = new PassThrough();
      output.write(headBuffer);
      stream.pipe(output);
      resolveWith(output);
    };

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("error", onError);
  });
};
