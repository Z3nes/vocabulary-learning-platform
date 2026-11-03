# Third-party Notices / Üçüncü Taraf Bildirimleri

This document records third-party assets used by the project. It does **not** grant a license for the application itself. No project license has been selected or added; that decision requires contributor approval.

Bu belge projede kullanılan üçüncü taraf varlıklarını kaydeder. Uygulamanın kendisi için lisans **vermez**. Proje lisansı seçilmedi veya eklenmedi; bu karar katkıda bulunanların onayını gerektirir.

| Asset / Varlık                      | Source / Kaynak                                                                                    | Supplied license / Birlikte gelen lisans                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Inter font                          | `@fontsource-variable/inter`, installed from the lockfile; [Inter project](https://rsms.me/inter/) | SIL Open Font License 1.1; exact package notice in [Inter-OFL-1.1.txt](licenses/Inter-OFL-1.1.txt)                         |
| Lucide icons                        | `lucide-react`, installed from the lockfile; [Lucide license](https://lucide.dev/license)          | ISC, plus MIT notices for Feather-derived icons; exact package notice in [Lucide-LICENSE.txt](licenses/Lucide-LICENSE.txt) |
| Favicon and interface illustrations | Project SVG, JSX and CSS source                                                                    | Part of the project; no separate project license has been assigned. / Projenin parçası; ayrı bir proje lisansı atanmadı.   |

Font binaries and icon package implementations are obtained through `npm ci`, not copied from a developer's machine into this source distribution. Inter is bundled into frontend builds; system font fallback names do not redistribute those system fonts. Preserve the applicable notices when distributing assets or build output. The notice files above are copied verbatim from the installed locked packages.

Font dosyaları ve simge paketi uygulamaları, geliştiricinin bilgisayarından bu kaynak dağıtımına kopyalanmak yerine `npm ci` ile alınır. Inter ön yüz derlemesine dahil edilir; sistem fontu yedek adları bu sistem fontlarını yeniden dağıtmaz. Varlıkları veya derleme çıktısını dağıtırken ilgili bildirimleri koru. Yukarıdaki bildirim dosyaları kilitli sürümlerle kurulan paketlerden aynen kopyalanır.

Other packages remain under their respective licenses as supplied by npm. This is an asset inventory, not an exhaustive legal review of every transitive dependency. No official university logo, photograph or proprietary font file is included in the copied static assets.

Diğer paketler npm ile sağlanan kendi lisanslarına tabidir. Bu, varlık envanteridir; tüm dolaylı bağımlılıkların kapsamlı hukuki incelemesi değildir. Kopyalanan statik varlıklarda resmî üniversite logosu, fotoğrafı veya özel lisanslı font dosyası bulunmaz.

The optional Tatoeba adapter accepts a limited set of sentence licenses and returns source attribution. No Tatoeba dataset or sentence export is bundled. Optional Azure speech output and its caching require review of the service's applicable terms. Both external integrations are disabled by the supported local Docker workflow; browser speech availability depends on the user's browser/OS.

İsteğe bağlı Tatoeba adaptörü sınırlı bir cümle lisansı kümesini kabul eder ve kaynak atfını döndürür. Tatoeba veri kümesi veya cümle dışa aktarımı paketlenmez. İsteğe bağlı Azure ses çıktısı ve önbelleğe alınması, hizmetin geçerli koşullarının incelenmesini gerektirir. Desteklenen yerel Docker akışında iki dış entegrasyon da kapalıdır; tarayıcı sesinin kullanılabilirliği tarayıcıya/işletim sistemine bağlıdır.
