/**
 * Web Audio 实时音调调节器 (Pitch Shifter) AudioWorklet 源码
 *
 * 基于双 Grain 50% 窗函数重叠相加（Overlap-Add, OLA）实时变速变调算法：
 * - 两个 Grain 相位差半个周期（1024 样本），三角形窗函数之和在所有相位恒等于 1.0，完全杜绝振幅调制失真；
 * - 环形缓冲区结合次样本级双线性插值（Linear Interpolation），平滑支持非整数音调比；
 * - 当 pitch === 0（半音为 0）时走零开销直接透传（Bypass）；
 * - 支持 -12 到 +12 个半音平滑实时调节。
 */
export const PITCH_SHIFTER_WORKLET_SOURCE = `
class PitchShifterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pitch = 0; // 半音数 [-12, 12]
    this.bufferSize = 8192;
    this.mask = 8191;
    this.grainSize = 2048;
    this.halfGrain = 1024;

    // 双声道环形缓存
    this.bufferL = new Float32Array(this.bufferSize);
    this.bufferR = new Float32Array(this.bufferSize);
    this.writeIndex = 0;

    // Grain 相位与读指针锚点
    this.phase0 = 0;
    this.readAnchor0 = 0;
    this.readAnchor1 = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (data && typeof data.pitch === "number") {
        this.pitch = Math.max(-12, Math.min(12, Math.round(data.pitch)));
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const inpL = input[0];
    const inpR = input[1] || inpL;
    const outL = output[0];
    const outR = output[1] || outL;
    const len = inpL.length;

    // 当音调为 0 时直接透传，零 CPU 开销
    if (this.pitch === 0) {
      outL.set(inpL);
      if (output[1]) outR.set(inpR);
      return true;
    }

    // 变调频率比 ratio = 2^(semitones / 12)
    const pitchRatio = Math.pow(2, this.pitch / 12);

    for (let i = 0; i < len; i++) {
      const w = this.writeIndex;
      this.bufferL[w] = inpL[i];
      this.bufferR[w] = inpR[i];

      // ── Grain 0 ──
      if (this.phase0 === 0) {
        this.readAnchor0 = (w - this.halfGrain) & this.mask;
      }
      const readPos0 = (this.readAnchor0 + this.phase0 * pitchRatio) & this.mask;
      const idx0_0 = Math.floor(readPos0);
      const frac0 = readPos0 - idx0_0;
      const idx0_1 = (idx0_0 + 1) & this.mask;

      const samp0L = this.bufferL[idx0_0] * (1 - frac0) + this.bufferL[idx0_1] * frac0;
      const samp0R = this.bufferR[idx0_0] * (1 - frac0) + this.bufferR[idx0_1] * frac0;
      const win0 = 1.0 - Math.abs(this.phase0 - this.halfGrain) / this.halfGrain;

      // ── Grain 1（与 Grain 0 相差 halfGrain） ──
      const phase1 = (this.phase0 + this.halfGrain) % this.grainSize;
      if (phase1 === 0) {
        this.readAnchor1 = (w - this.halfGrain) & this.mask;
      }
      const readPos1 = (this.readAnchor1 + phase1 * pitchRatio) & this.mask;
      const idx1_0 = Math.floor(readPos1);
      const frac1 = readPos1 - idx1_0;
      const idx1_1 = (idx1_0 + 1) & this.mask;

      const samp1L = this.bufferL[idx1_0] * (1 - frac1) + this.bufferL[idx1_1] * frac1;
      const samp1R = this.bufferR[idx1_0] * (1 - frac1) + this.bufferR[idx1_1] * frac1;
      const win1 = 1.0 - Math.abs(phase1 - this.halfGrain) / this.halfGrain;

      // 窗函数加权混合（win0 + win1 恒等于 1.0）
      outL[i] = samp0L * win0 + samp1L * win1;
      outR[i] = samp0R * win0 + samp1R * win1;

      this.phase0 = (this.phase0 + 1) % this.grainSize;
      this.writeIndex = (w + 1) & this.mask;
    }

    return true;
  }
}

registerProcessor("pitch-shifter-processor", PitchShifterProcessor);
`;
