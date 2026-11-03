import { useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { AnswerFeedback } from '../../../components/motion/AnswerFeedback';
import { FlipCard } from '../../../components/motion/FlipCard';
import { StaggerList } from '../../../components/motion/StaggerList';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card, LinkCard } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Checkbox, SelectField, TextField } from '../../../components/ui/fields';
import {
  ArrowRightIcon,
  BookIcon,
  CardsIcon,
  HistoryIcon,
  ListIcon,
  PlusIcon,
} from '../../../components/ui/icons';
import { Breadcrumbs, Tabs, TopNav } from '../../../components/ui/navigation';
import { SidebarNav, SidebarNavItem } from '../../../components/ui/SidebarNav';
import { Wordmark } from '../../../components/ui/Wordmark';
import { cn } from '../../../lib/cn';
import { contrastRatio, formatRatio } from '../../../styles/contrast';
import { ContrastTables, Section, SurfacePair, SurfacePanel, Swatch } from './parts';

/* ---- Colors ---------------------------------------------------------------- */

const brandColors = [
  { name: 'Lacivert', role: 'Kurumsal ana renk, başlık alanları', value: '#083B70' },
  {
    name: 'Birincil mavi',
    role: 'Dolgulu butonlar ve etkin öğe (her yüzeyde); açık yüzeyde bağlantı',
    value: '#1262B0',
  },
  {
    name: 'Açık mavi',
    role: 'Koyu yüzeyde bağlantı, odak ve etkin öğe göstergesi',
    value: '#7CBBFF',
  },
  { name: 'Neredeyse siyah', role: 'Açık yüzeyde ana metin', value: '#101114' },
  { name: 'Antrasit', role: 'Koyu yüzey ve kenar çubuğu zemini', value: '#171B22' },
  { name: 'Açık zemin', role: 'Sayfa arka planı', value: '#F3F5F8' },
  { name: 'Beyaz', role: 'Kartlar ve form alanları', value: '#FFFFFF' },
];

const roleSwatches = [
  { role: 'surface', name: 'Zemin' },
  { role: 'surface-raised', name: 'Kart' },
  { role: 'fg', name: 'Ana metin' },
  { role: 'fg-muted', name: 'İkincil metin' },
  { role: 'accent', name: 'Vurgu / bağlantı' },
  { role: 'action', name: 'Birincil işlem' },
  { role: 'selected', name: 'Etkin öğe' },
  { role: 'selected-indicator', name: 'Etkin göstergesi' },
  { role: 'line-strong', name: 'Form kenarı' },
  { role: 'focus', name: 'Odak halkası' },
  { role: 'success', name: 'Başarı' },
  { role: 'danger', name: 'Hata' },
];

export function ColorsSection() {
  return (
    <Section
      id="renkler"
      title="Renk tokenları"
      description="Marka paleti ham değerleri tanımlar. Bileşenler doğrudan bu değerleri değil, yüzeye göre değişen anlamsal rolleri kullanır. Birincil mavi, beyaz metinle her yüzeyde dolgulu buton ve etkin öğe rengi olabilir (6,18:1). Koyu yüzeylerde metin, bağlantı, odak halkası ve etkin öğe göstergesi için açık mavi tonlar kullanılır; birincil mavi orada metin rengi olarak yetersizdir (2,80:1)."
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        {brandColors.map((color) => (
          <Swatch key={color.value} {...color} />
        ))}
      </div>

      <h3 className="text-h3 text-fg">Yüzeye göre anlamsal roller</h3>
      <div className="grid gap-4 lg:grid-cols-3">
        {(['light', 'dark', 'navy'] as const).map((surface) => (
          <SurfacePanel key={surface} surface={surface}>
            <ul className="grid gap-x-3 gap-y-2.5 @xs:grid-cols-2">
              {roleSwatches.map(({ role, name }) => (
                <li key={role} className="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="size-7 shrink-0 rounded-md border border-line"
                    style={{ backgroundColor: `var(--sem-${role})` }}
                  />
                  <span className="grid leading-tight">
                    <span className="text-small font-medium text-fg">{name}</span>
                    <code className="text-caption text-fg-muted">{role}</code>
                  </span>
                </li>
              ))}
            </ul>
          </SurfacePanel>
        ))}
      </div>

      <h3 className="text-h3 text-fg">Ölçülen kontrast oranları (WCAG AA)</h3>
      <p className="max-w-prose text-body text-fg-muted">
        Değerler sayfadaki gerçek CSS değişkenlerinden hesaplanır. Aynı çiftler otomatik testte de
        doğrulanır (<code>tokens.contrast.test.ts</code>).
      </p>
      <ContrastTables />
    </Section>
  );
}

