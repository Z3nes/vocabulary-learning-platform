[English](INSTALL_WINDOWS.md) | [Türkçe](INSTALL_WINDOWS.tr.md)

# Windows Kurulumu

Bu kılavuz ön yüzü ve API'yi Windows üzerinde, PostgreSQL'i Docker içinde çalıştırır. Ortak demo kimliği kullanan yerel bir geliştirme kurulumudur; herkese açık bir yayın kurulumu değildir. PostgreSQL ve pgAdmin'i ayrıca kurman gerekmez.

[Docker Desktop'ın desteklediği](https://docs.docker.com/desktop/setup/install/windows-install/) bir Windows sürümü ve donanım sanallaştırması gerekir. Kurulum yönetici izni ve yeniden başlatma isteyebilir. Proje komutlarını normal PowerShell'de, kendi proje klasöründen çalıştır; `C:\Windows\System32` klasörünü kullanma.

## 1. Kurulum yöntemini seç

Aşağıdaki her ön koşul için resmî indirme ve PowerShell yöntemi bulunur. Her araç için bir yöntem seç. `winget`, Windows Paket Yöneticisi'dir; `winget --version` ile kontrol edebilirsin. Yoksa resmî yükleyicileri veya Microsoft'un [App Installer yönergelerini](https://learn.microsoft.com/en-us/windows/package-manager/winget/) kullan.

Komut satırı araçlarını kurduktan sonra güncel PATH değerini görmesi için yeni bir PowerShell penceresi aç. Sürüm kontrolleri zaten başarılıysa araçları yeniden kurman gerekmez.

## 2. Node.js 24

Proje **24.11.0 veya daha yeni, 25'ten düşük Node.js 24.x** sürümlerini kabul eder; diğer ana sürümleri `engine-strict` ile reddeder. Bu kılavuz doğrulama ortamıyla eşleşmesi için **24.14.0** sürümünü sabitler. Bu, tekrarlanabilir bir referanstır; en yeni Node.js 24 sürümü olduğu iddiası değildir. Daha yeni 24.x yamaları [resmî Node.js 24 arşivinden](https://nodejs.org/download/release/latest-v24.x/) değerlendirebilirsin.

**A. Resmî indirme:** [24.14.0 sürüm arşivini](https://nodejs.org/download/release/v24.14.0/) aç. Standart 64 bit Intel/AMD bilgisayarda `node-v24.14.0-x64.msi`, ARM bilgisayarda ARM64 MSI kullan. Yükleyici npm'i de içerir. PATH seçeneğini açık bırak; ilgisiz isteğe bağlı geliştirme araçları bu kılavuz için gerekli değildir.

**B. PowerShell / WinGet:** bu sürüm [Microsoft WinGet kaydında](https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/o/OpenJS/NodeJS/LTS/24.14.0/OpenJS.NodeJS.LTS.installer.yaml) bulunur. Önce güncel kataloğu kontrol et, sonra kur:

```powershell
winget show --id OpenJS.NodeJS.LTS --exact --source winget --versions
winget install --id OpenJS.NodeJS.LTS --exact --source winget --version 24.14.0 --installer-type wix
```

Sürüm senin kataloğunda yoksa A yöntemini kullan. Sürüm parametresini kaldırıp yanlışlıkla başka bir Node ana sürümünü kurma. [WinGet'in sürüm seçeneği](https://learn.microsoft.com/en-us/windows/package-manager/winget/install), belirli bir sürümü seçer.

Node.js 26 zaten kuruluysa mevcut sürüm yöneticinden Node 24'ü seç veya Windows **Ayarlar → Uygulamalar → Yüklü uygulamalar** üzerinden Node.js 26'yı kaldırıp 24.14.0'ı kur. Başka projelerin kullandığı bir sürümü, yerine ne kullanacağını planlamadan kaldırma. `.nvmrc` istenen ana sürümü belirtir; kendiliğinden sürüm değiştirmez. Zaten sürüm yöneticin varsa ikinci bir MSI kurulumu ile karıştırma.

Yeni bir PowerShell penceresinde doğrula:

```powershell
node --version
npm.cmd --version
Get-Command node | Select-Object Source
```

Sabitlenen yükleyicide Node çıktısı `v24.14.0` olmalıdır. Hâlâ 26 görünüyorsa devam etmeden önce gösterilen çalıştırılabilir dosya yolunu kontrol edip doğru kurulumu seç.

## 3. Git

**A. Resmî indirme:** [Git for Windows'u](https://git-scm.com/install/windows) kur; Git'in komut satırı programlarından kullanılabilmesini sağlayan seçeneği açık bırak.

**B. PowerShell / WinGet:**

```powershell
winget install --id Git.Git --exact --source winget
```

Yeni bir PowerShell penceresinde doğrula:

```powershell
git --version
```

## 4. WSL 2

Docker'ın WSL 2 altyapısı WSL gerektirir; ayrı bir Ubuntu dağıtımı **gerekmez**. Docker, kullanıcı tarafından kurulmuş bir Linux dağıtımı olmadan Windows PowerShell üzerinden Linux container'larını çalıştırabilir. [Docker'ın WSL belgesine](https://docs.docker.com/desktop/features/wsl/) bak.

Önce kontrol et:

```powershell
wsl --version
wsl --status
```

WSL güncel ve çalışır durumdaysa Docker bölümüne geç. Yoksa veya kurulumu eksikse şu yöntemlerden birini kullan:

**A. Resmî indirme:** [Microsoft'un WSL sürümlerinden](https://github.com/microsoft/WSL/releases) bilgisayar mimarine uygun kararlı MSI dosyasını indir; gereken Windows bileşenleri için Microsoft'un [kurulum yönergelerini](https://learn.microsoft.com/en-us/windows/wsl/install) izle.

**B. Yönetici PowerShell:** PowerShell'e sağ tıklayıp **Yönetici olarak çalıştır** seçeneğini kullan ve şu komutu çalıştır:

```powershell
wsl --install --no-distribution
```

İstendiğinde Windows'u yeniden başlat. Var olan kurulumu güncellemek gerekiyorsa:

```powershell
wsl --update
```

`wsl --version` ve `wsl --status` komutlarını yeniden çalıştır. Docker şu anda en az WSL 2.1.5 ister; yükleyici daha yüksek bir alt sınır bildirirse güncel gereksinimleri kontrol et. Kullanıcıya ait Linux dağıtımı bulunmadığını söyleyen bir mesaj tek başına Ubuntu kurmanı gerektirmez. [`--no-distribution` seçeneği](https://learn.microsoft.com/en-us/windows/wsl/basic-commands) bu adımı bilerek atlar.

## 5. Docker Desktop

**A. Resmî indirme:** [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) sayfasından bilgisayar mimarine uygun yükleyiciyi indir.

**B. PowerShell / WinGet:**

```powershell
winget install --id Docker.DockerDesktop --exact
```

Yükleyicinin koşullarını ve sorularını kendin incele. Kurulumdan sonra Başlat menüsünden **Docker Desktop'ı aç**; yalnızca CLI'nin kurulması Engine'i başlatmaz. **Linux container'larını** ve görünüyorsa **WSL 2 based engine** seçeneğini kullan. Engine'in başlamasını bekle.

Yeni bir PowerShell penceresinde doğrula:

```powershell
docker --version
docker compose version
docker info --format '{{.ServerVersion}}'
docker info --format '{{.OSType}}'
```

Sunucu sürümü komutu bağlantı hatası yerine bir sürüm döndürmeli; işletim sistemi türü `linux` olmalıdır. Compose 2.20 veya daha yeni olmalıdır. Yalnızca `docker --version` komutunun başarılı olması sadece istemciyi doğrular.

## 6. Kullanıcı klasörüne klonla

Normal PowerShell kullan:

```powershell
Set-Location $env:USERPROFILE
git clone https://github.com/Z3nes/vocabulary-learning-platform.git
Set-Location .\vocabulary-learning-platform
Get-Location
```

Oluşan klasör kendi kullanıcı klasörünün içinde olmalıdır. `C:\Windows\System32` içine klonlama. Hedef klasör zaten varsa içeriğini incele veya başka boş bir klasör seç; klonlama başarılı olsun diye mevcut proje kopyasını silme. Depo özel olduğu sürece erişim iznin gerekir. GitHub'ın normal giriş akışını kullan ve adrese token ekleme.

## 7. Proje bağımlılıklarını kur

Bir önceki adımda `vocabulary-learning-platform` klasörüne geçtik. PowerShell terminalinin bu klasörde açık olduğundan emin ol.

Bulunduğun klasörü kontrol etmek için:

```powershell
Get-Location
```

Ardından proje için gerekli bağımlılıkları yükle:

```powershell
npm.cmd ci
```

Bu komut, projenin `package-lock.json` dosyasında belirtilen bağımlılıkları kurar. İlk kurulumda internet bağlantısı gereklidir.

PowerShell, çalıştırma ilkesi nedeniyle `npm.ps1` dosyasını engelleyebilir. Bu yüzden `npm.cmd` kullanıyoruz. Windows güvenlik ayarlarını değiştirmen veya `Set-ExecutionPolicy` çalıştırman gerekmez.

<a id="ayni-bilgisayarda-ikinci-kopya"></a>

> [!IMPORTANT]
> **Bu projeyi bu bilgisayara ilk kez mi kuruyorsun?** Doğrudan 8. bölüme geç.
>
> **Bu projenin başka bir kopyası bu bilgisayarda yerel Docker kurulumunu zaten kullanıyor mu?** Burada dur. Yeni bir klasör ayrı bir veritabanı oluşturmaz; iki kopya aynı container'ı ve verileri hedefleyebilir. `local:setup` komutunu çalıştırmadan **önce** [Aynı bilgisayarda ikinci kopya](LOCAL_DEVELOPMENT.md#ayni-bilgisayarda-ikinci-kopya) yönergelerini izleyerek ayrı bir ortam yapılandır.

## 8. Veritabanını hazırla ve uygulamayı başlat

Docker Desktop açık kalsın:

```powershell
npm.cmd run local:setup
npm.cmd run local:dev
```

İlk komut `.env.docker` yoksa bağımsız rastgele parolalarla oluşturur, PostgreSQL 18.6'yı yalnızca yerel bilgisayara bağlayarak başlatır, Prisma Client'ı üretir, migration'ları uygular ve şemayı doğrular. Var olan ortam dosyalarının üzerine yazılmaz; kelime verisi eklenmez veya içe aktarılmaz. İlk imaj indirmesi birkaç dakika sürebilir.

Mevcut betiğin başarılı çıktısı şu satırları aynen içerir:

```text
[local] vocabulary_local: 10 migrations and 13 model tables verified.
[local] Prisma Client generated; local database ready. Run npm run local:dev.
```

Bunlar beklenen çıktıyı gösterir; kurulum ekran görüntüsü değildir. Sonraki bir sürümde migration sayısı değişirse o sürümün migration klasörüyle karşılaştırılmalıdır.

`local:dev` şemayı yeniden doğrular ve API ile ön yüzü başlatır. Varsayılan ayarlarda şu satırı yazdırır:

```text
[local] Local demo identity only. Web: http://127.0.0.1:5173/
```

[Ana paneli aç](http://127.0.0.1:5173/), bir liste oluştur ve kendi kelimelerini ekle. Başka bir PowerShell penceresinde varsayılan portlarla şu kontrolleri yapabilirsin:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
Invoke-RestMethod http://127.0.0.1:5173/api/health/db
```

`status: ok` ve `database: reachable` sonuçlarını bekle. Portları değiştirdiysen kendi portlarını kullan. `/dev/status` sayfası da yerel API/veritabanı durumunu gösterir. Varsayılan portlarda başka bir program çalışıyorsa bu istekleri ona gönderme.

## 9. Durdur ve yeniden başlat

Web/API süreçlerini durdurmak için `local:dev` çalışan pencerede **Ctrl+C** kullan. Ardından aynı proje kopyasında çalıştır:

```powershell
npm.cmd run local:stop
```

Bu komut o kopyanın PostgreSQL container'ını durdurur; adlandırılmış veri birimini, listeleri ve çalışma geçmişini korur. `.env.docker` dosyasını gizli tut ve ilk oluşturulan parolaları sakla. Veritabanı durdurulduktan sonra yeniden başlatmak için:

```powershell
npm.cmd run local:setup
npm.cmd run local:dev
```

Veritabanı hâlâ çalışıyor ve şema güncelse `local:dev` yeterlidir. Durdurmak ve yeniden başlatmak için aynı proje kopyasını/yapılandırmayı kullan.

## 10. Testler

[README'deki test komutlarına](../README.tr.md#testler) bak. Prisma Client üretildikten sonra birim testleri çalışan veritabanı gerektirmez. `npm.cmd run local:test:integration`, kendine ait doğrulanmış Docker ortamını gerektirir ve onun özel test veritabanını kullanır. Test hedefi yerine kişisel veritabanı bağlantısı verme.

## 11. Sorun giderme

| Sorun                                               | Kontrol edilecekler                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Yanlış Node sürümü / `EBADENGINE`                   | `node --version` ve `Get-Command node` çalıştır. En az 24.11.0 olan Node 24.x seç, PowerShell'i yeniden aç ve `npm.cmd ci` komutunu tekrarla. `engine-strict` ayarını kapatma.                                                                                                                         |
| Git klonlamada izin hatası                          | `Get-Location` ile kullanıcı klasöründe olduğunu doğrula. Kimlik doğrulama hatasında depoya erişimini kontrol edip normal GitHub girişini kullan. Sistem klasörüne yazmak için Git'i yönetici olarak çalıştırma.                                                                                       |
| Docker komutu bulunamıyor                           | Docker Desktop kurulumunu tamamla, PowerShell'i yeniden aç ve `Get-Command docker` çalıştır. WinGet yoksa resmî yükleyiciyi kullan.                                                                                                                                                                    |
| Docker Engine başlayamıyor                          | Docker Desktop'ı aç, hatasını incele, WSL durumunu ve donanım sanallaştırmasını doğrula, istenen yeniden başlatmaları tamamla. Resmî Docker sorun giderme bilgilerine bak; ilk adım olarak fabrika ayarlarına dönme veya veri silme.                                                                   |
| WSL yok veya eksik                                  | `wsl --version` ve `wsl --status` çalıştır; WSL yoksa Yönetici PowerShell'de `wsl --install --no-distribution` kullan. Var olan WSL'yi `wsl --update` ile güncelle ve istenirse yeniden başlat.                                                                                                        |
| 5433, 3000 veya 5173 portu kullanılıyor             | Portu kullanan programı belirle. Ek bir izole kopya için [ikinci kopya yönergelerini](LOCAL_DEVELOPMENT.md#ayni-bilgisayarda-ikinci-kopya) izleyerek ayrı proje, veri birimi ve boş portlar kullan. Tanımadığın veritabanını durdurma veya veri içeren container'ın portlarını incelemeden değiştirme. |
| `npm.ps1` yüklenemiyor                              | `npm.cmd`, gerektiğinde `npx.cmd` kullan. Sistem çalıştırma ilkesini değiştirmek gerekmez.                                                                                                                                                                                                             |
| Prisma kimlik doğrulama, migration veya şema hatası | İlk `.env.docker` parolalarını koru. Bildirilen Prisma kodunu, migration adını ve container kimliğini incele. Sıfırlama, `db push`, uygulanmış migration'ı düzenleme veya veri birimi silme yapma. Gizli bilgileri çıkarılmış hata ayrıntılarıyla yardım iste.                                         |
| Ön yüz veya API başlamıyor                          | `npm.cmd ci` ve `local:setup` işlemlerinin tamamlandığını, Docker sunucu sürümü kontrolünün geçtiğini ve portların boş olduğunu doğrula. Proje kökünden `npm.cmd run local:dev` başlat; iki sürecin çıktısını da incele.                                                                               |
| İmaj veya paket indirilemiyor                       | Docker kayıt deposuna veya npm'e ağ/proxy erişimini kontrol et; bağlantı düzeldikten sonra aynı komutu tekrarla. Ağ hatasını çözmek için kilit dosyasını veya veritabanı parolalarını değiştirme.                                                                                                      |
| Dinleme sesi yok                                    | Varsayılan kurulum Azure'u kapatır. Tarayıcı yedeği kullanılabilir bir İngilizce ses gerektirir; ses yoksa arayüzdeki ses kullanılamıyor akışını kullan.                                                                                                                                               |

Destek isterken gerçek ortam dosyalarını, sansürlenmemiş Docker inceleme çıktısını, veritabanı adreslerini veya kişisel kelimelerini paylaşma. Olağan bir çözüm olarak Docker veri birimlerini silme veya veritabanlarını sıfırlama.
