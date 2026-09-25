import SparkMD5 from "spark-md5";

/**
 * 分块计算浏览器 File / Blob 对象的 MD5 哈希（32位小写十六进制）
 * 采用 2MB 分块避免大文件占用过多内存，同时支持分块进度回报
 *
 * @param file 本地音频文件或 Blob 对象
 * @param onProgress 分块读取进度回调 (loaded, total)
 * @returns 32 位 MD5 字符串
 */
export async function computeFileMd5(
  file: Blob | File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size === 0) {
      resolve(new SparkMD5().end());
      return;
    }

    const chunkSize = 2 * 1024 * 1024; // 2MB 分块
    const chunks = Math.ceil(file.size / chunkSize);
    let currentChunk = 0;
    const spark = new SparkMD5.ArrayBuffer();
    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      const result = e.target?.result as ArrayBuffer;
      if (result) {
        spark.append(result);
      }
      currentChunk++;
      if (onProgress) {
        onProgress(Math.min(file.size, currentChunk * chunkSize), file.size);
      }
      if (currentChunk < chunks) {
        loadNext();
      } else {
        resolve(spark.end());
      }
    };

    fileReader.onerror = () => {
      reject(new Error("读取音频文件计算 MD5 失败"));
    };

    function loadNext() {
      const start = currentChunk * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      fileReader.readAsArrayBuffer(file.slice(start, end));
    }

    loadNext();
  });
}
