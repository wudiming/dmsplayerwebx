/**
 * 音频元数据与标签内嵌服务 (Pure TypeScript / Node.js)
 * 支持 MP3 (ID3v2.3) 与 FLAC (Vorbis Comments + METADATA_BLOCK_PICTURE)
 */

export interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  lyrics?: string;
  coverBuffer?: Buffer;
  coverMime?: string;
}

/**
 * 将整型编码为 4 字节 Synchsafe 整数 (ID3v2 规定最高位为 0)
 */
function encodeSynchsafe(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf[0] = (value >> 21) & 0x7f;
  buf[1] = (value >> 14) & 0x7f;
  buf[2] = (value >> 7) & 0x7f;
  buf[3] = value & 0x7f;
  return buf;
}

/**
 * 构建 ID3v2.3 文本帧 (TIT2, TPE1, TALB 等)
 * 使用 UTF-16LE 编码（带 BOM 0xFF, 0xFE），兼容所有主流播放器
 */
function makeID3v2TextFrame(frameId: string, text: string): Buffer {
  const textBuf = Buffer.from(text, "utf16le");
  // 1 字节编码标识 (0x01 = UTF-16 with BOM) + 2 字节 BOM (0xFF, 0xFE) + 文本内容
  const data = Buffer.concat([Buffer.from([0x01, 0xff, 0xfe]), textBuf]);

  const frame = Buffer.alloc(10 + data.length);
  frame.write(frameId, 0, 4, "ascii");
  frame.writeUInt32BE(data.length, 4); // ID3v2.3 帧大小为标准 32 位大端
  frame.writeUInt16BE(0, 8); // flags
  data.copy(frame, 10);
  return frame;
}

/**
 * 构建 ID3v2.3 歌词帧 (USLT)
 */
function makeID3v2LyricFrame(lyrics: string): Buffer {
  const textBuf = Buffer.from(lyrics, "utf16le");
  // 0x01 (UTF-16 with BOM) + 'zho' (3 字节语言) + 空描述符 (0xFF, 0xFE, 0x00, 0x00) + 歌词 BOM 与内容
  const header = Buffer.from([
    0x01,
    0x7a, 0x68, 0x6f, // 'zho'
    0xff, 0xfe, 0x00, 0x00, // empty descriptor
    0xff, 0xfe, // lyrics BOM
  ]);
  const data = Buffer.concat([header, textBuf]);

  const frame = Buffer.alloc(10 + data.length);
  frame.write("USLT", 0, 4, "ascii");
  frame.writeUInt32BE(data.length, 4);
  frame.writeUInt16BE(0, 8);
  data.copy(frame, 10);
  return frame;
}

/**
 * 构建 ID3v2.3 封面帧 (APIC)
 */
function makeID3v2PictureFrame(imageBuffer: Buffer, mimeType: string = "image/jpeg"): Buffer {
  const mimeBuf = Buffer.from(mimeType, "latin1");
  // 0x00 (ISO-8859-1) + mime + 0x00 + 0x03 (Front Cover) + 0x00 (空描述符结尾) + 图像数据
  const header = Buffer.concat([
    Buffer.from([0x00]),
    mimeBuf,
    Buffer.from([0x00, 0x03, 0x00]),
  ]);
  const data = Buffer.concat([header, imageBuffer]);

  const frame = Buffer.alloc(10 + data.length);
  frame.write("APIC", 0, 4, "ascii");
  frame.writeUInt32BE(data.length, 4);
  frame.writeUInt16BE(0, 8);
  data.copy(frame, 10);
  return frame;
}

/**
 * 为 MP3 数据内嵌 ID3v2.3 标签
 */
export function embedMp3Tags(audioBuffer: Buffer, meta: AudioMetadata): Buffer {
  const frames: Buffer[] = [];

  if (meta.title) frames.push(makeID3v2TextFrame("TIT2", meta.title));
  if (meta.artist) frames.push(makeID3v2TextFrame("TPE1", meta.artist));
  if (meta.album) frames.push(makeID3v2TextFrame("TALB", meta.album));
  if (meta.lyrics) frames.push(makeID3v2LyricFrame(meta.lyrics));
  if (meta.coverBuffer && meta.coverBuffer.length > 0) {
    frames.push(makeID3v2PictureFrame(meta.coverBuffer, meta.coverMime || "image/jpeg"));
  }

  if (frames.length === 0) return audioBuffer;

  const allFrames = Buffer.concat(frames);

  // 检查原音频是否已带有 ID3v2 标签，若有则剥离
  let audioDataStart = 0;
  if (
    audioBuffer.length >= 10 &&
    audioBuffer[0] === 0x49 &&
    audioBuffer[1] === 0x44 &&
    audioBuffer[2] === 0x33
  ) {
    const existingTagSize =
      ((audioBuffer[6] & 0x7f) << 21) |
      ((audioBuffer[7] & 0x7f) << 14) |
      ((audioBuffer[8] & 0x7f) << 7) |
      (audioBuffer[9] & 0x7f);
    audioDataStart = 10 + existingTagSize;
    if (audioDataStart > audioBuffer.length) audioDataStart = audioBuffer.length;
  }

  const rawAudio = audioBuffer.subarray(audioDataStart);

  // 构建新 ID3v2 头部 (10 字节)
  const header = Buffer.alloc(10);
  header.write("ID3", 0, 3, "ascii");
  header[3] = 0x03; // Version 2.3.0
  header[4] = 0x00;
  header[5] = 0x00; // flags
  encodeSynchsafe(allFrames.length).copy(header, 6);

  return Buffer.concat([header, allFrames, rawAudio]);
}

