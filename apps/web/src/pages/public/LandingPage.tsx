import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router';
import { Wordmark } from '../../components/ui/Wordmark';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { HeroDeck } from './HeroDeck';
import { MethodShowcase } from './MethodShowcase';
import { ArrowDownGlyph, ArrowGlyph, CheckGlyph, PlayGlyph, PlusGlyph } from './landingIcons';
import { methodTabId, methods, type MethodId } from './landingContent';
import './landing.css';

const description =
  'Kendi İngilizce kelime listelerini oluştur; kartlarla, yazarak, dinleyerek ve alıştırmalarla on farklı yolla çalış. Üniversite öğrencileri için kişisel kelime çalışma platformu.';
const sections = [
  ['listeler', 'Listeler'],
  ['yontemler', 'Yöntemler'],
  ['tekrar', 'Tekrar ve geçmiş'],
  ['sorular', 'Sorular'],
] as const;
const vars = (values: Record<string, number | string>) => values as CSSProperties;
/** The course name never breaks across lines. */
const courseName = 'Mesleki\u00a0Yabancı\u00a0Dil';

/** In-page links move keyboard and screen-reader focus to the section heading. */
function anchorFocus(id: string) {
  document.getElementById(id)?.focus({ preventScroll: true });
}

/** Landing-specific description and Open Graph values, restored on exit. */
function useLandingMetadata() {
  useEffect(() => {
    const values: [string, string][] = [
      ['meta[name="description"]', description],
      ['meta[property="og:title"]', 'Kelime Çalışma Platformu'],
      ['meta[property="og:description"]', description],
    ];
    const saved = values.map(([selector, value]) => {
      const node = document.querySelector<HTMLMetaElement>(selector);
      const content = node?.content;
      if (node) node.content = value;
      return { node, content };
    });
    return () => {
      for (const { node, content } of saved)
        if (node && content !== undefined) node.content = content;
    };
  }, []);
}

/**
 * One-time scroll reveals. Content is visible by default: elements are hidden
 * only once the observer is ready, never with reduced motion, and a live switch
 * to reduced motion reveals everything at once.
 */
function useScrollReveal(root: RefObject<HTMLDivElement | null>) {
  // Before paint, so revealed content never flashes hidden.
  useLayoutEffect(() => {
    const container = root.current;
    if (!container || typeof IntersectionObserver === 'undefined') return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motion.matches) return;
    const targets = [...container.querySelectorAll<HTMLElement>('[data-reveal]')];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset['visible'] = 'true';
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    for (const target of targets) {
      target.dataset['visible'] = 'false';
      observer.observe(target);
    }
    container.classList.add('lp-reveal-ready');
    const revealAll = () => {
      if (!motion.matches) return;
      container.classList.remove('lp-reveal-ready');
      observer.disconnect();
    };
    motion.addEventListener('change', revealAll);
    return () => {
      observer.disconnect();
      container.classList.remove('lp-reveal-ready');
      motion.removeEventListener('change', revealAll);
    };
  }, [root]);
}

/**
 * Public introduction. It imports no personal-data client, makes no requests and
 * stores nothing; every demonstration on it is local to this page.
 */
