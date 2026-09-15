// Browser can't decode the file — typically HEIC on Android. No decoder is
// bundled for this on purpose.
export class UnsupportedImageError extends Error {
  readonly code = "unsupported_image" as const;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UnsupportedImageError";
  }
}

export class ImageTooLargeError extends Error {
  readonly code = "image_too_large" as const;
  readonly stage: "input" | "output";
  readonly bytes: number;
  readonly limitBytes: number;

  constructor(stage: "input" | "output", bytes: number, limitBytes: number) {
    super(
      stage === "input"
        ? `Image is ${bytes} bytes; the limit is ${limitBytes} bytes before decoding.`
        : `Prepared image is ${bytes} bytes of base64; the limit is ${limitBytes} bytes.`,
    );
    this.name = "ImageTooLargeError";
    this.stage = stage;
    this.bytes = bytes;
    this.limitBytes = limitBytes;
  }
}