/**
 * 构建 FLAC VORBIS_COMMENT 元数据块
 */
function makeFlacVorbisCommentBlock(meta: AudioMetadata): Buffer {
  const vendor = "SPlayer";
  const vendorBuf = Buffer.from(vendor, "utf8");

  const comments: Buffer[] = [];
  const addComment = (key: string, val: string | undefined) => {
    if (!val) return;
    const str = `${key}=${val}`;
    const commentData = Buffer.from(str, "utf8");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32LE(commentData.length, 0);
    comments.push(Buffer.concat([lenBuf, commentData]));
  };

  if (meta.title) addComment("TITLE", meta.title);
  if (meta.artist) addComment("ARTIST", meta.artist);
  if (meta.album) addComment("ALBUM", meta.album);
  if (meta.lyrics) addComment("LYRICS", meta.lyrics);

  const vendorLenBuf = Buffer.alloc(4);
  vendorLenBuf.writeUInt32LE(vendorBuf.length, 0);

  const commentsCountBuf = Buffer.alloc(4);
  commentsCountBuf.writeUInt32LE(comments.length, 0);

  return Buffer.concat([vendorLenBuf, vendorBuf, commentsCountBuf, ...comments]);
}

/**
 * 构建 FLAC PICTURE 元数据块
 */
function makeFlacPictureBlock(imageBuffer: Buffer, mimeType: string = "image/jpeg"): Buffer {
  const mimeBuf = Buffer.from(mimeType, "ascii");

  const head = Buffer.alloc(32);
  head.writeUInt32BE(3, 0); // 3 = Front cover
  head.writeUInt32BE(mimeBuf.length, 4); // MIME length
  // 8.. + mime
  const tail = Buffer.alloc(24);
  tail.writeUInt32BE(0, 0); // description length: 0
  tail.writeUInt32BE(0, 4); // width
  tail.writeUInt32BE(0, 8); // height
  tail.writeUInt32BE(0, 12); // color depth
  tail.writeUInt32BE(0, 16); // indexed colors
  tail.writeUInt32BE(imageBuffer.length, 20); // image length

  return Buffer.concat([head.subarray(0, 8), mimeBuf, tail, imageBuffer]);
}

/**
 * 为 FLAC 数据内嵌 Vorbis Comments 和 Cover Picture
 */
export function embedFlacTags(audioBuffer: Buffer, meta: AudioMetadata): Buffer {
  // 必须以 "fLaC" 开头
  if (
    audioBuffer.length < 4 ||
    audioBuffer.toString("ascii", 0, 4) !== "fLaC"
  ) {
    return audioBuffer;
  }

  // 解析现有 metadata blocks
  interface Block {
    type: number;
    data: Buffer;
  }
  const blocksToKeep: Block[] = [];
  let offset = 4;
  let isLast = false;

  while (offset + 4 <= audioBuffer.length && !isLast) {
    const headerByte = audioBuffer[offset];
    isLast = (headerByte & 0x80) !== 0;
    const blockType = headerByte & 0x7f;
    const length =
      (audioBuffer[offset + 1] << 16) |
      (audioBuffer[offset + 2] << 8) |
      audioBuffer[offset + 3];

    offset += 4;
    const blockData = audioBuffer.subarray(offset, offset + length);
    offset += length;

    // 保留非 VORBIS_COMMENT (4) 且非 PICTURE (6) 且非 PADDING (1) 的块
    if (blockType !== 4 && blockType !== 6 && blockType !== 1) {
      blocksToKeep.push({ type: blockType, data: Buffer.from(blockData) });
    }
  }

  const rawAudio = audioBuffer.subarray(offset);

  // 生成新的 Vorbis Comments 块
  const vorbisData = makeFlacVorbisCommentBlock(meta);
  blocksToKeep.push({ type: 4, data: vorbisData });

  // 生成新的 Picture 块（若有）
  if (meta.coverBuffer && meta.coverBuffer.length > 0) {
    const picData = makeFlacPictureBlock(meta.coverBuffer, meta.coverMime || "image/jpeg");
    blocksToKeep.push({ type: 6, data: picData });
  }

  // 重新序列化 FLAC metadata blocks
  const serializedBlocks: Buffer[] = [];
  for (let i = 0; i < blocksToKeep.length; i++) {
    const b = blocksToKeep[i];
    const isThisLast = i === blocksToKeep.length - 1;
    const header = Buffer.alloc(4);
    header[0] = (isThisLast ? 0x80 : 0x00) | (b.type & 0x7f);
    header[1] = (b.data.length >> 16) & 0xff;
    header[2] = (b.data.length >> 8) & 0xff;
    header[3] = b.data.length & 0xff;
    serializedBlocks.push(header, b.data);
  }

  return Buffer.concat([
    Buffer.from("fLaC", "ascii"),
    ...serializedBlocks,
    rawAudio,
  ]);
}

/**
 * 自动识别音频格式并写入元信息标签
 */
export function embedAudioTags(audioBuffer: Buffer, formatHint: string | undefined, meta: AudioMetadata): Buffer {
  try {
    // 1. 判断是否为 FLAC
    if (
      formatHint?.toLowerCase() === "flac" ||
      (audioBuffer.length >= 4 && audioBuffer.toString("ascii", 0, 4) === "fLaC")
    ) {
      return embedFlacTags(audioBuffer, meta);
    }

    // 2. 默认作为 MP3 处理
    return embedMp3Tags(audioBuffer, meta);
  } catch (err) {
    console.error("[tagWriter] Failed to embed tags, returning original buffer:", err);
    return audioBuffer;
  }
}
