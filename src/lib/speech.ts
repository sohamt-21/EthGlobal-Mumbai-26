import { useCallback, useEffect, useRef, useState } from "react"

/* Minimal typings for the Web Speech API (not in lib.dom for all browsers). */
type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } }
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
type RecognitionCtor = new () => SpeechRecognitionLike

function getRecognition(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Browser speech-to-text + text-to-speech. Independent of orchestration: it only produces text
 * for the command box and speaks text it is given. Degrades to text-only when unsupported/denied.
 */
export function useSpeech(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const rec = useRef<SpeechRecognitionLike | null>(null)
  const finalCb = useRef(onFinal)
  finalCb.current = onFinal

  const sttSupported = typeof window !== "undefined" && getRecognition() !== null
  const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window

  const start = useCallback(() => {
    const Ctor = getRecognition()
    if (!Ctor) {
      setError("Speech recognition is not supported in this browser — use the text box.")
      return
    }
    setError(null)
    const r = new Ctor()
    r.lang = "en-US"
    r.continuous = false
    r.interimResults = true
    let finalText = ""
    r.onresult = (e) => {
      let live = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) finalText += res[0].transcript
        else live += res[0].transcript
      }
      setInterim(finalText + live)
    }
    r.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Microphone permission denied — you can keep using text." : `Speech error: ${e.error}`)
      setListening(false)
    }
    r.onend = () => {
      setListening(false)
      setInterim("")
      if (finalText.trim()) finalCb.current(finalText.trim())
    }
    rec.current = r
    r.start()
    setListening(true)
  }, [])

  const stop = useCallback(() => rec.current?.stop(), [])

  const speak = useCallback(
    (text: string) => {
      if (!ttsSupported || !text) return
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = 1.02
      u.onstart = () => setSpeaking(true)
      u.onend = () => setSpeaking(false)
      u.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(u)
    },
    [ttsSupported],
  )

  const cancelSpeech = useCallback(() => {
    if (ttsSupported) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [ttsSupported])

  useEffect(() => () => rec.current?.stop(), [])

  return { listening, interim, error, speaking, sttSupported, ttsSupported, start, stop, speak, cancelSpeech }
}
