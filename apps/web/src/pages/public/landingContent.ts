/**
 * Static content for the public introduction. Every word below is a synthetic
 * sample: the page never reads, stores or credits a student's vocabulary.
 */

export interface SampleWord {
  english: string;
  meanings: readonly string[];
}

/** The hero deck: a short sample list with single and multiple Turkish meanings. */
export const deckTitle = '3. Hafta';
export const deckWords: readonly SampleWord[] = [
  { english: 'deadline', meanings: ['son teslim tarihi'] },
  { english: 'requirement', meanings: ['gereksinim', 'şart'] },
  { english: 'sustainable', meanings: ['sürdürülebilir'] },
  { english: 'assessment', meanings: ['değerlendirme', 'ölçme'] },
  { english: 'network', meanings: ['ağ', 'iletişim ağı'] },
];

export type MethodId =
  | 'cards'
  | 'written'
  | 'listening'
  | 'mixed'
  | 'quiz'
  | 'matching'
  | 'assembly'
  | 'memory'
  | 'word-search'
  | 'crossword';

export interface Method {
  id: MethodId;
  /** The exact activity name used in the application. */
  name: string;
  /** Where the activity lives in the application's navigation. */
  area: 'Kelime Çalış' | 'Alıştırmalar';
  summary: string;
  detail: string;
}

/** The ten study activities that exist in the application, in its own order. */
export const methods: readonly Method[] = [
  {
    id: 'cards',
    name: 'Kelime kartları',
    area: 'Kelime Çalış',
    summary: 'Kartı çevir, kendini değerlendir.',
    detail:
      'Kartın bir yüzünde İngilizce ifade, diğer yüzünde Türkçe anlamlarının tamamı var. İngilizceden Türkçeye ya da Türkçeden İngilizceye çalış; cevabı gördükten sonra “Bildim” veya “Bilemedim” de.',
  },
  {
    id: 'written',
    name: 'Yazılı Cevap',
    area: 'Kelime Çalış',
    summary: 'Anlamı gör, İngilizcesini yaz.',
    detail:
      'Türkçe anlamların tamamı gösterilir, sen İngilizce karşılığını yazarsın. Cevabın hemen değerlendirilir; yanlış bir cevap seni geriye götürmez.',
  },
  {
    id: 'listening',
    name: 'Dinle ve Yaz',
    area: 'Kelime Çalış',
    summary: 'İfadeyi dinle, duyduğunu yaz.',
    detail:
      'İngilizce ifadeyi dinle ve duyduğun şekilde yaz. İstediğin kadar tekrar dinleyebilir, sesi yavaşlatabilirsin.',
  },
  {
    id: 'mixed',
    name: 'Karma Çalışma',
    area: 'Kelime Çalış',
    summary: 'Dört yöntem, tek oturum.',
    detail:
      'Kart, yazılı cevap, dinleme ve seçenekli soruları tek bir çalışmada bir araya getirir. İster tek bir listenle, ister tüm listelerinle birlikte çalış.',
  },
  {
    id: 'quiz',
    name: 'Klasik test',
    area: 'Alıştırmalar',
    summary: 'Doğru anlamı dört seçenekten bul.',
    detail:
      'Her soruda İngilizce ifadenin Türkçe anlamını dört seçenek arasından seç. Anlamı örtüşen kelimeler aynı soruda yanıltıcı seçenek olarak kullanılmaz.',
  },
  {
    id: 'matching',
    name: 'Eşleştirme',
    area: 'Alıştırmalar',
    summary: 'İfadeleri anlamlarıyla eşleştir.',
    detail:
      'İngilizce ifadeleri Türkçe anlamlarıyla eşleştir. Birbirine benzeyen kelimeleri ayırt etmenin hızlı bir yolu.',
  },
  {
    id: 'assembly',
    name: 'Kelime Oluşturma',
    area: 'Alıştırmalar',
    summary: 'Karışık harfleri doğru sıraya diz.',
    detail:
      'Türkçe anlamına bakarak karışık verilen harflerden İngilizce kelimeyi yeniden kur. Yazımı pekiştirmek için kısa bir alıştırma.',
  },
  {
    id: 'memory',
    name: 'Hafıza Oyunu',
    area: 'Alıştırmalar',
    summary: 'Kartları aç, eşleri bul.',
    detail: 'Kapalı kartları ikişer ikişer aç; İngilizce ifadeyi Türkçe anlamıyla bir araya getir.',
  },
  {
    id: 'word-search',
    name: 'Kelime Avı',
    area: 'Alıştırmalar',
    summary: 'Türkçe ipucundan İngilizceyi bul.',
    detail:
      'Türkçe ipuçlarına bakarak İngilizce ifadeleri harf tahtasında bul. Yarım kalan tahtana kaldığın yerden dönebilirsin.',
  },
  {
    id: 'crossword',
    name: 'Çapraz Bulmaca',
    area: 'Alıştırmalar',
    summary: 'Kesişen cevapları ipuçlarıyla çöz.',
    detail:
      'Kendi kelimelerinden kurulan bulmacada Türkçe ipuçlarıyla kesişen İngilizce cevapları yaz. Yarım kalan bulmacana kaldığın yerden devam et.',
  },
];

/** Methods whose miniature is a small playable demonstration rather than an illustration. */
export const interactiveMethods: ReadonlySet<MethodId> = new Set(['written', 'quiz', 'assembly']);

/** Stable, page-unique DOM id of a method's tab (also used by in-page links). */
export const methodTabId = (id: MethodId) => `yontem-${id}`;
