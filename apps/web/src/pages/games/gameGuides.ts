import type { GameType } from '../../lib/games';
import type { PuzzleType } from '../../lib/puzzles';

export interface GameGuide {
  /** What the student does in one round. */
  description: string;
  /** Round size and the vocabulary a list needs (mirrors lib/games.ts and the puzzle rules). */
  requirement: string;
}

export const gameGuides: Record<GameType | PuzzleType, GameGuide> = {
  quiz: {
    description: 'İngilizce kelimenin doğru Türkçe anlam grubunu dört seçenek arasından seç.',
    requirement: 'Turda en çok 10 soru · Anlamları kesişmeyen en az 4 kelime gerekir.',
  },
  matching: {
    description: 'İngilizce kelimeleri Türkçe anlam gruplarıyla eşleştir.',
    requirement: 'Turda en çok 5 çift · Anlamları kesişmeyen en az 2 kelime gerekir.',
  },
  assembly: {
    description: 'Türkçe anlamı verilen İngilizce kelimeyi karışık harflerden oluştur.',
    requirement: 'Turda en çok 8 kelime · Yalnızca A–Z harflerinden oluşan 3–12 harfli kelimeler.',
  },
  memory: {
    description: 'Kapalı kartları ikişer aç; İngilizce kelimeyi Türkçe anlamıyla eşleştir.',
    requirement: 'Turda en çok 6 çift · Anlamları kesişmeyen en az 2 kelime gerekir.',
  },
  'word-search': {
    description: 'Türkçe anlamları verilen İngilizce ifadeleri harf tahtasında bul.',
    requirement: 'A–Z harfleri ve boşluklardan oluşan, toplam 2–18 harfli ifadeler kullanılır.',
  },
  crossword: {
    description: 'Türkçe ipuçlarından İngilizce karşılıkları hatırla ve kesişen hücrelere yaz.',
    requirement:
      'A–Z harfleri ve boşluklardan oluşan ifadeler · Her tahtada en az 3 kesişen kelime.',
  },
};
