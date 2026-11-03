import { Square, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { SelectField } from '../../components/ui/fields';
import { BrowserSpeech, BrowserSpeechError, fetchSpeech, type SpeechAsset } from '../../lib/speech';

/** Per-question lifetime: cleanup stops network/media/speech and revokes object URLs. */
export function AudioControls({
  sessionId,
  questionId,
  availability,
}: {
  sessionId: string;
  questionId: string;
  availability: (ready: boolean) => void;
}) {
  const [browser] = useState(() => new BrowserSpeech());
  const [rate, setRate] = useState<0.8 | 1>(1);
  const [notice, setNotice] = useState('Dinlemek için düğmeye bas. Ses otomatik başlamaz.');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const asset = useRef<SpeechAsset | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const media = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const cancelMedia = useRef<(() => void) | null>(null);
  const stop = () => {
    generation.current++;
    request.current?.abort();
    browser.stop();
    cancelMedia.current?.();
    cancelMedia.current = null;
    if (media.current) {
      media.current.pause();
      media.current.removeAttribute('src');
      media.current.load();
      media.current = null;
    }
    if (url.current) {
      URL.revokeObjectURL(url.current);
      url.current = null;
    }
  };
  useEffect(() => {
    const lifetime = generation;
    const unsubscribe = browser.subscribe(() => {
      if (browser.available())
        setNotice('Tarayıcının İngilizce sesi hazır. Tekrar dinleyebilirsin.');
    });
    return () => {
      unsubscribe();
      lifetime.current++;
      request.current?.abort();
      browser.stop();
      cancelMedia.current?.();
      if (media.current) {
        media.current.pause();
        media.current.removeAttribute('src');
        media.current.load();
      }
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, [browser]);

  async function play() {
    stop();
    const token = generation.current;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setPlaying(false);
    setNotice('Ses hazırlanıyor…');
    try {
      asset.current ??= await fetchSpeech(sessionId, questionId, 'preferred', controller.signal);
      if (token !== generation.current) return;
      setPrepared(true);
      if (asset.current.kind === 'azure') {
        try {
          const audio = new Audio();
          media.current = audio;
          url.current = URL.createObjectURL(asset.current.blob);
          audio.src = url.current;
          audio.playbackRate = rate;
          audio.preservesPitch = true;
          await new Promise<void>((resolve, reject) => {
            let finished = false;
            const timer = setTimeout(() => finish(new Error('Audio timeout')), 30000);
            const finish = (error?: Error) => {
              if (finished) return;
              finished = true;
              clearTimeout(timer);
              audio.onended = null;
              audio.onerror = null;
              cancelMedia.current = null;
              if (error) reject(error);
              else resolve();
            };
            cancelMedia.current = () => finish(new Error('canceled'));
            audio.onended = () => finish();
            audio.onerror = () => finish(new Error('Audio unavailable'));
            void audio
              .play()
              .then(() => {
                if (!finished && token === generation.current) {
                  setLoading(false);
                  setPlaying(true);
                  setNotice('Ses çalıyor.');
                }
              })
              .catch(() => finish(new Error('Playback unavailable')));
          });
          if (token !== generation.current) return;
          availability(true);
          setNotice('Ses bitti. Tekrar dinleyebilirsin.');
          return;
        } catch {
          if (token !== generation.current) return;
          media.current?.pause();
          if (url.current) {
            URL.revokeObjectURL(url.current);
            url.current = null;
          }
          // No second Azure synthesis in this attempt, including decode/gesture errors.
          asset.current = await fetchSpeech(sessionId, questionId, 'browser', controller.signal);
        }
      }
      if (token !== generation.current) return;
      if (asset.current.kind !== 'browser') throw new Error('Browser fallback unavailable');
      setLoading(false);
      setPlaying(true);
      setNotice('Tarayıcının İngilizce sesi çalıyor.');
      await browser.play(asset.current.text, rate);
      if (token !== generation.current) return;
      availability(true);
      setNotice('Ses bitti. Tarayıcı sesiyle tekrar dinleyebilirsin.');
    } catch (error) {
      if (token !== generation.current) return;
      if (error instanceof BrowserSpeechError && error.reason === 'canceled') return;
      availability(false);
      setNotice(
        error instanceof BrowserSpeechError && error.reason === 'no_english_voice'
          ? 'Tarayıcında uygun bir İngilizce ses henüz bulunamadı. Sesler yüklenince tekrar dene veya bu soruyu ses kullanılamadığı için atla.'
          : 'Ses üretilemedi. Tarayıcının ses desteğini ve bağlantını kontrol edip tekrar dinle veya bu soruyu ses kullanılamadığı için atla.',
      );
    } finally {
      if (token === generation.current) {
        setLoading(false);
        setPlaying(false);
      }
    }
  }
  return (
    // Rendered inside a listening question, so it takes that mode's colors.
    <div className="grid gap-3 rounded-card border border-(--mode-soft) bg-(--mode-tint)/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          variant="mode"
          loading={loading}
          icon={<Volume2 aria-hidden="true" size="1em" />}
          onClick={() => void play()}
        >
          {prepared ? 'Tekrar dinle' : 'Dinle'}
        </Button>
        {playing ? (
          <Button
            variant="secondary"
            icon={<Square aria-hidden="true" size="1em" />}
            onClick={() => {
              stop();
              setPlaying(false);
              setLoading(false);
              setNotice('Ses durduruldu.');
            }}
          >
            Sesi durdur
          </Button>
        ) : null}
        <div className="w-full sm:ml-auto sm:w-48">
          <SelectField
            label="Ses hızı"
            value={rate}
            onChange={(e) => {
              stop();
              setRate(e.target.value === '0.8' ? 0.8 : 1);
              setLoading(false);
              setPlaying(false);
              setNotice('Hız değişti. Dinlemek için düğmeye bas.');
            }}
          >
            <option value="1">1.0× · Normal</option>
            <option value="0.8">0.8× · Yavaş</option>
          </SelectField>
        </div>
      </div>
      <p role="status" className="text-small text-fg">
        {notice}
      </p>
      <p className="text-caption text-fg-muted">
        Ses yapay olarak üretilir. Tarayıcı sesinin kullanılabilirliği ve kalitesi cihazına
        bağlıdır.
      </p>
    </div>
  );
}
