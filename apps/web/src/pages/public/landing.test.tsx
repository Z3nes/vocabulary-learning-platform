import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LandingPage } from './LandingPage';
import { buildRoutes } from '../../router';
import indexHtml from '../../../index.html?raw';

class Observer implements IntersectionObserver {
  root = null;
  rootMargin = '';
  scrollMargin = '';
  thresholds = [0.12];
  observe = vi.fn<(e: Element) => void>();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = () => [];
  constructor(private callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  reveal(target: Element) {
    act(() => this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this));
  }
}
let observers: Observer[], reduced: boolean, mediaChange: () => void, created: HTMLMetaElement[];
beforeEach(() => {
  observers = [];
  reduced = false;
  mediaChange = () => {};
  created = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('Public page must not fetch personal data'))),
  );
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.spyOn(window, 'matchMedia').mockImplementation((media) => ({
    get matches() {
      return reduced;
    },
    media,
    onchange: null,
    addEventListener: (_event: string, listener: unknown) => {
      mediaChange = listener as () => void;
    },
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => true,
  }));
  for (const [attr, name] of [
    ['name', 'description'],
    ['property', 'og:title'],
    ['property', 'og:description'],
  ] as const) {
    const node = document.createElement('meta');
    node.setAttribute(attr, name);
    node.content = 'Original';
    document.head.append(node);
    created.push(node);
  }
});
afterEach(() => {
  cleanup();
  for (const node of created) node.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/tanitim']}>
      <LandingPage />
    </MemoryRouter>,
  );
function route(path = '/kelime/tanitim') {
  const router = createMemoryRouter(buildRoutes({ includeDevRoutes: false }), {
    basename: '/kelime',
    initialEntries: [path],
  });
  return { router, ...render(<RouterProvider router={router} />) };
}
const heroTitle = /Bir kelime ekle, on farklı yolla çalış\./;
const activities = [
  'Kelime kartları',
  'Yazılı Cevap',
  'Dinle ve Yaz',
  'Karma Çalışma',
  'Klasik test',
  'Eşleştirme',
  'Kelime Oluşturma',
  'Hafıza Oyunu',
  'Kelime Avı',
  'Çapraz Bulmaca',
];
const deck = () => document.querySelector<HTMLElement>('.lp-deck')!;
const tab = (name: string) => screen.getByRole('tab', { name });

describe('public introduction and routing', () => {
  it('shows public route loading and recovers safely from a failed route chunk', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let fail: ((error: Error) => void) | undefined;
    const pending = new Promise<never>((_resolve, reject) => {
      fail = reject;
    });
    const publicRoute = buildRoutes({ includeDevRoutes: false }).find(
      (r) => r.path === '/tanitim',
    )!;
    const router = createMemoryRouter([{ ...publicRoute, lazy: () => pending }], {
      initialEntries: ['/tanitim'],
    });
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('status').textContent).toBe('Sayfa yükleniyor…');
    await act(async () => {
      fail!(new Error('internal chunk detail'));
      await Promise.resolve();
    });
    await screen.findByRole('heading', { name: 'Bir şeyler ters gitti' });
    expect(screen.queryByText(/internal chunk detail/)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('loads the public route without the application sidebar, private query provider or API access', async () => {
    route();
    await screen.findByRole('heading', { level: 1, name: heroTitle });
    expect(screen.queryByRole('navigation', { name: 'Ana gezinme' })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('main').id).toBe('landing-main');
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
  it('keeps the legacy dashboard entry and its API boundary after route splitting', async () => {
    const { router } = route('/kelime/');
    await screen.findByRole('heading', { level: 1, name: 'Hoş geldin' }, { timeout: 15000 });
    // The heading is static; the dashboard's requests start in effects after it renders.
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getAllByRole('navigation', { name: 'Ana gezinme' }).length).toBeGreaterThan(0);
    await act(() => router.navigate('/tanitim'));
    await screen.findByRole('heading', { level: 1, name: heroTitle });
    expect(screen.queryByRole('navigation', { name: 'Ana gezinme' })).toBeNull();
  });
  it('has real base-path-safe CTAs and ignores redirect-looking URL parameters', async () => {
    route('/kelime/tanitim?returnTo=https://invalid.example');
    await screen.findByRole('heading', { level: 1, name: heroTitle });
    const entries = [
      ...screen.getAllByRole('link', { name: /Çalışma alanı/ }),
      screen.getByRole('link', { name: /Çalışmaya başla/ }),
    ];
    expect(entries.length).toBeGreaterThanOrEqual(4);
    for (const link of entries) expect(link.getAttribute('href')).toBe('/kelime');
    expect(
      screen.getByRole('link', { name: 'Kelime Çalışma Platformu tanıtımı' }).getAttribute('href'),
    ).toBe('/kelime/tanitim');
    expect(document.querySelector('a[href*="invalid.example"]')).toBeNull();
  });
  it('provides a skip target, semantic landmarks, valid references and the real activity names', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Ana içeriğe geç' }).getAttribute('href')).toBe(
      '#landing-main',
    );
    expect(screen.getByRole('main').getAttribute('tabindex')).toBe('-1');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    const ribbon = screen.getByRole('navigation', { name: 'On çalışma yolu' });
    for (const name of activities) {
      expect(tab(name)).toBeTruthy();
      expect(within(ribbon).getByRole('link', { name })).toBeTruthy();
    }
    expect(screen.getAllByText('Zorlandıklarımı Çalış').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Çalışma geçmişi').length).toBeGreaterThan(0);
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const attribute of ['aria-controls', 'aria-labelledby', 'aria-describedby'])
      for (const node of document.querySelectorAll(`[${attribute}]`))
        for (const id of node.getAttribute(attribute)!.split(' '))
          expect(document.getElementById(id), `${attribute}=${id}`).toBeTruthy();
    // Illustrations stay out of the accessibility tree; their captions describe them.
    for (const node of document.querySelectorAll('.lp-orbits, .lp-workspace > div, .lp-v-cards'))
      expect(node.getAttribute('aria-hidden')).toBe('true');
  });
  it('links every section anchor to existing content and moves focus to its heading', () => {
    renderPage();
    for (const navName of ['Tanıtım gezinmesi', 'Alt bilgi gezinmesi']) {
      const nav = screen.getByRole('navigation', { name: navName });
      for (const link of within(nav).getAllByRole('link')) {
        const href = link.getAttribute('href')!;
        if (!href.startsWith('#')) continue;
        const target = document.getElementById(href.slice(1));
        expect(target).toBeTruthy();
        fireEvent.click(link);
        expect(document.activeElement).toBe(target);
      }
    }
    fireEvent.click(screen.getByRole('link', { name: /Yöntemleri keşfet/ }));
    expect(document.activeElement?.id).toBe('yontemler');
  });
  it('opens/closes mobile navigation and restores toggle focus on Escape', () => {
    renderPage();
    // jsdom does not apply viewport media queries. Model the narrow disclosure's
    // visibility explicitly; the real responsive rules have separate CSS coverage.
    const button = document.querySelector<HTMLButtonElement>('.lp-menu-button')!;
    button.style.display = 'inline-flex';
    const narrowStyle = document.createElement('style');
    narrowStyle.textContent = '.landing .lp-mobile-nav:not([hidden]) { display: grid; }';
    document.querySelector('.landing')!.append(narrowStyle);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toBe('Menü');
    fireEvent.click(button);
    const nav = screen.getByRole('navigation', { name: 'Mobil tanıtım gezinmesi' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toBe('Menüyü kapat');
    expect(within(nav).getByRole('link', { name: /Çalışma alanını aç/ })).toBeTruthy();
    fireEvent.keyDown(nav, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: 'Mobil tanıtım gezinmesi' })).toBeNull();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Mobil tanıtım gezinmesi' })).getByRole(
        'link',
        { name: 'Yöntemler' },
      ),
    );
    expect(screen.queryByRole('navigation', { name: 'Mobil tanıtım gezinmesi' })).toBeNull();
    expect(document.activeElement?.id).toBe('yontemler');
  });
  it('presents the course context without disclaimers and collects no credentials', () => {
    renderPage();
    const text = document.body.textContent;
    expect(text).toMatch(/Adıyaman Üniversitesi Mesleki\sYabancı\sDil dersi kapsamında/);
    // The removed status banners must not return, nor be replaced by similar warnings.
    for (const phrase of [
      /Resmî üniversite yayını/,
      /onaylı kurumsal hizmet/,
      /Geliştirme sürümü/,
      /henüz yapılandırılmadı/,
      /Kurumsal giriş/,
    ])
      expect(text).not.toMatch(phrase);
    expect(document.querySelector('input[type="password"],input[type="email"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /Giriş yap|Kayıt ol/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Giriş yap|Kayıt ol/ })).toBeNull();
  });
  it('sets title/description/Open Graph metadata and restores metadata on exit', () => {
    const view = renderPage();
    expect(document.title).toContain('Kendi kelimelerinle öğren');
    expect(created[0]!.content).toContain('Kendi İngilizce kelime listelerini');
    expect(created[1]!.content).toBe('Kelime Çalışma Platformu');
    expect(created[2]!.content).toBe(created[0]!.content);
    view.unmount();
    expect(created.every((node) => node.content === 'Original')).toBe(true);
  });
  it('describes self-directed learning without the crossed-out competition treatment', () => {
    renderPage();
    const approach = screen.getByRole('region', { name: 'Öğrenme sürecini sen yönlendir.' });
    expect(within(approach).getByRole('heading', { name: 'Kendi temponda' })).toBeTruthy();
    expect(
      within(approach).getByRole('heading', { name: 'Kendi gelişimine odaklan' }),
    ).toBeTruthy();
    expect(within(approach).getByRole('heading', { name: 'Kaldığın yerden' })).toBeTruthy();
    expect(approach.textContent).toContain('Farklı yollarla pratik yap');
    expect(document.querySelector('s, del, .lp-strikes, .lp-manifesto')).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /\bXP\b|Yalnızca kendi ilerlemen|Puan, sıralama ve yarış/,
    );
    expect(screen.getByText('Kendi temponda çalışma ve kişisel ilerleme')).toBeTruthy();
  });
  it('recognizes all three contributors equally and identifies the department head without invented roles', () => {
    renderPage();
    const section = screen.getByRole('region', { name: 'Projede Emeği Geçenler' });
    const people = within(section).getByRole('list', { name: 'Projeye katkıda bulunanlar' });
    const rows = within(people).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Murat Kadir YILMAZ',
      'Muhammed Ali ATEŞ',
      'Zekeriye Enes AKÇİMEN',
    ]);
    expect(new Set(rows.map((row) => row.className)).size).toBe(1);
    expect(within(section).getByText('Prof. Dr. Nuh ALPASLAN')).toBeTruthy();
    expect(within(section).getByText('Bilgisayar Mühendisliği Bölüm Başkanı')).toBeTruthy();
    expect(section.querySelector('img')).toBeNull();
    expect(section.textContent).not.toMatch(/danışman|mentor|onay|himaye|sponsor|resmî/i);
    const main = screen.getByRole('main');
    const sections = [...main.querySelectorAll(':scope > section')];
    expect(sections.indexOf(section)).toBe(sections.length - 2);
  });
  it('ships the approved shared descriptions and restores them after leaving the landing page', () => {
    const html = new DOMParser().parseFromString(indexHtml, 'text/html');
    const description =
      'Kendi İngilizce kelime listelerini oluştur, farklı çalışma yöntemleriyle pratik yap ve öğrenme sürecini takip et.';
    const plain = html.querySelector<HTMLMetaElement>('meta[name="description"]')!;
    const og = html.querySelector<HTMLMetaElement>('meta[property="og:description"]')!;
    expect(plain.content).toBe(description);
    expect(og.content).toBe(description);
    expect(indexHtml).not.toContain('Geliştirme projesi.');
    created[0]!.content = plain.content;
    created[2]!.content = og.content;
    const view = renderPage();
    expect(created[0]!.content).toContain('on farklı yolla çalış');
    view.unmount();
    expect(created[0]!.content).toBe(description);
    expect(created[2]!.content).toBe(description);
  });
  it('keeps public loading/error boundaries and all old deep link declarations', () => {
    const routes = buildRoutes({ includeDevRoutes: false }),
      landing = routes.find((r) => r.path === '/tanitim')!,
      privateRoot = routes.find((r) => r.path === '/')!;
    expect(landing.lazy).toBeTypeOf('function');
    expect(landing.hydrateFallbackElement).toBeTruthy();
    expect(landing.errorElement).toBeTruthy();
    const paths = privateRoot.children![0]!.children!.map((r) => r.path);
    for (const path of [
      'lists/:id',
      'study/mixed',
      'study/practice/:sessionId',
      'games/word-search',
      'games/crossword',
      'history',
    ])
      expect(paths).toContain(path);
    expect(privateRoot.lazy).toBeTypeOf('function');
  });
});

