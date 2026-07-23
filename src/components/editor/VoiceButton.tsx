import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  onTranscript: (text: string) => void;
};

// Minimal typing for the vendor-prefixed API.
type SR = {
  new (): {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: (e: { results: { 0: { transcript: string } }[] }) => void;
    onend: () => void;
    onerror: () => void;
    start: () => void;
    stop: () => void;
  };
};

export function VoiceButton({ onTranscript }: Props) {
  const [recording, setRecording] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<InstanceType<SR> | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: SR;
      webkitSpeechRecognition?: SR;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) setSupported(false);
  }, []);

  const toggle = () => {
    if (!supported) return;
    if (recording) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: SR;
      webkitSpeechRecognition?: SR;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results as unknown as ArrayLike<{ 0: { transcript: string } }>)
        .map((r) => r[0].transcript)
        .join(" ");
      if (text) onTranscript(text);
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    recRef.current = rec;
    rec.start();
    setRecording(true);
  };

  return (
    <Button
      type="button"
      variant={recording ? "destructive" : "outline"}
      onClick={toggle}
      disabled={!supported}
      className="w-full gap-2"
      title={supported ? "Voice input" : "Speech recognition not supported in this browser"}
    >
      {recording ? (
        <>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
          </span>
          Recording…
        </>
      ) : supported ? (
        <>
          <Mic className="h-4 w-4" />
          Voice input
        </>
      ) : (
        <>
          <MicOff className="h-4 w-4" />
          Voice unsupported
        </>
      )}
    </Button>
  );
}
