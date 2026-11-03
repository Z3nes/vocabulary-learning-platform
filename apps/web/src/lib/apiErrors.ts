import { ApiError } from './api';

const messages: Record<string, string> = {
  PUZZLE_NOT_FOUND: 'Bu oyuna ulaşılamıyor. Listelerine dönüp tekrar dene.',
  PUZZLE_ACTIVE: 'Bu liste ve oyun için yarım kalan bir oturumun var. Devam et veya iptal et.',
  PUZZLE_CONFLICT: 'Oyun başka bir sekmede değişmiş veya bitmiş olabilir. Güncel durumu yükle.',
  PUZZLE_NO_WORDS: 'Bu listede oyuna uygun ifade yok. Uygun kelimeler ekle veya başka liste seç.',
  CROSSWORD_UNAVAILABLE:
    'Seçilen kelimelerle en az 3 kelimeli, bağlantılı bir çapraz bulmaca oluşturulamadı. Başka bir yüzde veya liste seçebilir, listene daha fazla kelime ekleyebilirsin.',
  PRACTICE_SESSION_NOT_FOUND: 'Bu çalışmaya ulaşılamıyor. Listelerine dönüp tekrar dene.',
  PRACTICE_SESSION_ACTIVE: 'Bu kapsam için yarım kalan bir çalışman var. Devam et veya iptal et.',
  PRACTICE_CONFLICT:
    'Bu çalışma başka bir sekmede değişmiş veya bitmiş olabilir. Güncel durumu yükle.',
  EXAMPLES_UNSUPPORTED:
    'Bu ifade için örnek araması desteklenmiyor. Kısa bir İngilizce kelime veya ifade kullan.',
  EXAMPLES_RATE_LIMITED: 'İstek sınırına ulaşıldı. Biraz sonra tekrar dene.',
  EXAMPLES_BUSY: 'Örnek cümle hizmeti şu anda yoğun. Biraz sonra tekrar dene.',
  EXAMPLES_TIMEOUT: 'Örnek cümle isteği zaman aşımına uğradı. Tekrar deneyebilirsin.',
  EXAMPLES_UNAVAILABLE: 'Örnek cümleler şu anda yüklenemiyor. Tekrar deneyebilirsin.',
  EXAMPLES_INVALID_RESPONSE: 'Örnek cümleler şu anda yüklenemiyor. Tekrar deneyebilirsin.',
  GAME_COMPLETION_CONFLICT:
    'Bu oyun kaydı farklı içerikle zaten kaydedilmiş. Geçmişinden kontrol et; yeni bir oyun için çalışma yöntemlerine dön.',
  VALIDATION_FAILED: 'Girdiğin bilgileri kontrol edip tekrar dene.',
  TITLE_REQUIRED: 'Listene bir başlık ver.',
  TITLE_TOO_LONG: 'Liste başlığını en fazla 100 karakterle sınırla.',
  LIST_NOT_FOUND: 'Bu listeye ulaşılamıyor. Listelerine dönüp tekrar dene.',
  WORD_REQUIRED: 'İngilizce kelimeyi veya ifadeyi yaz.',
  WORD_TOO_LONG: 'İngilizce kelimeyi veya ifadeyi en fazla 120 karakterle sınırla.',
  MEANING_REQUIRED: 'En az bir Türkçe anlam yaz; boş anlam alanlarını doldur veya kaldır.',
  MEANING_TOO_LONG: 'Her Türkçe anlamı en fazla 160 karakterle sınırla.',
  MEANING_ALREADY_EXISTS: 'Aynı anlamı birden fazla yazdın. Tekrar eden anlamı kaldır.',
  WORD_ALREADY_EXISTS:
    'Bu kelime listende zaten var. Değişikliklerini o kelimede yap veya yeni anlam eklemek için Kelime ekle seçeneğini kullan.',
  WORD_NOT_FOUND: 'Bu kelimeye ulaşılamıyor. Listeyi yenileyip tekrar dene.',
  BULK_TOO_MANY_LINES: 'Bir seferde en fazla 500 satır yapıştırabilirsin.',
  BULK_TOO_LARGE: 'Yapıştırdığın metin en fazla 100 KB olabilir. Metni küçültüp tekrar dene.',
  BULK_INVALID_CONTENT:
    'Satırları kontrol et. Her satırda kelime ile anlam arasına = veya TAB koy; fazladan sütun ekleme.',
  PREVIEW_STALE:
    'Önizlemeden sonra ilgili kelimeler değişti. Güncel önizlemeyi tekrar inceleyip onayla.',
  SIMILARITY_DECISION_REQUIRED:
    'Benzer anlamlar için ekleme veya atlama seçimini yap, sonra yeniden önizle.',
  SIMILARITY_DECISION_INVALID:
    'Anlam seçimlerin bu önizlemeyle eşleşmiyor. Yeniden önizleyip seçimlerini tekrar yap.',
  STUDY_LIST_EMPTY: 'Bu listede henüz kelime yok. Çalışmaya başlamak için önce kelime ekle.',
  STUDY_SESSION_ACTIVE:
    'Bu listede yarım kalan bir çalışman var. Ona devam edebilir ya da onu bitirip yeni bir çalışma başlatabilirsin.',
  STUDY_SESSION_NOT_FOUND: 'Bu çalışmaya ulaşılamıyor. Listelerine dönüp tekrar dene.',
  STUDY_SESSION_FINISHED: 'Bu çalışma zaten bitti. Sonuçlarını görebilirsin.',
  STUDY_SESSION_STALE:
    'Bu çalışma başka bir sekmede ya da cihazda güncellendi. Güncel kartı gösteriyoruz.',
  STUDY_CARD_ALREADY_ANSWERED:
    'Bu kart başka bir sekmede ya da cihazda zaten değerlendirildi. Güncel kartı gösteriyoruz.',
  STUDY_CARD_NOT_FOUND: 'Bu kart çalışmada bulunamadı. Çalışmanın güncel hâlini gösteriyoruz.',
  STUDY_ACTION_NOT_ALLOWED:
    'Bu işlem bu kart için kullanılamıyor. Çalışmanın güncel hâlini gösteriyoruz.',
  UNAUTHENTICATED: 'Oturumun doğrulanamadı. Daha sonra tekrar dene.',
  INTERNAL_ERROR: 'İşlemin tamamlanamadı. Biraz sonra tekrar dene.',
};

export function apiErrorMessage(error: unknown): string {
  return error instanceof ApiError
    ? Object.hasOwn(messages, error.code)
      ? messages[error.code]!
      : 'İşlemin tamamlanamadı. Daha sonra tekrar dene.'
    : 'Sunucuya ulaşılamıyor. Bağlantını kontrol edip tekrar dene.';
}

export function validateListTitle(value: string): { title: string; error?: string } {
  const title = value.normalize('NFC').trim();
  const length = [...title].length;
  if (!length) return { title, error: messages['TITLE_REQUIRED']! };
  if (length > 100) return { title, error: messages['TITLE_TOO_LONG']! };
  return { title };
}
