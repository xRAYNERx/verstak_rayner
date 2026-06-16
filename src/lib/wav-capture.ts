/** Запись моно WAV — совместима со всеми STT (в т.ч. xAI, без webm). */

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, numSamples * 2, true)

  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

export class WavCapture {
  private readonly ctx: AudioContext
  private readonly processor: ScriptProcessorNode
  private readonly chunks: Float32Array[] = []
  readonly sampleRate: number

  private constructor(ctx: AudioContext, stream: MediaStream) {
    this.ctx = ctx
    this.sampleRate = ctx.sampleRate
    const source = ctx.createMediaStreamSource(stream)
    this.processor = ctx.createScriptProcessor(4096, 1, 1)
    this.processor.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0)
      this.chunks.push(new Float32Array(data))
    }
    const mute = ctx.createGain()
    mute.gain.value = 0
    source.connect(this.processor)
    this.processor.connect(mute)
    mute.connect(ctx.destination)
  }

  /** Создать захват после user-gesture; будит AudioContext (иначе тишина). */
  static async create(stream: MediaStream): Promise<WavCapture> {
    const ctx = new AudioContext({ sampleRate: 16000 })
    if (ctx.state === 'suspended') await ctx.resume()
    return new WavCapture(ctx, stream)
  }

  async stop(): Promise<Blob> {
    this.processor.onaudioprocess = null
    this.processor.disconnect()
    if (this.ctx.state !== 'closed') await this.ctx.close()

    const total = this.chunks.reduce((s, c) => s + c.length, 0)
    const merged = new Float32Array(total)
    let offset = 0
    for (const c of this.chunks) {
      merged.set(c, offset)
      offset += c.length
    }
    return encodeWav(merged, this.sampleRate)
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}