/* ---- Typography ------------------------------------------------------------ */

const typeScale = [
  { className: 'text-display', name: 'Display', sample: 'Kelimelerle güçlü bir başlangıç' },
  { className: 'text-h1', name: 'Başlık 1', sample: 'Kelime listelerim' },
  { className: 'text-h2', name: 'Başlık 2', sample: 'Bu haftanın çalışmaları' },
  { className: 'text-h3', name: 'Başlık 3', sample: 'Bilgisayar Mühendisliği — 3. Hafta' },
  { className: 'text-h4', name: 'Başlık 4', sample: 'Son çalışılan kelimeler' },
  {
    className: 'text-body-lg',
    name: 'Gövde (büyük)',
    sample: 'Kendi listelerini oluştur, kelimeleri dilediğin modda çalış.',
  },
  {
    className: 'text-body',
    name: 'Gövde',
    sample: 'Her kelimenin bir veya daha fazla Türkçe anlamı olabilir; tümü doğru kabul edilir.',
  },
  { className: 'text-small', name: 'Küçük', sample: 'Son güncelleme: 20 Ekim, 14:30' },
  { className: 'text-caption', name: 'Açıklama', sample: '24 kelime · 3 liste' },
];

export function TypographySection() {
  return (
    <Section
      id="tipografi"
      title="Tipografi"
      description="Inter Variable yazı tipi uygulamayla birlikte sunulur (harici yazı tipi servisi kullanılmaz) ve tüm Türkçe karakterleri destekler."
    >
      <Card padded={false} className="divide-y divide-line">
        {typeScale.map((item) => (
          <div
            key={item.name}
            className="grid gap-1 px-5 py-4 sm:grid-cols-[9rem_1fr] sm:items-baseline sm:gap-6 sm:px-6"
          >
            <span className="grid">
              <span className="text-small font-semibold text-fg">{item.name}</span>
              <code className="text-caption text-fg-muted">{item.className}</code>
            </span>
            <p className={cn(item.className, 'text-fg')}>{item.sample}</p>
          </div>
        ))}
      </Card>

      <SurfacePair>
        {() => (
          <div className="grid gap-3">
            <p className="text-h2 text-fg">Ç Ğ İ I Ö Ş Ü · ç ğ ı i ö ş ü</p>
            <p className="text-body text-fg">
              İstanbul’da ılık bir sabah: öğrenciler ağaçların gölgesinde çalışıyor.
            </p>
            <p className="text-body text-fg-muted">
              Büyük harf dönüşümü Türkçe kurallarına uyar:{' '}
              <span lang="tr" className="font-semibold text-fg uppercase">
                istanbul, ılık, iğde
              </span>
            </p>
          </div>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---- Contrast examples ----------------------------------------------------- */

const contrastExamples = [
  { fg: '#101114', bg: '#FFFFFF', label: 'Ana metin, beyaz kart' },
  { fg: '#3D4654', bg: '#F3F5F8', label: 'İkincil metin, açık zemin' },
  { fg: '#7CBBFF', bg: '#171B22', label: 'Açık mavi bağlantı, antrasit zemin' },
  { fg: '#FFFFFF', bg: '#1262B0', label: 'Beyaz metin, birincil mavi buton' },
  { fg: '#1262B0', bg: '#171B22', label: 'Birincil mavi metin, antrasit zemin' },
  { fg: '#9AA3AF', bg: '#FFFFFF', label: 'Soluk gri gövde metni, beyaz kart' },
];

export function ContrastSection() {
  return (
    <Section
      id="kontrast"
      title="Metin kontrastı örnekleri"
      description="Metin için en az 4,5:1 hedeflenir. Soluk gri gövde metni kullanılmaz. Birincil mavi antrasit zeminde metin rengi olarak yetersizdir, ama beyaz metinli dolgulu buton olarak uygundur: burada ölçülen, butonun zemine değil, metnin buton dolgusuna karşı kontrastıdır."
    >
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {contrastExamples.map((example) => {
          const ratio = contrastRatio(example.fg, example.bg);
          const pass = ratio >= 4.5;
          return (
            <li key={example.label} className="overflow-hidden rounded-card border border-line">
              <p
                className="px-4 py-5 text-body-lg font-medium"
                style={{ color: example.fg, backgroundColor: example.bg }}
              >
                Örnek cümle: Bugün on kelime çalıştım.
              </p>
              <div className="flex items-center justify-between gap-3 bg-surface-raised px-4 py-3">
                <span className="text-small text-fg">{example.label}</span>
                <Badge tone={pass ? 'success' : 'danger'}>
                  {formatRatio(ratio)} {pass ? 'Kabul' : 'Ret'}
                </Badge>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/* ---- Buttons --------------------------------------------------------------- */

function LoadingDemo() {
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setLoading(false), 1600);
    return () => window.clearTimeout(timer);
  }, [loading]);
  return (
    <Button loading={loading} onClick={() => setLoading(true)}>
      {loading ? 'Kaydediliyor' : 'Kaydetmeyi dene'}
    </Button>
  );
}

export function ButtonsSection() {
  return (
    <Section
      id="butonlar"
      title="Butonlar"
      description="Birincil işlem her ekranda tek olmalıdır. Devre dışı butonlar da okunabilir kalır. Yükleme durumu odak kaybı olmadan gösterilir."
    >
      <SurfacePair>
        {() => (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Button>Birincil</Button>
              <Button variant="secondary">İkincil</Button>
              <Button variant="ghost">Metin buton</Button>
              <Button variant="danger">Sil</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled>Devre dışı</Button>
              <Button variant="secondary" disabled>
                Devre dışı
              </Button>
              <LoadingDemo />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" icon={<PlusIcon />}>
                Küçük
              </Button>
              <Button size="md" variant="secondary" icon={<ListIcon />}>
                Orta
              </Button>
              <Button size="lg" icon={<ArrowRightIcon />}>
                Büyük
              </Button>
            </div>
          </>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---- Navigation ------------------------------------------------------------ */

// The demos link to sub-paths of this preview page (route "dev/design-system/*"),
// so the active state comes from the real router and respects the basename.
const DS = '/dev/design-system';
const demoRoutes = [
  { to: DS, end: true, label: 'Kontrol paneli', icon: <BookIcon /> },
  { to: `${DS}/ornek/listeler`, label: 'Listelerim', icon: <ListIcon /> },
  { to: `${DS}/ornek/calis`, label: 'Çalış', icon: <CardsIcon /> },
  { to: `${DS}/ornek/gecmis`, label: 'Geçmiş', icon: <HistoryIcon /> },
];

function NavDemo() {
  return <TopNav label="Örnek üst gezinme" items={demoRoutes} />;
}

export function NavigationSection() {
  return (
    <Section
      id="gezinme"
      title="Gezinme"
      description="Üst gezinme, sekmeler ve sayfa konumu. Bağlantılar React Router ile çalışır (sayfa yenilenmez, uygulama alt yolu korunur). Etkin öğe mavi dolgu, beyaz kalın metin ve zeminde ayrı bir gösterge çizgisiyle (en az 3:1) belirtilir; ekran okuyucular için aria-current=“page” kullanılır. Örnek bağlantılar bu önizleme sayfasının alt adreslerine gider."
    >
      <SurfacePanel surface="navy" label="Lacivert başlık alanı">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Wordmark showTemporaryNote />
          <NavDemo />
        </div>
      </SurfacePanel>
      <SurfacePair>
        {() => (
          <>
            <NavDemo />
            <Breadcrumbs
              items={[
                { label: 'Kontrol paneli', to: DS },
                { label: 'Listelerim', to: `${DS}/ornek/listeler` },
                { label: '1. Hafta' },
              ]}
            />
            <Tabs
              label="Örnek liste sekmeleri"
              items={[
                {
                  id: 'words',
                  label: 'Kelimeler',
                  panel: <p className="text-body text-fg">Listedeki 24 kelime burada görünür.</p>,
                },
                {
                  id: 'study',
                  label: 'Çalışma modları',
                  panel: (
                    <p className="text-body text-fg">Kartlar, test, eşleştirme ve diğer modlar.</p>
                  ),
                },
                {
                  id: 'history',
                  label: 'Geçmiş',
                  panel: <p className="text-body text-fg">Bu listeyle yapılan çalışmalar.</p>,
                },
              ]}
            />
            <p className="text-small text-fg-muted">
              Sekmeler arasında ← → tuşlarıyla, ilk ve son sekmeye Home / End ile geçilir.
            </p>
          </>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---- Sidebar navigation ---------------------------------------------------- */

const sidebarStates = [
  {
    name: 'Etkin sayfa',
    detail: 'Mavi dolgu, beyaz kalın metin, solda açık mavi gösterge; aria-current="page".',
    pairs: [
      { label: 'metin / dolgu', fg: '#FFFFFF', bg: '#1262B0' },
      { label: 'gösterge / zemin', fg: '#7CBBFF', bg: '#171B22' },
    ],
  },
  {
    name: 'Etkin olmayan',
    detail: 'Açık gri-mavi metin; antrasit zeminde yüksek kontrast.',
    pairs: [{ label: 'metin / zemin', fg: '#C3CCD8', bg: '#171B22' }],
  },
  {
    name: 'Üzerine gelme',
    detail: 'Bir ton açık zemin, metin beyaza yakın tona geçer.',
    pairs: [{ label: 'metin / zemin', fg: '#E6EAF0', bg: '#222833' }],
  },
  {
    name: 'Klavye odağı',
    detail: '3 px açık mavi odak halkası, öğenin dışında 2 px boşlukla.',
    pairs: [{ label: 'halka / zemin', fg: '#A8D2FF', bg: '#171B22' }],
  },
];

export function SidebarSection() {
  return (
    <Section
      id="kenar-cubugu"
      title="Kenar çubuğu gezinmesi"
      description="Kontrol panelinin ana gezinmesi antrasit bir kenar çubuğudur. SidebarNavItem bileşeni React Router ile çalışır ve etkin sayfayı yalnızca renkle değil, sol göstergeyle ve kalın yazıyla da belirtir. Bu örnek yalnızca gezinme bileşenini gösterir; kontrol paneli henüz geliştirilmedi."
    >
      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside
          data-surface="dark"
          aria-label="Örnek kenar çubuğu"
          className="grid content-start gap-6 rounded-panel border border-line py-5 pr-3"
        >
          <div className="pl-5">
            <Wordmark />
          </div>
          <SidebarNav label="Örnek ana gezinme">
            {demoRoutes.map((route) => (
              <SidebarNavItem
                key={route.to}
                to={route.to}
                icon={route.icon}
                {...(route.end ? { end: true } : {})}
              >
                {route.label}
              </SidebarNavItem>
            ))}
          </SidebarNav>
          <p className="pl-5 text-caption text-fg-muted">
            Tab ile odaklan; Enter ile sayfa değişir ve yeni öğe yerinde vurgulanır.
          </p>
        </aside>

        <Card as="div" className="grid content-start gap-4">
          <h3 className="text-h4 text-fg">Durumlar ve ölçülen kontrast</h3>
          <dl className="grid gap-4">
            {sidebarStates.map((state) => (
              <div key={state.name} className="grid gap-1">
                <dt className="text-body font-semibold text-fg">{state.name}</dt>
                <dd className="grid gap-1.5 text-small text-fg-muted">
                  <span>{state.detail}</span>
                  <span className="flex flex-wrap gap-2">
                    {state.pairs.map((pair) => (
                      <span
                        key={pair.label}
                        className="inline-flex items-center gap-2 rounded-md border border-line px-2 py-1 text-fg"
                      >
                        <span
                          aria-hidden="true"
                          className="inline-grid h-5 min-w-8 place-items-center rounded-sm px-1 text-caption font-bold"
                          style={{ color: pair.fg, backgroundColor: pair.bg }}
                        >
                          Ağ
                        </span>
                        {pair.label}: {formatRatio(contrastRatio(pair.fg, pair.bg))}
                      </span>
                    ))}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-small text-fg-muted">
            Mavi dolgunun antrasite karşı oranı 2,80:1’dir; bu nedenle etkin durumu tek başına dolgu
            değil, en az 3:1 olan sol gösterge taşır.
          </p>
        </Card>
      </div>
    </Section>
  );
}

/* ---- Cards ----------------------------------------------------------------- */

export function CardsSection() {
  return (
    <Section
      id="kartlar"
      title="Kartlar"
      description="Statik kartlar bilgi gösterir; tıklanabilir kartlar üzerine gelindiğinde yükselir, kenar rengi ve ok işareti değişir."
    >
      <SurfacePair>
        {() => (
          <div className="grid gap-4 @lg:grid-cols-2">
            <Card as="article">
              <p className="text-caption text-fg-muted">Liste</p>
              <h3 className="mt-1 text-h3 text-fg">1. Hafta</h3>
              <p className="mt-2 text-body text-fg-muted">24 kelime · Son çalışma 2 gün önce</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="info">Kartlar</Badge>
                <Badge>Test</Badge>
              </div>
            </Card>
            <LinkCard
              to={`${DS}/ornek/calis`}
              icon={<CardsIcon />}
              title="Kartlarla çalış"
              description="Kelimeleri çevirerek tekrar et."
            />
          </div>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---- Forms ----------------------------------------------------------------- */

export function FormsSection() {
  return (
    <Section
      id="formlar"
      title="Form alanları"
      description="Etiketler her zaman görünür. Yardım ve hata metinleri alana bağlıdır (aria-describedby); hatalar simge ve metinle belirtilir."
    >
      <SurfacePair>
        {() => (
          <form className="grid gap-5" onSubmit={(event) => event.preventDefault()} noValidate>
            <TextField
              label="Liste adı"
              placeholder="Örn. 1. Hafta"
              hint="İstediğin adı verebilirsin."
              required
            />
            <TextField
              label="İngilizce kelime"
              defaultValue="recieve"
              error="Bu kelime listede zaten var."
            />
            <SelectField label="Çalışma modu" defaultValue="cards">
              <option value="cards">Kartlar</option>
              <option value="quiz">Test</option>
              <option value="match">Eşleştirme</option>
            </SelectField>
            <TextField label="Devre dışı alan" defaultValue="Değiştirilemez" disabled />
            <Checkbox label="Anlamları karıştır" hint="Kartlarda anlamların sırası değişir." />
            <Checkbox label="Seçili örnek" defaultChecked />
            <Checkbox label="Devre dışı seçenek" disabled />
          </form>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---- Focus states ---------------------------------------------------------- */

export function FocusSection() {
  return (
    <Section
      id="odak"
      title="Odak durumları"
      description="Klavye ile gezinirken tüm etkileşimli öğelerde 2 piksellik, yüzeye göre renk değiştiren bir odak halkası görünür (her yüzeyde en az 3:1). Aşağıdaki örnekler halkayı sabit olarak gösterir; denemek için Tab tuşunu kullan."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {(['light', 'dark', 'navy'] as const).map((surface) => (
          <SurfacePanel key={surface} surface={surface}>
            <div className="flex flex-wrap items-center gap-4">
              <span className="focus-ring-sample inline-flex h-11 items-center rounded-control bg-action px-5 font-semibold text-on-action">
                Odakta buton
              </span>
              <span className="focus-ring-sample rounded-sm font-semibold text-accent underline">
                Odakta bağlantı
              </span>
            </div>
          </SurfacePanel>
        ))}
      </div>
    </Section>
  );
}

/* ---- Empty states ---------------------------------------------------------- */

export function EmptyStatesSection() {
  return (
    <Section
      id="bos-durumlar"
      title="Boş durumlar"
      description="İçerik yokken ne olduğunu ve sonraki adımı açıkça söyler. Buradaki butonlar yalnızca örnektir."
    >
      <SurfacePair>
        {(surface) =>
          surface === 'light' ? (
            <EmptyState
              icon={<ListIcon />}
              title="Henüz bir listen yok"
              description="İlk listeni oluştur ve kelimelerini eklemeye başla. Liste adını sen belirlersin."
              actions={<Button icon={<PlusIcon />}>Liste oluştur</Button>}
            />
          ) : (
            <EmptyState
              icon={<CardsIcon />}
              title="Bu mod için yeterli kelime yok"
              description="Eşleştirme için listede en az 4 kelime olmalı. Kelime ekleyebilir ya da birden fazla liste seçebilirsin."
              actions={
                <>
                  <Button variant="secondary">Liste seç</Button>
                  <Button icon={<PlusIcon />}>Kelime ekle</Button>
                </>
              }
            />
          )
        }
      </SurfacePair>
    </Section>
  );
}

/* ---- Hover interactions (CSS only) ----------------------------------------- */

export function HoverSection() {
  return (
    <Section
      id="uzerine-gelme"
      title="Üzerine gelme etkileşimleri"
      description="Basit geri bildirimler yalnızca CSS geçişleriyle yapılır: renk, gölge, kısa kaymalar."
    >
      <SurfacePair>
        {() => (
          <div className="grid gap-5">
            <p className="text-body text-fg">
              Metin içi{' '}
              <a
                href="#uzerine-gelme"
                className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_2px] bg-bottom-left bg-no-repeat pb-0.5 font-semibold no-underline transition-[background-size] duration-(--duration-slow) ease-standard hover:bg-[length:100%_2px]"
              >
                altı çizilerek beliren bağlantı
              </a>{' '}
              örneği.
            </p>
            <ul className="overflow-hidden rounded-card border border-line bg-surface-raised">
              {['abandon', 'benefit', 'consider'].map((word) => (
                <li
                  key={word}
                  className="group flex items-center justify-between border-t border-line px-4 py-3 transition-colors duration-(--duration-fast) first:border-t-0 hover:bg-accent-soft"
                >
                  <span lang="en" className="font-medium text-fg group-hover:text-on-accent-soft">
                    {word}
                  </span>
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="text-fg-muted transition-[translate,color] duration-(--duration-base) ease-standard group-hover:translate-x-1 group-hover:text-on-accent-soft"
                  />
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                aria-label="Yeni kelime ekle"
                className="grid size-11 place-items-center rounded-full border border-line-strong bg-surface-raised text-[1.25rem] text-fg transition-[rotate,background-color,color,border-color] duration-(--duration-base) ease-emphasized hover:rotate-90 hover:border-action hover:bg-action hover:text-on-action"
              >
                <PlusIcon />
              </button>
              <span className="inline-flex items-center rounded-full border border-line-strong px-3 text-small font-medium text-fg transition-colors duration-(--duration-fast) hover:border-accent hover:bg-accent-soft hover:text-on-accent-soft">
                Etiket
              </span>
            </div>
          </div>
        )}
      </SurfacePair>
    </Section>
  );
}

/* ---- Motion ---------------------------------------------------------------- */

const staggerWords = [
  { term: 'resilient', meaning: 'dayanıklı, esnek' },
  { term: 'acquire', meaning: 'edinmek, kazanmak' },
  { term: 'thorough', meaning: 'kapsamlı, titiz' },
  { term: 'eventually', meaning: 'sonunda, nihayetinde' },
];

export function MotionSection() {
  const reduced = useReducedMotion();
  return (
    <Section
      id="animasyonlar"
      title="Animasyonlar"
      description="Hareket bir anlam taşıdığında kullanılır: kart çevirme, doğru/yanlış geri bildirimi, listelerin girişi. İşletim sisteminde “hareketi azalt” açıksa dönüş ve kaymalar kapatılır."
    >
      <Badge tone={reduced ? 'info' : 'neutral'} className="justify-self-start">
        Hareketi azalt ayarı: {reduced ? 'açık — animasyonlar sadeleştirildi' : 'kapalı'}
      </Badge>
      <div className="grid gap-4 xl:grid-cols-2">
        <SurfacePanel surface="light" label="Kart çevirme">
          <FlipCard term="resilient" meanings={['dayanıklı', 'esnek']} />
        </SurfacePanel>
        <SurfacePanel surface="dark" label="Cevap geri bildirimi">
          <AnswerFeedback
            term="resilient"
            options={[
              { text: 'dayanıklı', correct: true },
              { text: 'kırılgan', correct: false },
              { text: 'aceleci', correct: false },
              { text: 'sessiz', correct: false },
            ]}
          />
        </SurfacePanel>
        <SurfacePanel surface="light" label="Sıralı liste girişi">
          <StaggerList items={staggerWords} />
        </SurfacePanel>
        <SurfacePanel surface="dark" label="Sıralı liste girişi (koyu)">
          <StaggerList items={staggerWords} />
        </SurfacePanel>
      </div>
    </Section>
  );
}
