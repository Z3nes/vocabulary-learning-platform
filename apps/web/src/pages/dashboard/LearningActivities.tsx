import { FamilyBadge } from '../../components/ui/FamilyBadge';
import { ModeLauncher } from '../../components/ui/ModeLauncher';
import type { Mode } from '../../components/ui/modeIcons';
import { cn } from '../../lib/cn';
import { SectionHeader, SectionLink } from './SectionHeader';

interface Activity {
  mode: Mode;
  title: string;
  description: string;
  to: string;
}

interface ActivityGroupData {
  id: string;
  title: string;
  description: string;
  to: string;
  linkLabel: string;
  activities: Activity[];
}

const groups: ActivityGroupData[] = [
  {
    id: 'study',
    title: 'Kelime Çalış',
    description: 'Kelimelerini hatırla, dinle, yaz ve zorlandıklarını tekrar et.',
    to: '/study',
    linkLabel: 'Kelime Çalış sayfası',
    activities: [
      {
        mode: 'flashcards',
        title: 'Kelime kartları',
        description: 'Kartı çevir, kendini kontrol et: Bildim ya da Bilemedim.',
        to: '/study',
      },
      {
        mode: 'written',
        title: 'Yazılı Cevap',
        description: 'Türkçe anlamların tamamını gör ve İngilizce karşılığını yaz.',
        to: '/study#written-lists-title',
      },
      {
        mode: 'listening',
        title: 'Dinle ve Yaz',
        description: 'İngilizce ifadeyi dinle ve duyduğun ifadeyi doğru yaz.',
        to: '/study#listening-lists-title',
      },
      {
        mode: 'review',
        title: 'Zorlandıklarımı Çalış',
        description: 'Tekrar önceliği olan kelimelerini kartlarla yeniden çalış.',
        to: '/study/review',
      },
      {
        mode: 'mixed',
        title: 'Karma Çalışma',
        description: 'Kart, yazma, dinleme ve seçenekli soruları tek çalışmada birleştir.',
        to: '/study/mixed',
      },
    ],
  },
  {
    id: 'games',
    title: 'Alıştırmalar',
    description: 'Kelimelerini kısa alıştırmalarla pekiştir; sonuçlar yalnızca sana görünür.',
    to: '/games',
    linkLabel: 'Alıştırmalar sayfası',
    activities: [
      {
        mode: 'quiz',
        title: 'Klasik test',
        description: 'Her soruda kelimenin doğru Türkçe anlamını seçeneklerden bul.',
        to: '/games/quiz',
      },
      {
        mode: 'matching',
        title: 'Eşleştirme',
        description: 'İngilizce kelimeleri Türkçe anlamlarıyla eşleştir.',
        to: '/games/matching',
      },
      {
        mode: 'memory',
        title: 'Hafıza Oyunu',
        description: 'Kapalı kartları açarak kelimeyi ve anlamını bir arada bul.',
        to: '/games/memory',
      },
      {
        mode: 'assembly',
        title: 'Kelime Oluşturma',
        description: 'Harfleri karışık verilen kelimeyi doğru sıraya diz.',
        to: '/games/assembly',
      },
      {
        mode: 'word-search',
        title: 'Kelime Avı',
        description: 'Türkçe ipuçlarından İngilizce ifadeleri harf tahtasında bul.',
        to: '/games/word-search',
      },
      {
        mode: 'crossword',
        title: 'Çapraz Bulmaca',
        description: 'Kendi kelimelerinle kesişen ipuçlarını çöz; kaldığın yerden devam et.',
        to: '/games/crossword',
      },
    ],
  },
];

/** Entry points for vocabulary study and practice modes. */
export function LearningActivities() {
  return (
    <section id="calisma-yontemleri" aria-labelledby="activities-title" className="grid gap-6">
      <SectionHeader
        id="activities-title"
        title="Çalışma yöntemleri"
        description="Aynı kelimeleri farklı yollarla çalış: hatırla, yaz, dinle veya kısa alıştırmalarla pekiştir."
      />
      <div className="grid gap-6">
        {groups.map((group) => (
          <ActivityGroup key={group.id} {...group} />
        ))}
      </div>
    </section>
  );
}

/**
 * One group of modes on its own panel: study modes on a cool panel, practice games
 * on a warm one. In the study group the first mode (flashcards) is featured wider.
 */
function ActivityGroup({ id, title, description, to, linkLabel, activities }: ActivityGroupData) {
  const titleId = `activity-group-${id}`;
  const study = id === 'study';
  return (
    <section
      aria-labelledby={titleId}
      className={cn('@container p-5 sm:p-7', study ? 'panel-study' : 'panel-practice')}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex items-start gap-4">
          <FamilyBadge family={study ? 'study' : 'practice'} />
          <div className="grid gap-1">
            <h3 id={titleId} className="text-h3 text-fg">
              {title}
            </h3>
            <p className="text-body text-fg-muted">{description}</p>
          </div>
        </div>
        <SectionLink to={to}>{linkLabel}</SectionLink>
      </div>
      <ul className="mt-6 grid grid-cols-1 gap-4 @2xl:grid-cols-2 @4xl:grid-cols-3">
        {activities.map((activity, index) => (
          <ModeLauncher
            key={activity.title}
            headingLevel="h4"
            wide={study && index === 0}
            className={study && index === 0 ? '@2xl:col-span-2' : undefined}
            {...activity}
          />
        ))}
      </ul>
    </section>
  );
}