describe('hero sample deck', () => {
  it('reveals before evaluating, keeps focus in place and never renders the answer early', () => {
    renderPage();
    const toggle = within(deck()).getByRole('button', { name: 'Cevabı göster' });
    const known = within(deck()).getByRole<HTMLButtonElement>('button', { name: 'Bildim' });
    const missed = within(deck()).getByRole<HTMLButtonElement>('button', { name: 'Bilemedim' });
    expect(within(deck()).getByText('deadline')).toBeTruthy();
    expect(within(deck()).queryByText('son teslim tarihi')).toBeNull();
    expect(known.disabled && missed.disabled).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Cevabı gizle');
    expect(within(deck()).getByText('son teslim tarihi')).toBeTruthy();
    expect(within(deck()).getByRole('status').textContent).toBe(
      'Türkçe anlamları: son teslim tarihi.',
    );
    expect(known.disabled).toBe(false);

    known.focus();
    fireEvent.click(known);
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(within(deck()).getByRole('status').textContent).toBe(
      'Bildim olarak işaretlendi. Sıradaki kart: 2 / 5.',
    );
    expect(deck().querySelector('.lp-deck-count')!.textContent).toBe('Kart 2 / 5');
    expect(within(deck()).queryByText('gereksinim')).toBeNull();
    expect(known.disabled).toBe(true);
  });
  it('finishes with a local summary of missed words and restarts from the first card', () => {
    const store = vi.spyOn(Storage.prototype, 'setItem');
    renderPage();
    const verdicts = ['Bildim', 'Bilemedim', 'Bildim', 'Bilemedim', 'Bildim'];
    for (const verdict of verdicts) {
      fireEvent.click(within(deck()).getByRole('button', { name: 'Cevabı göster' }));
      fireEvent.click(within(deck()).getByRole('button', { name: verdict }));
    }
    const summary = within(deck()).getByRole('heading', { name: 'Deste tamamlandı' });
    expect(document.activeElement).toBe(summary);
    expect(within(deck()).getByRole('status').textContent).toBe(
      'Deste tamamlandı: 3 bildim, 2 bilemedim.',
    );
    expect(within(deck()).getByText('requirement')).toBeTruthy();
    expect(within(deck()).getByText('assessment')).toBeTruthy();
    expect(within(deck()).getByText(/sonraki çalışmalarında önce seçilir/)).toBeTruthy();
    expect(within(deck()).queryByRole('button', { name: 'Bildim' })).toBeNull();

    fireEvent.click(within(deck()).getByRole('button', { name: 'Desteyi baştan başlat' }));
    const toggle = within(deck()).getByRole('button', { name: 'Cevabı göster' });
    expect(document.activeElement).toBe(toggle);
    expect(deck().querySelector('.lp-deck-count')!.textContent).toBe('Kart 1 / 5');
    expect(within(deck()).getByText('deadline')).toBeTruthy();
    // Only the current card (and at most one departing copy) is ever rendered.
    expect(deck().querySelectorAll('.lp-card:not(.lp-card-departing)')).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
  it('lets the card itself flip the answer for pointer users', () => {
    renderPage();
    fireEvent.click(deck().querySelector('.lp-card')!);
    expect(within(deck()).getByRole('button', { name: 'Cevabı gizle' })).toBeTruthy();
    expect(within(deck()).getByText('son teslim tarihi')).toBeTruthy();
  });
});

describe('study activity showcase', () => {
  it('exposes the ten activities as keyboard-operable tabs controlling one stage', () => {
    renderPage();
    const list = screen.getByRole('tablist', { name: 'Çalışma yolları' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toHaveLength(10);
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toEqual([tabs[0]]);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1, -1, -1, -1]);
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0]!.id);
    expect(within(panel).getByRole('heading', { level: 3, name: 'Kelime kartları' })).toBeTruthy();

    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(tab('Yazılı Cevap'));
    expect(tab('Yazılı Cevap').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(tab('Çapraz Bulmaca'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tab('Kelime kartları'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(tab('Çapraz Bulmaca'));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(tab('Kelime kartları'));
    fireEvent.click(tab('Hafıza Oyunu'));
    expect(
      within(screen.getByRole('tabpanel')).getByRole('heading', { name: 'Hafıza Oyunu' }),
    ).toBeTruthy();
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      tab('Hafıza Oyunu').id,
    );
  });
  it('selects an activity from the hero list and focuses its tab', () => {
    renderPage();
    const ribbon = screen.getByRole('navigation', { name: 'On çalışma yolu' });
    fireEvent.click(within(ribbon).getByRole('link', { name: 'Klasik test' }));
    expect(tab('Klasik test').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Klasik test'));
    expect(screen.getByRole('group', { name: 'Doğru Türkçe anlam grubunu seç.' })).toBeTruthy();
  });
  it('checks the written sample locally with normalized input and keeps focus usable', () => {
    renderPage();
    fireEvent.click(tab('Yazılı Cevap'));
    const form = screen.getByRole('form', { name: /Örnek soru/ });
    const input = within(form).getByRole<HTMLInputElement>('textbox', {
      name: 'İngilizce cevabın',
    });
    const check = within(form).getByRole<HTMLButtonElement>('button', { name: 'Kontrol et' });
    expect(check.disabled).toBe(true);
    fireEvent.change(input, { target: { value: '  Requirement ' } });
    fireEvent.submit(form);
    expect(within(form).getByRole('status').textContent).toBe(
      'Doğru! İngilizce karşılık: requirement.',
    );
    expect(input.disabled).toBe(true);
    const retry = within(form).getByRole('button', { name: 'Yeniden dene' });
    expect(document.activeElement).toBe(retry);
    fireEvent.click(retry);
    expect(input.disabled).toBe(false);
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'requirment' } });
    fireEvent.submit(form);
    expect(within(form).getByRole('status').textContent).toBe(
      'Bu örnekte beklenen cevap: requirement.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('answers the classic test sample without losing focus and can retry', () => {
    renderPage();
    fireEvent.click(tab('Klasik test'));
    const options = screen.getByRole('group', { name: 'Doğru Türkçe anlam grubunu seç.' });
    const wrong = within(options).getByRole('button', { name: 'gereksinim / şart' });
    wrong.focus();
    fireEvent.click(wrong);
    expect(document.activeElement).toBe(wrong);
    expect(wrong.getAttribute('aria-disabled')).toBe('true');
    expect(wrong.dataset['state']).toBe('wrong');
    expect(
      within(options).getByRole('button', { name: 'değerlendirme / ölçme' }).dataset['state'],
    ).toBe('correct');
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('status').textContent).toBe(
      'Yanlış. Doğru cevap: değerlendirme / ölçme.',
    );
    fireEvent.click(within(options).getByRole('button', { name: 'son teslim tarihi' }));
    expect(within(panel).getByRole('status').textContent).toContain('Yanlış.');
    fireEvent.click(within(panel).getByRole('button', { name: 'Yeniden dene' }));
    expect(document.activeElement).toBe(
      within(options).getByRole('button', { name: 'son teslim tarihi' }),
    );
    expect(wrong.hasAttribute('aria-disabled')).toBe(false);
    fireEvent.click(within(options).getByRole('button', { name: 'değerlendirme / ölçme' }));
    expect(within(panel).getByRole('status').textContent).toBe(
      'Doğru! assessment: değerlendirme / ölçme.',
    );
  });
  it('builds the assembly sample from letter tiles and returns letters to their tiles', () => {
    renderPage();
    fireEvent.click(tab('Kelime Oluşturma'));
    const tiles = within(screen.getByRole('group', { name: 'Karışık harfler' })).getAllByRole(
      'button',
    );
    expect(tiles.map((t) => t.textContent)).toEqual(['u', 'e', 'q', 'e', 'u']);
    const slots = () => screen.getByRole('group', { name: /Oluşturduğun kelime/ });
    for (const index of [0, 2, 1, 4, 3]) fireEvent.click(tiles[index]!);
    expect(slots().getAttribute('aria-label')).toBe('Oluşturduğun kelime: uqeue');
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByRole('status').textContent).toMatch(/Bu sıralama doğru değil/);
    fireEvent.click(within(slots()).getByRole('button', { name: 'q harfini geri al' }));
    expect(document.activeElement).toBe(tiles[2]);
    expect(tiles[2]!.hasAttribute('aria-disabled')).toBe(false);
    fireEvent.click(within(panel).getByRole('button', { name: 'Baştan başla' }));
    expect(slots().getAttribute('aria-label')).toBe('Oluşturduğun kelime: henüz harf yok');
    expect(document.activeElement).toBe(tiles[0]);
    for (const index of [2, 0, 1, 4, 3]) fireEvent.click(tiles[index]!);
    expect(within(panel).getByRole('status').textContent).toBe('Doğru! queue: kuyruk / sıra.');
    expect(tiles.every((t) => t.getAttribute('aria-disabled') === 'true')).toBe(true);
  });
  it('keeps every demonstration local: a remount starts fresh and nothing is stored or sent', () => {
    const store = vi.spyOn(Storage.prototype, 'setItem');
    const quizOptions = () =>
      screen.getByRole('group', { name: 'Doğru Türkçe anlam grubunu seç.' });
    const slots = () => screen.getByRole('group', { name: /Oluşturduğun kelime/ });
    const view = renderPage();
    // Use the deck and all three playable samples before leaving the page.
    fireEvent.click(within(deck()).getByRole('button', { name: 'Cevabı göster' }));
    fireEvent.click(within(deck()).getByRole('button', { name: 'Bildim' }));
    fireEvent.click(tab('Yazılı Cevap'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'wrong' } });
    fireEvent.submit(screen.getByRole('form', { name: /Örnek soru/ }));
    fireEvent.click(tab('Klasik test'));
    fireEvent.click(within(quizOptions()).getByRole('button', { name: 'değerlendirme / ölçme' }));
    fireEvent.click(tab('Kelime Oluşturma'));
    const tiles = within(screen.getByRole('group', { name: 'Karışık harfler' })).getAllByRole(
      'button',
    );
    for (const tile of tiles) fireEvent.click(tile);
    expect(slots().getAttribute('aria-label')).toBe('Oluşturduğun kelime: ueqeu');
    view.unmount();

    renderPage();
    expect(deck().querySelector('.lp-deck-count')!.textContent).toBe('Kart 1 / 5');
    expect(tab('Kelime kartları').getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(tab('Klasik test'));
    expect(
      within(quizOptions())
        .getAllByRole('button')
        .some((option) => option.hasAttribute('aria-disabled')),
    ).toBe(false);
    fireEvent.click(tab('Kelime Oluşturma'));
    expect(slots().getAttribute('aria-label')).toBe('Oluşturduğun kelime: henüz harf yok');
    expect(fetch).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
});

describe('progressive motion contracts', () => {
  it('reveals observed sections once and cleans up the observer', () => {
    const view = renderPage(),
      observer = observers[0]!,
      target = observer.observe.mock.calls[0]![0] as HTMLElement;
    expect(observers).toHaveLength(1);
    expect(document.querySelector('.lp-reveal-ready')).toBeTruthy();
    expect(target.dataset['visible']).toBe('false');
    observer.reveal(target);
    expect(target.dataset['visible']).toBe('true');
    expect(observer.unobserve).toHaveBeenCalledWith(target);
    view.unmount();
    expect(observer.disconnect).toHaveBeenCalled();
  });
  it('never hides content for reduced motion and handles live preference changes', () => {
    reduced = true;
    const view = renderPage();
    expect(observers).toHaveLength(0);
    expect(document.querySelector('.lp-reveal-ready')).toBeNull();
    expect(document.querySelector('[data-visible="false"]')).toBeNull();
    view.unmount();
    reduced = false;
    renderPage();
    expect(document.querySelector('.lp-reveal-ready')).toBeTruthy();
    reduced = true;
    act(() => mediaChange());
    expect(document.querySelector('.lp-reveal-ready')).toBeNull();
  });
  it('keeps all content available when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    renderPage();
    expect(document.querySelector('.lp-reveal-ready')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Aynı kelimeler, on farklı çalışma.' }),
    ).toBeTruthy();
  });
});