export function LandingPage() {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<MethodId>('cards');
  const menu = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useDocumentTitle('Kendi kelimelerinle öğren');
  useLandingMetadata();
  useScrollReveal(root);

  /** From the hero's method list: select that activity and focus its tab. */
  function showMethod(id: MethodId) {
    flushSync(() => setMethod(id));
    document.getElementById(methodTabId(id))?.focus({ preventScroll: true });
  }

  function sectionLinks() {
    return sections.map(([id, label]) => (
      <a
        key={id}
        href={`#${id}`}
        onClick={() => {
          setOpen(false);
          anchorFocus(id);
        }}
      >
        {label}
      </a>
    ));
  }

  return (
    <div className="landing" ref={root}>
      <a className="lp-skip" href="#landing-main">
        Ana içeriğe geç
      </a>
      <header
        className="lp-header"
        data-surface="dark"
        onKeyDown={(event) => {
          if (open && event.key === 'Escape') {
            setOpen(false);
            menu.current?.focus();
          }
        }}
      >
        <div className="lp-container lp-nav">
          <Link className="lp-brand" to="/tanitim" aria-label="Kelime Çalışma Platformu tanıtımı">
            <Wordmark />
          </Link>
          <nav className="lp-desktop-nav" aria-label="Tanıtım gezinmesi">
            {sectionLinks()}
          </nav>
          <Link className="lp-btn lp-btn-light lp-header-cta" to="/">
            Çalışma alanı <ArrowGlyph />
          </Link>
          <button
            ref={menu}
            type="button"
            className="lp-menu-button"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen(!open)}
          >
            <span className="lp-menu-icon" aria-hidden="true" data-open={open || undefined}>
              <i />
              <i />
            </span>
            {open ? 'Menüyü kapat' : 'Menü'}
          </button>
          <nav
            id={menuId}
            hidden={!open}
            className="lp-mobile-nav"
            aria-label="Mobil tanıtım gezinmesi"
          >
            {sectionLinks()}
            <Link to="/" className="lp-mobile-entry">
              Çalışma alanını aç <ArrowGlyph />
            </Link>
          </nav>
        </div>
      </header>

      <main id="landing-main" tabIndex={-1}>
        <section className="lp-hero" data-surface="navy" aria-labelledby="landing-title">
          <div className="lp-hero-backdrop" aria-hidden="true" />
          <div className="lp-container lp-hero-grid">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow lp-hero-eyebrow">
                <span className="lp-signal" aria-hidden="true" />
                Kişisel İngilizce kelime çalışması
              </p>
              <h1 id="landing-title" className="lp-hero-title">
                <span className="lp-line">Bir kelime ekle,</span>{' '}
                <span className="lp-line">
                  <mark className="lp-mark">on farklı yolla</mark>
                </span>{' '}
                <span className="lp-line">çalış.</span>
              </h1>
              <p className="lp-hero-lead">
                Derste ve okumalarında karşılaştığın İngilizce ifadeleri Türkçe anlamlarıyla kendi
                listelerine kaydet. Kartlarla hatırla, yazarak ve dinleyerek pekiştir; zorlandığın
                kelimelere yeniden dön.
              </p>
              <div className="lp-hero-actions">
                <Link className="lp-btn lp-btn-light lp-btn-large" to="/">
                  Çalışmaya başla <ArrowGlyph />
                </Link>
                <a
                  className="lp-btn lp-btn-outline lp-btn-large"
                  href="#yontemler"
                  onClick={() => anchorFocus('yontemler')}
                >
                  Yöntemleri keşfet <ArrowDownGlyph />
                </a>
              </div>
              <ul className="lp-hero-points">
                <li>
                  <CheckGlyph /> Kendi listelerin, kendi başlıkların
                </li>
                <li>
                  <CheckGlyph /> Bir kelimeye birden fazla Türkçe anlam
                </li>
                <li>
                  <CheckGlyph /> Kendi temponda çalışma ve kişisel ilerleme
                </li>
              </ul>
            </div>
            <div className="lp-hero-visual">
              <HeroOrbits />
              <HeroDeck />
              <p className="lp-deck-note">Örnek deste · Burada denediklerin kaydedilmez.</p>
            </div>
          </div>
          <div className="lp-hero-foot">
            <div className="lp-container lp-hero-foot-inner">
              <p className="lp-context">
                Adıyaman Üniversitesi <strong>{courseName}</strong> dersi kapsamında geliştirildi.
              </p>
              <nav className="lp-ribbon" aria-label="On çalışma yolu">
                <ol>
                  {methods.map((item, i) => (
                    <li key={item.id}>
                      <a
                        href={`#${methodTabId(item.id)}`}
                        onClick={() => showMethod(item.id)}
                        style={vars({ '--i': i })}
                      >
                        <span aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
          </div>
        </section>

        <section className="lp-section lp-lists" aria-labelledby="listeler">
          <div className="lp-container lp-lists-grid">
            <div className="lp-lists-copy" data-reveal>
              <p className="lp-eyebrow">
                <span className="lp-eyebrow-num">01</span> Listeler
              </p>
              <h2 id="listeler" tabIndex={-1}>
                Listeni oluştur. <span className="lp-accent">Başlığını sen belirle.</span>
              </h2>
              <p className="lp-lead">
                “1. Hafta”, “Ekim” ya da “Algoritmalar”: listelerine istediğin başlığı ver. Zorunlu
                bir ortak kelime havuzu yok; çalışacağın kelimeleri sen seçersin.
              </p>
              <dl className="lp-facts">
                <div>
                  <dt>Birden fazla anlam</dt>
                  <dd>
                    Bir İngilizce ifadeye istediğin kadar Türkçe anlam ekle; Türkçe karakterler
                    olduğu gibi kalır.
                  </dd>
                </div>
                <div>
                  <dt>Toplu ekleme</dt>
                  <dd>
                    Excel veya Google Sheets’teki iki sütunu yapıştır; kaydetmeden önce önizlemede
                    kontrol et.
                  </dd>
                </div>
                <div>
                  <dt>Tekrarsız liste</dt>
                  <dd>
                    Listende zaten olan kelimeler atlanır, yeni anlamlar mevcut kelimeye eklenir.
                  </dd>
                </div>
              </dl>
            </div>
            <ListWorkspace />
          </div>
        </section>

        <section className="lp-section lp-methods-section" aria-labelledby="yontemler">
          <div className="lp-container">
            <div className="lp-section-head" data-reveal>
              <div>
                <p className="lp-eyebrow">
                  <span className="lp-eyebrow-num">02</span> Çalışma yolları
                </p>
                <h2 id="yontemler" tabIndex={-1}>
                  Aynı kelimeler, <span className="lp-accent">on farklı çalışma.</span>
                </h2>
              </div>
              <p className="lp-lead">
                Hatırlamak, yazmak, duymak ve tanımak ayrı beceriler. Aynı listeyle ister kısa bir
                kart tekrarı yap, ister bulmaca çöz. İşaretli örnekleri burada deneyebilirsin.
              </p>
            </div>
            <div data-reveal>
              <MethodShowcase active={method} onSelect={setMethod} />
            </div>
          </div>
        </section>

        <section className="lp-section lp-review" data-surface="dark" aria-labelledby="tekrar">
          <div className="lp-review-glow" aria-hidden="true" />
          <div className="lp-container">
            <div className="lp-section-head" data-reveal>
              <div>
                <p className="lp-eyebrow">
                  <span className="lp-eyebrow-num">03</span> Tekrar ve geçmiş
                </p>
                <h2 id="tekrar" tabIndex={-1}>
                  Zorlandığın kelimelere <mark className="lp-mark">yeniden dön.</mark>
                </h2>
              </div>
              <p className="lp-lead">
                Kartlarda “Bilemedim” dediğin kelime tekrar listene girer. “Zorlandıklarımı Çalış”
                ile yalnızca onlara dön; iki ayrı çalışmada bildiğinde listeden çıkar.
              </p>
            </div>
            <ReviewAndHistory />
          </div>
        </section>

        <section className="lp-section lp-principles" aria-labelledby="ilkeler">
          <div className="lp-container">
            <div className="lp-approach-head" data-reveal>
              <div>
                <p className="lp-eyebrow">
                  <span className="lp-eyebrow-num">04</span> Yaklaşım
                </p>
                <h2 id="ilkeler" tabIndex={-1}>
                  Öğrenme sürecini <mark className="lp-mark">sen yönlendir.</mark>
                </h2>
              </div>
              <div className="lp-approach-note">
                <p className="lp-lead">
                  Çalışacağın kelimeleri, yöntemi ve çalışmanın kapsamını ihtiyacına göre belirle.
                  Farklı yollarla pratik yap, kelimelerine yeniden dön ve kendi ilerlemeni takip et.
                </p>
                <p className="lp-approach-caption">
                  Kişisel öğrenme · Esnek çalışma · Düzenli tekrar
                </p>
              </div>
            </div>
            <div className="lp-principles-grid">
              <article className="lp-principle" data-reveal style={vars({ '--i': 0 })}>
                <p className="lp-principle-visual" aria-hidden="true">
                  {['%15', '%25', '%50', '%100'].map((size) => (
                    <span key={size} data-active={size === '%25' || undefined}>
                      {size}
                    </span>
                  ))}
                </p>
                <h3>Kendi temponda</h3>
                <p>
                  Listenin %15’iyle kısa bir tekrar ya da tamamıyla uzun bir çalışma: oturumunun
                  boyutunu sen seç.
                </p>
              </article>
              <article className="lp-principle" data-reveal style={vars({ '--i': 1 })}>
                <p className="lp-principle-visual" aria-hidden="true">
                  <span>Çalış</span>
                  <ArrowGlyph />
                  <span>Gözden geçir</span>
                </p>
                <h3>Kendi gelişimine odaklan</h3>
                <p>
                  Alıştırma sonuçları tekrar önceliğini değiştirmez. Yazarak ve dinleyerek
                  çalışırken yanlış cevaplar ceza sayılmaz; doğru hatırladıkların ilerlemene katkı
                  sağlar.
                </p>
              </article>
              <article className="lp-principle" data-reveal style={vars({ '--i': 2 })}>
                <p className="lp-principle-visual lp-principle-resume" aria-hidden="true">
                  <span>Kelime Avı · Ekim</span>
                  <i style={vars({ '--lp-progress': 0.57 })} />
                  <span>4 / 7</span>
                </p>
                <h3>Kaldığın yerden</h3>
                <p>
                  Kart, yazma, dinleme ve karma çalışmalarına; Kelime Avı ve Çapraz Bulmaca
                  tahtalarına kaldığın yerden devam et.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="lp-section lp-faq" aria-labelledby="sorular">
          <div className="lp-container lp-faq-grid">
            <div data-reveal>
              <p className="lp-eyebrow">Sorular</p>
              <h2 id="sorular" tabIndex={-1}>
                Başlamadan önce.
              </h2>
              <p className="lp-lead">Listeler, çalışma yöntemleri ve kişisel ilerleme hakkında.</p>
            </div>
            <div className="lp-faq-list" data-reveal>
              <details>
                <summary>Kelimeleri kim belirliyor?</summary>
                <p>
                  Çalışacağın kelimeleri sen belirlersin. Dersindeki, okuduğun metindeki ya da
                  çalışmak istediğin konudaki ifadeleri kendi listelerine ekleyebilirsin.
                </p>
              </details>
              <details>
                <summary>Bir kelimenin birden fazla anlamı olabilir mi?</summary>
                <p>
                  Evet. Her İngilizce ifadeye birden fazla Türkçe anlam ekleyebilirsin. Kartlarda ve
                  Yazılı Cevap’ta anlamların tamamı gösterilir; testlerde anlamı örtüşen kelimeler
                  aynı soruda yanıltıcı seçenek olarak kullanılmaz.
                </p>
              </details>
              <details>
                <summary>Dinleme çalışması için ne gerekiyor?</summary>
                <p>
                  Tarayıcında İngilizce bir ses bulunması yeterli. İfadeyi tekrar dinleyebilir ya da
                  yavaşlatabilirsin; ses kullanılamazsa soruyu atlayabilirsin.
                </p>
              </details>
              <details>
                <summary>İlerlememi nasıl takip edebilirim?</summary>
                <p>
                  Kendi sonuçlarını ve çalışma geçmişini görebilir, zorlandığın kelimelere yeniden
                  dönebilirsin. İlerlemen, kendi çalışmaların üzerinden takip edilir.
                </p>
              </details>
              <details>
                <summary>Bu sayfadaki örnekler kaydediliyor mu?</summary>
                <p>
                  Hayır. Buradaki deste ve örnekler yalnızca bu sayfada çalışır; sayfayı
                  yenilediğinde sıfırlanır. Kendi listelerin ve çalışmaların çalışma alanında
                  tutulur.
                </p>
              </details>
            </div>
          </div>
        </section>

        <section className="lp-section lp-acknowledgements" aria-labelledby="emegi-gecenler">
          <div className="lp-container lp-acknowledgements-layout">
            <div className="lp-acknowledgements-intro" data-reveal>
              <p className="lp-eyebrow">Teşekkür</p>
              <h2 id="emegi-gecenler" tabIndex={-1}>
                Projede Emeği Geçenler
              </h2>
              <p className="lp-lead">
                Bu projenin ortaya çıkmasında emeği geçen herkese teşekkür ederiz.
              </p>
            </div>
            <div className="lp-acknowledgements-people" data-reveal>
              <ul className="lp-contributors" role="list" aria-label="Projeye katkıda bulunanlar">
                {['Murat Kadir YILMAZ', 'Muhammed Ali ATEŞ', 'Zekeriye Enes AKÇİMEN'].map(
                  (name) => (
                    <li key={name}>{name}</li>
                  ),
                )}
              </ul>
              <div className="lp-department-head">
                <p className="lp-department-role">Bilgisayar Mühendisliği Bölüm Başkanı</p>
                <p className="lp-department-name">Prof. Dr. Nuh ALPASLAN</p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-closing" data-surface="navy" aria-labelledby="baslangic">
          <ClosingWords />
          <div className="lp-container lp-closing-inner" data-reveal>
            <p className="lp-eyebrow">Başlamak için</p>
            <h2 id="baslangic">Bir kelimeyle başla.</h2>
            <p className="lp-lead">
              İlk listeni oluştur, kelimelerini Türkçe anlamlarıyla ekle ve sana uyan yolla çalış.
            </p>
            <Link className="lp-btn lp-btn-light lp-btn-large" to="/">
              Çalışma alanını aç <ArrowGlyph />
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-footer" data-surface="dark">
        <div className="lp-container lp-footer-grid">
          <div className="lp-footer-brand">
            <Wordmark />
            <p>Üniversite öğrencileri için kişisel İngilizce kelime çalışma platformu.</p>
          </div>
          <nav aria-label="Alt bilgi gezinmesi">
            {sections.map(([id, label]) => (
              <a key={id} href={`#${id}`} onClick={() => anchorFocus(id)}>
                {label}
              </a>
            ))}
            <Link to="/">Çalışma alanı</Link>
          </nav>
        </div>
        <div className="lp-container lp-footer-base">
          <p>Adıyaman Üniversitesi öğrencileri için, {courseName} dersi kapsamında geliştirildi.</p>
        </div>
      </footer>
    </div>
  );
}

/** Decorative fragments of other study modes, orbiting the hero deck. */
function HeroOrbits() {
  return (
    <div className="lp-orbits" aria-hidden="true">
      <div className="lp-orbit lp-orbit-written">
        <small>Yazılı Cevap</small>
        <span>gereksinim · şart</span>
        <b>
          <span className="lp-en">requirement</span>
          <CheckGlyph />
        </b>
      </div>
      <div className="lp-orbit lp-orbit-listen">
        <span className="lp-orbit-play">
          <PlayGlyph />
        </span>
        <span className="lp-orbit-listen-body">
          <small>Dinle ve Yaz</small>
          <span className="lp-orbit-wave">
            {[0.5, 0.9, 0.6, 1, 0.7, 0.4, 0.8, 0.55, 0.85, 0.45].map((height, i) => (
              <i key={i} style={vars({ '--h': height })} />
            ))}
          </span>
        </span>
      </div>
      <div className="lp-orbit lp-orbit-cross">
        <small>Çapraz Bulmaca</small>
        <span className="lp-orbit-grid">
          {[...'QUEUE'].map((letter, i) => (
            <i key={i}>{letter}</i>
          ))}
        </span>
      </div>
    </div>
  );
}

const workspaceRows: [string, string[]][] = [
  ['recursion', ['özyineleme']],
  ['queue', ['kuyruk', 'sıra']],
  ['throughput', ['verim', 'iş hacmi']],
  ['deadlock', ['kilitlenme']],
  ['binary search', ['ikili arama']],
];

function ListWorkspace() {
  return (
    <figure className="lp-workspace" data-reveal>
      <div aria-hidden="true">
        <div className="lp-ws-tabs">
          <span>
            1. Hafta <small>18</small>
          </span>
          <span>
            Ekim <small>24</small>
          </span>
          <span data-active="true">
            Algoritmalar <small>12</small>
          </span>
          <span>
            Makale okumaları <small>9</small>
          </span>
        </div>
        <div className="lp-ws-panel">
          <div className="lp-ws-head">
            <div>
              <p className="lp-ws-title">Algoritmalar</p>
              <p className="lp-ws-meta">12 kelime</p>
            </div>
            <div className="lp-ws-buttons">
              <span data-primary="true">
                <PlusGlyph /> Kelime ekle
              </span>
              <span>Toplu ekle</span>
            </div>
          </div>
          <ul className="lp-ws-rows">
            {workspaceRows.map(([english, meanings], i) => (
              <li key={english} style={vars({ '--i': i })}>
                <span className="lp-en">{english}</span>
                <span className="lp-ws-chips">
                  {meanings.map((meaning) => (
                    <span key={meaning}>{meaning}</span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="lp-bulk">
          <p className="lp-bulk-title">Toplu kelime ekle</p>
          <pre>
            {'run = koşmak; çalışmak\nmemory = hafıza; bellek\nbinary search = ikili arama'}
          </pre>
          <p className="lp-bulk-label">Önizleme</p>
          <p className="lp-bulk-status">
            <span data-tone="new">
              <PlusGlyph /> 2 yeni kelime
            </span>
            <span>Zaten var · atlanacak: 1</span>
          </p>
        </div>
      </div>
      <figcaption className="lp-sr-only">
        Örnek görünüm: “Algoritmalar” listesinde birden fazla Türkçe anlamı olan kelimeler ve
        yapıştırılan üç satırın kaydetmeden önceki önizlemesi.
      </figcaption>
    </figure>
  );
}

const reviewWords: { english: string; meanings: string; list: string; streak: number }[] = [
  { english: 'requirement', meanings: 'gereksinim · şart', list: '3. Hafta', streak: 0 },
  { english: 'throughput', meanings: 'verim · iş hacmi', list: 'Algoritmalar', streak: 1 },
  { english: 'deadlock', meanings: 'kilitlenme', list: 'Algoritmalar', streak: 0 },
];

const mixedShare: [string, number][] = [
  ['Kelime kartı', 6],
  ['Yazılı Cevap', 5],
  ['Dinle ve Yaz', 4],
  ['Seçenekli tanıma', 5],
];

function ReviewAndHistory() {
  return (
    <div className="lp-review-grid">
      <figure className="lp-queue" data-surface="light" data-reveal>
        <div aria-hidden="true">
          <div className="lp-queue-head">
            <p>Zorlandıklarımı Çalış</p>
            <span>3 kelime</span>
          </div>
          <ul>
            {reviewWords.map((word, i) => (
              <li key={word.english} style={vars({ '--i': i })}>
                <span className="lp-en">{word.english}</span>
                <span className="lp-streak" data-streak={word.streak}>
                  <i />
                  <i />
                </span>
                <span className="lp-queue-meanings">{word.meanings}</span>
                <span className="lp-queue-list">{word.list}</span>
              </li>
            ))}
          </ul>
          <p className="lp-queue-legend">
            <span className="lp-streak" data-streak="1">
              <i />
              <i />
            </span>
            İki ayrı çalışmada bildiğinde listeden çıkar.
          </p>
          <span className="lp-queue-action">
            Kartlarla tekrar et <ArrowGlyph />
          </span>
        </div>
        <figcaption className="lp-sr-only">
          Örnek görünüm: tekrar gerektiren üç kelime ve her birinin kaç ayrı çalışmada bilindiği.
        </figcaption>
      </figure>
      <figure className="lp-history" data-reveal>
        <div aria-hidden="true">
          <p className="lp-history-title">Çalışma geçmişi</p>
          <ol className="lp-timeline">
            <li>
              <time>Bugün · 14:20</time>
              <p className="lp-history-name">
                Karma Çalışma <span>· Tüm listelerin</span>
              </p>
              {/* Like the real history: card self-reports are counted apart from right/wrong. */}
              <p className="lp-history-meta">
                20 soru · Doğru 11 · Yanlış 3 · <span>Öz bildirim: Bildim 5, Bilemedim 1</span>
              </p>
              <span className="lp-share">
                {mixedShare.map(([label, count]) => (
                  <i key={label} style={vars({ '--n': count })} />
                ))}
              </span>
              <span className="lp-share-legend">
                {mixedShare.map(([label, count]) => (
                  <span key={label}>
                    {label} {count}
                  </span>
                ))}
              </span>
            </li>
            <li>
              <time>Dün · 21:05</time>
              <p className="lp-history-name">
                Kelime kartları <span>· 3. Hafta</span>
              </p>
              <p className="lp-history-meta">İngilizce → Türkçe · %50 · Bildim 8 · Bilemedim 3</p>
            </li>
            <li>
              <time>22 Ekim</time>
              <p className="lp-history-name">
                Çapraz Bulmaca <span>· Algoritmalar</span>
              </p>
              <p className="lp-history-meta">Tamamlandı · 9 kelime</p>
            </li>
          </ol>
        </div>
        <figcaption className="lp-sr-only">
          Örnek görünüm: son üç çalışmanın tarihleri, yöntemleri ve sonuçlarıyla çalışma geçmişi.
        </figcaption>
      </figure>
    </div>
  );
}

const closingRows = [
  ['deadline', 'requirement', 'sustainable', 'assessment', 'network', 'feedback'],
  ['recursion', 'queue', 'throughput', 'deadlock', 'binary search', 'evidence'],
  ['hypothesis', 'margin', 'curriculum', 'outcome', 'layout', 'resource'],
];

/** A quiet field of sample vocabulary behind the closing call to action. */
function ClosingWords() {
  return (
    <div className="lp-closing-words" aria-hidden="true">
      {closingRows.map((row, r) => (
        <p key={r}>
          {[...row, ...row].map((word, i) => (
            <span key={i} className="lp-en" data-lit={(i + r * 2) % 5 === 1 || undefined}>
              {word}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
