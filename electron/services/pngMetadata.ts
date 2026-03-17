import fs from 'fs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Prefix for all ImageVibe metadata keys */
const METADATA_PREFIX = 'ImageVibe:';

/**
 * Embed metadata as PNG tEXt chunks into an image buffer.
 * Returns a new Buffer with the metadata inserted before IEND.
 */
export function embedMetadata(
  pngBuffer: Buffer,
  metadata: Record<string, string>
): Buffer {
  // Verify PNG signature
  if (!pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a valid PNG file');
  }

  // Find IEND chunk position
  const iendPos = findChunk(pngBuffer, 'IEND');
  if (iendPos === -1) {
    throw new Error('Invalid PNG: no IEND chunk found');
  }

  // Build tEXt chunks for each metadata entry
  const textChunks: Buffer[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) continue;
    const fullKey = key.startsWith(METADATA_PREFIX) ? key : `${METADATA_PREFIX}${key}`;
    textChunks.push(createTextChunk(fullKey, String(value)));
  }

  if (textChunks.length === 0) return pngBuffer;

  // Concatenate: everything before IEND + tEXt chunks + IEND
  const beforeIend = pngBuffer.subarray(0, iendPos);
  const iendChunk = pngBuffer.subarray(iendPos);
  const metadataBuffer = Buffer.concat(textChunks);

  return Buffer.concat([beforeIend, metadataBuffer, iendChunk]);
}

/**
 * Read all ImageVibe metadata from a PNG file.
 * Also attempts to read A1111-style "parameters" metadata.
 */
export function readMetadata(pngBuffer: Buffer): Record<string, string> | null {
  if (!pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }

  const metadata: Record<string, string> = {};
  let offset = 8; // Skip PNG signature

  while (offset < pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (type === 'tEXt' && dataEnd <= pngBuffer.length) {
      const data = pngBuffer.subarray(dataStart, dataEnd);
      const nullIndex = data.indexOf(0);
      if (nullIndex > 0) {
        const keyword = data.subarray(0, nullIndex).toString('latin1');
        const text = data.subarray(nullIndex + 1).toString('utf-8');

        if (keyword.startsWith(METADATA_PREFIX)) {
          const key = keyword.substring(METADATA_PREFIX.length);
          metadata[key] = text;
        } else if (keyword === 'parameters') {
          // A1111 compatibility
          metadata['_a1111_parameters'] = text;
        }
      }
    }

    if (type === 'IEND') break;
    offset = dataEnd + 4; // Skip CRC
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}

/**
 * Read metadata from a PNG file on disk.
 */
export function readMetadataFromFile(filePath: string): Record<string, string> | null {
  const buffer = fs.readFileSync(filePath);
  return readMetadata(buffer);
}

/**
 * Embed metadata into a PNG file on disk (overwrites the file).
 */
export function embedMetadataToFile(
  filePath: string,
  metadata: Record<string, string>
): void {
  const buffer = fs.readFileSync(filePath);
  const newBuffer = embedMetadata(buffer, metadata);
  fs.writeFileSync(filePath, newBuffer);
}

/** Find the byte offset of a specific chunk type */
function findChunk(buffer: Buffer, chunkType: string): number {
  let offset = 8; // Skip PNG signature
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === chunkType) return offset;
    offset += 12 + length; // 4 length + 4 type + data + 4 CRC
  }
  return -1;
}

/** Create a PNG tEXt chunk */
function createTextChunk(keyword: string, text: string): Buffer {
  const keywordBuf = Buffer.from(keyword, 'latin1');
  const nullBuf = Buffer.from([0]);
  const textBuf = Buffer.from(text, 'utf-8');
  const data = Buffer.concat([keywordBuf, nullBuf, textBuf]);

  const typeBuf = Buffer.from('tEXt', 'ascii');
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);

  const crcData = Buffer.concat([typeBuf, data]);
  const crc = computeCrc(crcData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

/** Compute CRC32 for PNG chunks */
function computeCrc(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Pre-computed CRC32 lookup table */
const crcTable: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table.push(c);
  }
  return table;
})();
