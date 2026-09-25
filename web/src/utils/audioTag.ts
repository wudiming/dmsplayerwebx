/**
 * 音频元数据解析工具
 * 支持从文件名解析 "歌手 - 歌名" / "歌名"
 * 支持从 MP3 ID3v2 头部解析标题、歌手、专辑标签
 */

export interface ParsedAudioMeta {
  title: string;
  artist: string;
  album: string;
}

/**
 * 从文件名解析基础信息
 * 常见命名规则：
 * 1. "周杰伦 - 晴天.mp3" -> artist: 周杰伦, title: 晴天
 * 2. "晴天.mp3" -> artist: 未知艺术家, title: 晴天
 */
export function parseAudioFromFilename(fileName: string): ParsedAudioMeta {
  const baseName = fileName.replace(/\.[^.]+$/, "").trim();
  let title = baseName;
  let artist = "未知艺术家";
  const album = "未知专辑";

  if (baseName.includes(" - ")) {
    const parts = baseName.split(" - ");
    if (parts.length >= 2) {
      const p0 = parts[0].trim();
      const p1 = parts.slice(1).join(" - ").trim();
      if (p0 && p1) {
        artist = p0;
        title = p1;
      }
    }
  }

  return { title, artist, album };
}

/**
 * 尝试从文件头部读取基础 ID3v2 标签（TIT2 标题, TPE1 歌手, TALB 专辑）
 */
export async function readBasicAudioTags(
  file: Blob | File,
): Promise<Partial<ParsedAudioMeta>> {
  try {
    const head = await file.slice(0, 128 * 1024).arrayBuffer();
    const bytes = new Uint8Array(head);

    // ID3 标志: 'I', 'D', '3'
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const version = bytes[3]; // ID3v2.3 或 ID3v2.4
      const tagSize =
        ((bytes[6] & 0x7f) << 21) |
        ((bytes[7] & 0x7f) << 14) |
        ((bytes[8] & 0x7f) << 7) |
        (bytes[9] & 0x7f);

      const limit = Math.min(bytes.length, 10 + tagSize);
      let offset = 10;
      const tags: Partial<ParsedAudioMeta> = {};

      const decoderUtf8 = new TextDecoder("utf-8");
      const decoderUtf16 = new TextDecoder("utf-16le");

      const decodeText = (rawBytes: Uint8Array): string => {
        if (rawBytes.length <= 1) return "";
        const enc = rawBytes[0];
        const content = rawBytes.subarray(1);
        try {
          if (enc === 0) {
            return decoderUtf8.decode(content).replace(/\0+$/, "").trim();
          } else if (enc === 1 || enc === 2) {
            return decoderUtf16.decode(content).replace(/\0+$/, "").trim();
          } else if (enc === 3) {
            return decoderUtf8.decode(content).replace(/\0+$/, "").trim();
          }
        } catch {}
        return "";
      };

      while (offset + 10 < limit) {
        const frameId = String.fromCharCode(
          bytes[offset],
          bytes[offset + 1],
          bytes[offset + 2],
          bytes[offset + 3],
        );
        if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

        let frameSize = 0;
        if (version === 4) {
          frameSize =
            ((bytes[offset + 4] & 0x7f) << 21) |
            ((bytes[offset + 5] & 0x7f) << 14) |
            ((bytes[offset + 6] & 0x7f) << 7) |
            (bytes[offset + 7] & 0x7f);
        } else {
          frameSize =
            (bytes[offset + 4] << 24) |
            (bytes[offset + 5] << 16) |
            (bytes[offset + 6] << 8) |
            bytes[offset + 7];
        }

        offset += 10;
        if (frameSize <= 0 || offset + frameSize > limit) break;

        const frameData = bytes.subarray(offset, offset + frameSize);
        if (frameId === "TIT2") {
          const val = decodeText(frameData);
          if (val) tags.title = val;
        } else if (frameId === "TPE1") {
          const val = decodeText(frameData);
          if (val) tags.artist = val;
        } else if (frameId === "TALB") {
          const val = decodeText(frameData);
          if (val) tags.album = val;
        }

        offset += frameSize;
      }

      return tags;
    }
  } catch {
    // 忽略标签读取解析异常
  }

  return {};
}

/**
 * 综合提取音频文件元数据（优先 ID3 标签，后备从文件名提取）
 */
export async function getAudioFileMeta(file: Blob | File, fileName: string): Promise<ParsedAudioMeta> {
  const fromFilename = parseAudioFromFilename(fileName);
  try {
    const fromTags = await readBasicAudioTags(file);
    return {
      title: fromTags.title || fromFilename.title,
      artist: fromTags.artist || fromFilename.artist,
      album: fromTags.album || fromFilename.album,
    };
  } catch {
    return fromFilename;
  }
}
