/** Декодер mono PCM WAV → Float32Array @ 16 kHz для Whisper. */

export function decodeWavToFloat32(buffer: Buffer, targetRate = 16000): Float32Array {
  if (buffer.length < 44) throw new Error('wav: слишком короткий файл')
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('wav: не WAV-формат')
  }

  let offset = 12
  let audioFormat = 1
  let channels = 1
  let sampleRate = 16000
  let bitsPerSample = 16
  let dataOffset = 0
  let dataSize = 0

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const chunkStart = offset + 8
    if (id === 'fmt ') {
      audioFormat = buffer.readUInt16LE(chunkStart)
      channels = buffer.readUInt16LE(chunkStart + 2)
      sampleRate = buffer.readUInt32LE(chunkStart + 4)
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14)
    } else if (id === 'data') {
      dataOffset = chunkStart
      dataSize = size
      break
    }
    offset = chunkStart + size + (size % 2)
  }

  if (!dataOffset || dataSize < 2) throw new Error('wav: нет аудиоданных')
  if (audioFormat !== 1) throw new Error('wav: только PCM')
  if (bitsPerSample !== 16) throw new Error('wav: только 16-bit PCM')

  const frameCount = Math.floor(dataSize / (bitsPerSample / 8) / channels)
  const mono = new Float32Array(frameCount)
  let read = dataOffset

  for (let i = 0; i < frameCount; i++) {
    let sum = 0
    for (let ch = 0; ch < channels; ch++) {
      const sample = buffer.readInt16LE(read)
      read += 2
      sum += sample / 0x8000
    }
    mono[i] = sum / channels
  }

  if (sampleRate === targetRate) return mono
  return resampleLinear(mono, sampleRate, targetRate)
}

function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const outLen = Math.max(1, Math.round(input.length * toRate / fromRate))
  const out = new Float32Array(outLen)
  const ratio = (input.length - 1) / Math.max(1, outLen - 1)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const idx = Math.floor(pos)
    const frac = pos - idx
    const a = input[idx] ?? 0
    const b = input[idx + 1] ?? a
    out[i] = a + (b - a) * frac
  }
  return out
}