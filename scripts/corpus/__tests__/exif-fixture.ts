// Builds a JPEG carrying a real EXIF APP1 segment, so the ingest path can be
// tested against bytes exifr actually has to parse rather than a hand-written
// tag object. Nothing decodes the image, so no encoder is needed: exifr reads
// the APP1 segment and never touches the scan data.
//
// Little-endian TIFF ("II"), IFD0 -> ExifIFD. Only the tags ingest reads.

export type ExifFixture = {
  make: string;
  model: string;
  fNumber: number;          // written as a RATIONAL with denominator 10
  exposureTimeDen: number;  // shutter is 1/<den> seconds
  iso: number;
  dateTimeOriginal: string; // "YYYY:MM:DD HH:MM:SS"
  biasNum: number;          // ExposureBiasValue as a SRATIONAL
  biasDen: number;
  meteringMode: number;     // EXIF code, e.g. 5 = pattern
};

const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const TYPE_SRATIONAL = 10;

export function buildExifApp1(f: ExifFixture): Buffer {
  const makeBuf = Buffer.from(`${f.make}\0`, "ascii");
  const modelBuf = Buffer.from(`${f.model}\0`, "ascii");
  const dtBuf = Buffer.from(`${f.dateTimeOriginal}\0`, "ascii");

  const IFD0_COUNT = 3;
  const EXIF_COUNT = 6;
  const ifd0Start = 8;
  const ifd0End = ifd0Start + 2 + IFD0_COUNT * 12 + 4;
  const makeOff = ifd0End;
  const modelOff = makeOff + makeBuf.length;
  const exifIfdStart = modelOff + modelBuf.length;
  const exifIfdEnd = exifIfdStart + 2 + EXIF_COUNT * 12 + 4;
  const expTimeOff = exifIfdEnd;
  const fNumberOff = expTimeOff + 8;
  const dtOff = fNumberOff + 8;
  const biasOff = dtOff + dtBuf.length;

  const tiff = Buffer.alloc(biasOff + 8);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(ifd0Start, 4);

  let p = 0;
  // A tag whose payload fits in four bytes stores it inline; anything longer
  // stores an offset into the data area instead.
  const entry = (tag: number, type: number, count: number, value: number): void => {
    tiff.writeUInt16LE(tag, p);
    tiff.writeUInt16LE(type, p + 2);
    tiff.writeUInt32LE(count, p + 4);
    tiff.writeUInt32LE(value, p + 8);
    p += 12;
  };

  p = ifd0Start;
  tiff.writeUInt16LE(IFD0_COUNT, p);
  p += 2;
  entry(0x010f, TYPE_ASCII, makeBuf.length, makeOff);    // Make
  entry(0x0110, TYPE_ASCII, modelBuf.length, modelOff);  // Model
  entry(0x8769, TYPE_LONG, 1, exifIfdStart);             // ExifOffset
  tiff.writeUInt32LE(0, p);                              // no IFD1
  makeBuf.copy(tiff, makeOff);
  modelBuf.copy(tiff, modelOff);

  p = exifIfdStart;
  tiff.writeUInt16LE(EXIF_COUNT, p);
  p += 2;
  entry(0x829a, TYPE_RATIONAL, 1, expTimeOff);           // ExposureTime
  entry(0x829d, TYPE_RATIONAL, 1, fNumberOff);           // FNumber
  entry(0x8827, TYPE_SHORT, 1, f.iso);                   // ISOSpeedRatings
  entry(0x9003, TYPE_ASCII, dtBuf.length, dtOff);        // DateTimeOriginal
  entry(0x9204, TYPE_SRATIONAL, 1, biasOff);             // ExposureBiasValue
  entry(0x9207, TYPE_SHORT, 1, f.meteringMode);          // MeteringMode
  tiff.writeUInt32LE(0, p);

  tiff.writeUInt32LE(1, expTimeOff);
  tiff.writeUInt32LE(f.exposureTimeDen, expTimeOff + 4);
  tiff.writeUInt32LE(Math.round(f.fNumber * 10), fNumberOff);
  tiff.writeUInt32LE(10, fNumberOff + 4);
  dtBuf.copy(tiff, dtOff);
  tiff.writeInt32LE(f.biasNum, biasOff);
  tiff.writeInt32LE(f.biasDen, biasOff + 4);

  const header = Buffer.alloc(10);
  header.writeUInt16BE(0xffe1, 0);              // APP1 marker
  header.writeUInt16BE(2 + 6 + tiff.length, 2); // length, including itself
  header.write("Exif\0\0", 4, "binary");
  return Buffer.concat([header, tiff]);
}

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

// A JPEG with EXIF and nothing else. `filler` makes two otherwise identical
// fixtures differ in bytes, so they hash to different ids.
export function jpegWithExif(f: ExifFixture, filler = ""): Buffer {
  return Buffer.concat([
    SOI,
    buildExifApp1(f),
    Buffer.from(filler, "ascii"),
    EOI,
  ]);
}

export function jpegWithoutExif(filler = ""): Buffer {
  return Buffer.concat([SOI, Buffer.from(`no exif here${filler}`, "ascii"), EOI]);
}

export const BASE_FIXTURE: ExifFixture = {
  make: "TestCam",
  model: "TC-1",
  fNumber: 8,
  exposureTimeDen: 128,
  iso: 100,
  dateTimeOriginal: "2026:03:01 10:00:00",
  biasNum: 0,
  biasDen: 1,
  meteringMode: 5,
};
