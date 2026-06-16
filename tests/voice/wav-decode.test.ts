import { describe, expect, it } from 'vitest'
import { decodeWavToFloat32 } from '../../electron/voice/wav-decode'

function makeWav16(samples: number[], sampleRate = 16000): Buffer {
  const dataSize = samples.length * 2
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(samples[i] * 0x7fff), 44 + i * 2)
  }
  return buf
}

describe('decodeWavToFloat32', () => {
  it('декодирует mono 16-bit PCM', () => {
    const wav = makeWav16([0, 0.5, -0.5, 1])
    const out = decodeWavToFloat32(wav)
    expect(out.length).toBe(4)
    expect(out[1]).toBeCloseTo(0.5, 2)
    expect(out[2]).toBeCloseTo(-0.5, 2)
  })

  it('ресемплит в 16 kHz', () => {
    const wav = makeWav16([0, 1, 0, -1], 8000)
    const out = decodeWavToFloat32(wav, 16000)
    expect(out.length).toBe(8)
  })
})