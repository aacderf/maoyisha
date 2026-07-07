import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Activity,
  Archive,
  ArrowUp,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Code2,
  Cpu,
  Download,
  ExternalLink,
  FileArchive,
  Github,
  Home,
  Layers3,
  Mail,
  Menu,
  MonitorDown,
  Moon,
  MousePointer2,
  PackageCheck,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Swords,
  Workflow,
  X,
} from "lucide-react";
import {
  Link,
  NavLink,
  Outlet,
  createBrowserRouter,
  useLocation,
} from "react-router";
import {
  buildTimeline,
  downloadNotes,
  engineeringProofs,
  faqItems,
  heroFacts,
  maoyishaCaseStudy,
  maoyishaShots,
  narrativeChapters,
  navItems,
  profile,
  qualityChecks,
  release,
  releaseChecklist,
  stackRoles,
  uiPolishNotes,
  yuexiaShots,
} from "./siteData";

type ThemeMode = "light" | "dark";
type ImageAsset = {
  src: string;
  srcSet: string;
  sizes: string;
  placeholder: string;
  alt: string;
};

const THEME_KEY = "maoyisha-theme";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <SiteLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "maoyisha", element: <MaoyishaPage /> },
      { path: "download", element: <DownloadPage /> },
      { path: "build", element: <BuildPage /> },
      { path: "works/yuexia-fuzha", element: <YuexiaPage /> },
      { path: "about", element: <AboutPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

function SiteLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { sentinelRef, isScrolled } = useScrollState();
  const { theme, toggleTheme } = useThemeMode();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="site-shell">
      <div ref={sentinelRef} className="top-sentinel" aria-hidden="true" />
      <ScrollToTop />
      <ScrollProgress />
      <header className={isScrolled ? "topbar is-scrolled" : "topbar"}>
        <Link className="brand-mark" to="/" aria-label="回到首页">
          <span>HL</span>
          <strong>茂一杀</strong>
        </Link>
        <div className="header-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
          <button
            className="nav-toggle"
            type="button"
            aria-label={menuOpen ? "关闭导航" : "打开导航"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
        <nav className={menuOpen ? "nav-links is-open" : "nav-links"} aria-label="主导航">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "is-active" : undefined)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <Outlet />
      <BackToTop visible={isScrolled} />
      <footer className="site-footer">
        <div>
          <strong>HL 的游戏作品集</strong>
          <span>主作品：茂一杀</span>
        </div>
        <div className="footer-links">
          <a href={profile.github} target="_blank" rel="noreferrer">GitHub</a>
          <a href={profile.bilibili} target="_blank" rel="noreferrer">B站</a>
          <a href={`mailto:${profile.email}`}>邮箱</a>
        </div>
      </footer>
    </div>
  );
}

function getSystemTheme(): ThemeMode {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function useThemeMode() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "dark";
    }

    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }

    return getSystemTheme();
  });

  useEffect(() => {
    const root = document.documentElement;
    const themeColor = theme === "dark" ? "#121212" : "#f7f7f4";
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
  }, [theme]);

  useEffect(() => {
    if (window.localStorage.getItem(THEME_KEY)) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setTheme(event.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem(THEME_KEY, next);
      return next;
    });
  };

  return { theme, toggleTheme };
}

function useScrollState() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsScrolled(!entry.isIntersecting),
      { threshold: 0 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { sentinelRef, isScrolled };
}

function ThemeToggle({ theme, onToggle }: { theme: ThemeMode; onToggle: () => void }) {
  const nextLabel = theme === "dark" ? "切换浅色模式" : "切换深色模式";

  return (
    <button className="theme-toggle" type="button" aria-label={nextLabel} onClick={onToggle}>
      {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}

function BackToTop({ visible }: { visible: boolean }) {
  const handleClick = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, left: 0, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <button
      className={visible ? "back-to-top is-visible" : "back-to-top"}
      type="button"
      aria-label="回到顶部"
      onClick={handleClick}
    >
      <ArrowUp size={20} aria-hidden="true" />
    </button>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

function ScrollProgress() {
  return <div className="scroll-progress" aria-hidden="true" />;
}

function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

function RevealSection({
  children,
  className = "",
  as: Component = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div";
}) {
  const ref = useRef<HTMLElement | HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Component ref={ref as never} className={`${className} reveal-section${visible ? " is-visible" : ""}`}>
      {children}
    </Component>
  );
}

function ProgressiveImage({
  image,
  alt,
  className = "",
  loading = "eager",
  ariaHidden = false,
}: {
  image: ImageAsset;
  alt?: string;
  className?: string;
  loading?: "eager" | "lazy";
  ariaHidden?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    setLoaded(Boolean(img?.complete && img.naturalWidth > 0));
  }, [image.src]);

  return (
    <span className={`progressive-image ${className}${loaded ? " is-loaded" : ""}`} aria-hidden={ariaHidden || undefined}>
      <img className="progressive-placeholder" src={image.placeholder} alt="" aria-hidden="true" />
      <img
        ref={imgRef}
        className="progressive-full"
        src={image.src}
        srcSet={image.srcSet}
        sizes={image.sizes}
        alt={ariaHidden ? "" : alt ?? image.alt}
        loading={loading}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </span>
  );
}

function HomePage() {
  usePageTitle("HL | 茂一杀作者");

  return (
    <main>
      <HeroShowcase />
      <GameStatusBar />
      <FeaturedProject />
      <NarrativeChapters />
      <ScreenshotShowcase />
      <EngineeringProof />
      <UiPolishSection />
      <BuildStoryPreview />
      <OtherWorks />
    </main>
  );
}

function HeroShowcase() {
  return (
    <section className="hero-showcase" aria-label="茂一杀官网首屏">
      <ProgressiveImage className="hero-bg-image" image={maoyishaShots[1]} loading="eager" ariaHidden />
      <div className="hero-shade" />
      <div className="hero-showcase-inner">
        <div className="hero-copy">
          <p className="brand-line">HL / 茂一杀作者</p>
          <h1>茂一杀</h1>
          <p className="hero-subtitle">原创校园恶搞多人联机身份卡牌游戏。</p>
          <p className="hero-lead">
            从大厅、开房、多人牌局到 Windows 桌面端，茂一杀已经形成一条可展示、可构建、可继续发布的作品链路。
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/maoyisha">
              <Swords size={18} aria-hidden="true" />
              查看茂一杀
            </Link>
            <Link className="button button-quiet" to="/download">
              <Download size={18} aria-hidden="true" />
              下载 Windows 版
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function GameStatusBar() {
  return (
    <section className="status-bar" aria-label="茂一杀关键信息">
      {heroFacts.map((fact) => (
        <div key={fact.label}>
          <span>{fact.label}</span>
          <strong>{fact.value}</strong>
        </div>
      ))}
    </section>
  );
}

function FeaturedProject() {
  return (
    <RevealSection className="section featured-project">
      <div className="section-heading">
        <span>主作品</span>
        <h2>围绕真实牌局做出来的作品案例</h2>
        <p>{maoyishaCaseStudy.summary}</p>
      </div>
      <div className="feature-cinema">
        <ProgressiveImage image={maoyishaShots[2]} alt="茂一杀出牌交互真实截图。" />
        <div className="feature-copy">
          <h3>{maoyishaCaseStudy.subtitle}</h3>
          <p>{maoyishaCaseStudy.hook}</p>
          <Link className="text-link" to="/maoyisha">
            进入作品案例
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </RevealSection>
  );
}

function NarrativeChapters({ compact = false }: { compact?: boolean }) {
  return (
    <RevealSection className={compact ? "section narrative-section is-compact" : "section narrative-section"}>
      <div className="section-heading">
        <span>作品叙事</span>
        <h2>茂一杀是怎样从工程变成作品的</h2>
        <p>这些章节面向访客解释作品成型过程：规则、联机、桌面牌桌、稳定性和发布交付。</p>
      </div>
      <div className="chapter-track">
        {narrativeChapters.map((chapter) => (
          <article key={chapter.title} className="chapter-card">
            <div>
              <span>{chapter.label}</span>
              <h3>{chapter.title}</h3>
            </div>
            <p>{chapter.summary}</p>
            <strong>{chapter.proof}</strong>
          </article>
        ))}
      </div>
    </RevealSection>
  );
}

function ScreenshotShowcase({ compact = false }: { compact?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(1);
  const active = maoyishaShots[activeIndex];

  return (
    <RevealSection className={compact ? "section screenshot-showcase is-compact" : "section screenshot-showcase"}>
      <div className="section-heading">
        <span>实机画面</span>
        <h2>真实截图比装饰更重要</h2>
        <p>大厅、多人牌桌、出牌响应和 6 人适配都来自茂一杀当前游戏画面。</p>
      </div>
      <div className="screen-director">
        <figure className="screen-main">
          <div className="window-bar">
            <span>{active.label}</span>
            <strong>真实游戏截图</strong>
          </div>
          <ProgressiveImage image={active} alt={active.alt} />
          <figcaption>
            <strong>{active.title}</strong>
            <span>{active.description}</span>
          </figcaption>
        </figure>
        <div className="screen-rail" role="tablist" aria-label="切换茂一杀截图">
          {maoyishaShots.map((shot, index) => (
            <button
              aria-pressed={index === activeIndex}
              className={index === activeIndex ? "is-active" : undefined}
              key={shot.src}
              type="button"
              onClick={() => setActiveIndex(index)}
            >
              <ProgressiveImage image={{ ...shot, sizes: shot.thumbSizes }} alt="" className="rail-thumb" ariaHidden />
              <span>{shot.label}</span>
            </button>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}

function EngineeringProof({ concise = false }: { concise?: boolean }) {
  const items = concise ? engineeringProofs.slice(0, 4) : engineeringProofs;

  return (
    <RevealSection className="section engineering-proof">
      <div className="section-heading">
        <span>工程证据</span>
        <h2>具体问题和对应解决结果</h2>
        <p>这里不是技术名词堆叠，而是茂一杀在联机、生命周期、桌面交互和发布包上实际处理过的问题。</p>
      </div>
      <div className="proof-ledger">
        {items.map((item, index) => (
          <article key={item.title}>
            <div className="proof-index">{String(index + 1).padStart(2, "0")}</div>
            <div>
              <h3>{item.title}</h3>
              <p><strong>问题：</strong>{item.problem}</p>
              <p><strong>处理：</strong>{item.solution}</p>
              <span>{item.result}</span>
            </div>
          </article>
        ))}
      </div>
    </RevealSection>
  );
}

function UiPolishSection() {
  return (
    <RevealSection className="section ui-polish-section">
      <div className="section-heading">
        <span>桌面 UI 打磨</span>
        <h2>让牌桌信息在实机里能读、能点、能拖</h2>
        <p>桌面牌桌的难点不是把牌放上去，而是在多个玩家、多个响应状态和小窗口下仍保持清楚。</p>
      </div>
      <div className="polish-board">
        <figure>
          <ProgressiveImage image={maoyishaShots[3]} alt="茂一杀 6 人桌面布局真实截图。" />
          <figcaption>
            <strong>6 人布局 QA</strong>
            <span>角色牌、手牌区、技能区和战况层在桌面窗口中统一校准。</span>
          </figcaption>
        </figure>
        <div className="polish-notes">
          {uiPolishNotes.map((note) => (
            <article key={note.title}>
              <MousePointer2 size={18} aria-hidden="true" />
              <div>
                <h3>{note.title}</h3>
                <p>{note.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}

function BuildStoryPreview() {
  return (
    <RevealSection className="section build-preview">
      <div className="section-heading">
        <span>构建方式</span>
        <h2>规则、联机、桌面端和发布包是一条链路</h2>
        <p>每个技术都承担一个具体交付问题，最终指向玩家能打开的 Windows 电脑版。</p>
      </div>
      <div className="dossier-grid">
        {maoyishaCaseStudy.buildPillars.map((item) => (
          <article key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
      <Link className="button button-quiet" to="/build">
        <Workflow size={18} aria-hidden="true" />
        查看技术与构建
      </Link>
    </RevealSection>
  );
}

function OtherWorks() {
  return (
    <RevealSection className="section other-works">
      <div className="other-copy">
        <span>其他作品</span>
        <h2>月下符札</h2>
        <p>
          原创弹幕射击原型，包含角色选择、路线推进、养成奖励和 Boss 弹幕。它是作品集里的补充项目，主入口仍然留给茂一杀。
        </p>
        <Link className="button button-quiet" to="/works/yuexia-fuzha">
          <Sparkles size={18} aria-hidden="true" />
          查看月下符札
        </Link>
      </div>
      <div className="moon-strip">
        {yuexiaShots.map((shot) => (
          <figure key={shot.src}>
            <ProgressiveImage image={shot} alt={shot.alt} />
            <figcaption>{shot.title}</figcaption>
          </figure>
        ))}
      </div>
    </RevealSection>
  );
}

function MaoyishaPage() {
  usePageTitle("茂一杀 | HL 的主作品");

  return (
    <main className="page">
      <CaseHero />
      <NarrativeChapters compact />
      <GameplaySection />
      <ScreenshotShowcase compact />
      <BuildArchive />
      <EngineeringProof concise />
      <UiPolishSection />
      <OptimizationSection />
      <RevealSection className="section">
        <ReleasePanel />
      </RevealSection>
    </main>
  );
}

function CaseHero() {
  return (
    <section className="case-hero">
      <div>
        <span>主作品案例</span>
        <h1>茂一杀</h1>
        <p>{maoyishaCaseStudy.summary}</p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/download">
            <Download size={18} aria-hidden="true" />
            查看下载状态
          </Link>
          <Link className="button button-quiet" to="/build">
            <Code2 size={18} aria-hidden="true" />
            查看构建流程
          </Link>
        </div>
      </div>
      <figure className="case-shot">
        <div className="window-bar">
          <span>8 人牌桌</span>
          <strong>桌面 QA 截图</strong>
        </div>
        <ProgressiveImage image={maoyishaShots[1]} alt="茂一杀 8 人牌桌真实截图。" loading="eager" />
      </figure>
    </section>
  );
}

function GameplaySection() {
  return (
    <RevealSection className="section gameplay-section">
      <div className="section-heading">
        <span>玩家体验</span>
        <h2>从进入大厅到开始牌局</h2>
      </div>
      <div className="gameplay-lanes">
        {maoyishaCaseStudy.gameplay.map((item, index) => (
          <article key={item.title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </RevealSection>
  );
}

function BuildArchive() {
  return (
    <RevealSection className="section build-archive">
      <div className="section-heading">
        <span>制作档案</span>
        <h2>茂一杀的构建顺序</h2>
        <p>从共享规则开始，再接 UI、联机、账号、桌面端和发布包。</p>
      </div>
      <ol className="timeline-list">
        {buildTimeline.map((step) => (
          <li key={step.phase}>
            <span>{step.phase}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </RevealSection>
  );
}

function OptimizationSection() {
  return (
    <RevealSection className="section optimization-section">
      <div className="section-heading">
        <span>打磨记录</span>
        <h2>围绕真实对局持续收敛</h2>
      </div>
      <div className="optimization-list">
        {maoyishaCaseStudy.optimizations.map((item) => (
          <div key={item}>
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </RevealSection>
  );
}

function DownloadPage() {
  usePageTitle("下载茂一杀 | HL 的游戏作品集");

  return (
    <main className="page">
      <PageHeader
        kicker="下载"
        title="下载茂一杀"
        description="Windows 版通过 GitHub Releases 发布。下载前请核对版本、文件名、大小、SHA-256 和运行方式。"
      />
      <RevealSection className="section">
        <ReleasePanel expanded />
      </RevealSection>
      <RunGuide />
      <FaqSection />
    </main>
  );
}

function BuildPage() {
  usePageTitle("技术与构建 | HL 的游戏作品集");

  return (
    <main className="page">
      <PageHeader
        kicker="开发档案"
        title="HL 如何构建茂一杀"
        description="这页记录茂一杀背后的工程链路：规则共享包、React 牌桌、Photon 联机、CloudBase 账号、Electron 桌面端、Capacitor 安卓端和 electron-builder 发布包。"
      />
      <TechStackSection />
      <BuildArchive />
      <ProblemSolutionSection />
      <QualitySection />
      <DeliverySection />
    </main>
  );
}

function TechStackSection() {
  return (
    <RevealSection className="section tech-stack">
      <div className="section-heading">
        <span>技术职责</span>
        <h2>每个技术都对应一个作品问题</h2>
      </div>
      <div className="skill-board">
        {stackRoles.map((item) => (
          <article key={item.name}>
            <strong>{item.name}</strong>
            <p>{item.role}</p>
            <span>{item.proof}</span>
          </article>
        ))}
      </div>
    </RevealSection>
  );
}

function ProblemSolutionSection() {
  const iconFor = [RefreshCw, Activity, Cpu, Layers3, PackageCheck, ShieldCheck];

  return (
    <RevealSection className="section problem-section">
      <div className="section-heading">
        <span>关键问题与解决</span>
        <h2>联机、生命周期、桌面 UI 和发布目录都做过收敛</h2>
        <p>这些内容来自茂一杀开发过程，写给想理解工程难点的访客。</p>
      </div>
      <div className="problem-grid">
        {engineeringProofs.map((item, index) => {
          const Icon = iconFor[index] ?? ShieldCheck;
          return (
            <article key={item.title}>
              <Icon size={21} aria-hidden="true" />
              <h3>{item.title}</h3>
              <p>{item.problem}</p>
              <strong>{item.solution}</strong>
              <span>{item.result}</span>
            </article>
          );
        })}
      </div>
    </RevealSection>
  );
}

function QualitySection() {
  return (
    <RevealSection className="section quality-section">
      <div className="section-heading">
        <span>验证顺序</span>
        <h2>从源码到发布包的可信度</h2>
        <p>茂一杀的验证不只停在浏览器预览，还包括桌面构建、桌面 QA 截图和发布包解压运行。</p>
      </div>
      <div className="check-strip">
        {qualityChecks.map((check) => (
          <article key={check.command}>
            <code>{check.command}</code>
            <p>{check.detail}</p>
            <span>{check.result}</span>
          </article>
        ))}
      </div>
    </RevealSection>
  );
}

function DeliverySection() {
  return (
    <RevealSection className="section delivery-section">
      <div className="section-heading">
        <span>交付方式</span>
        <h2>玩家拿到的是完整 Windows 目录</h2>
        <p>
          茂一杀的桌面端不是单文件程序。正式发布时，完整包、累积更新包、SHA-256 和说明文件会配套出现。
        </p>
      </div>
      <div className="delivery-rules">
        {releaseChecklist.map((item) => (
          <div key={item}>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </RevealSection>
  );
}

function YuexiaPage() {
  usePageTitle("月下符札 | HL 的其他作品");

  return (
    <main className="page moon-page">
      <PageHeader
        kicker="其他作品"
        title="月下符札"
        description="原创弹幕射击原型，包含角色选择、路线推进、养成奖励、符卡清弹和 Boss 弹幕。"
      />
      <RevealSection className="section moon-work">
        <div className="moon-gallery">
          {yuexiaShots.map((shot) => (
            <figure key={shot.src}>
              <ProgressiveImage image={shot} alt={shot.alt} />
              <figcaption>
                <strong>{shot.title}</strong>
                <span>{shot.description}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="moon-copy">
          <h2>另一种游戏方向</h2>
          <p>
            月下符札展示实时移动、弹幕躲避、路线选择和长期奖励。它让作品集更完整，但不会抢走茂一杀的主作品位置。
          </p>
          <Link className="button button-quiet" to="/maoyisha">
            <Swords size={18} aria-hidden="true" />
            回到茂一杀
          </Link>
        </div>
      </RevealSection>
    </main>
  );
}

function AboutPage() {
  usePageTitle("关于 HL | HL 的游戏作品集");

  return (
    <main className="page">
      <PageHeader
        kicker="联系"
        title="HL 的游戏作品集"
        description="这个站点用于展示 HL 的游戏作品、实机截图、技术构建和下载入口。当前主作品是茂一杀。"
      />
      <RevealSection className="section about-section">
        <div className="about-copy">
          <h2>当前作品方向</h2>
          <p>
            作品集重点展示本地开发的联机卡牌游戏如何从规则、联机、桌面端到发布包逐步成型。茂一杀是主作品，月下符札是补充项目。
          </p>
        </div>
        <div className="contact-list">
          <a href={profile.github} target="_blank" rel="noreferrer">
            <Github size={21} aria-hidden="true" />
            GitHub: aacderf
            <ExternalLink size={16} aria-hidden="true" />
          </a>
          <a href={profile.bilibili} target="_blank" rel="noreferrer">
            <Radio size={21} aria-hidden="true" />
            B站：{profile.bilibiliName}
            <ExternalLink size={16} aria-hidden="true" />
          </a>
          <a href={`mailto:${profile.email}`}>
            <Mail size={21} aria-hidden="true" />
            {profile.email}
          </a>
        </div>
      </RevealSection>
    </main>
  );
}

function NotFoundPage() {
  usePageTitle("页面不存在 | HL 的游戏作品集");

  return (
    <main className="page">
      <section className="not-found">
        <span>404</span>
        <h1>页面不存在</h1>
        <p>这个地址没有对应页面，可以回到首页或下载页继续查看。</p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/">
            <Home size={18} aria-hidden="true" />
            回到首页
          </Link>
          <Link className="button button-quiet" to="/download">
            <Download size={18} aria-hidden="true" />
            查看下载
          </Link>
        </div>
      </section>
    </main>
  );
}

function PageHeader({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <section className="page-header">
      <span>{kicker}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}

function ReleasePanel({ expanded = false }: { expanded?: boolean }) {
  return (
    <div className={expanded ? "release-panel is-expanded" : "release-panel"}>
      <div className="release-head">
        <div>
          <span>Windows 发布</span>
          <h2>茂一杀 {release.version}</h2>
          <p>玩家可以从 GitHub Releases 下载完整包或累积更新包，并按 SHA-256 核对文件完整性。</p>
        </div>
        <div className="version-pill">
          <MonitorDown size={20} aria-hidden="true" />
          <strong>{release.tag}</strong>
          <span>{release.status}</span>
        </div>
      </div>
      <div className="download-layout">
        <DownloadCard item={release.fullPackage} primary />
        <DownloadCard item={release.updatePackage} />
      </div>
      <div className="release-rules">
        {releaseChecklist.map((item) => (
          <div key={item}>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type DownloadItem = typeof release.fullPackage;

function DownloadCard({ item, primary = false }: { item: DownloadItem; primary?: boolean }) {
  const disabled = item.href.length === 0;

  return (
    <article className={primary ? "download-card is-primary" : "download-card"}>
      <div className="download-card-head">
        {primary ? <Archive size={24} aria-hidden="true" /> : <FileArchive size={24} aria-hidden="true" />}
        <div>
          <h3>{item.label}</h3>
          <p>{item.fileName}</p>
        </div>
      </div>
      <dl>
        <div>
          <dt>版本</dt>
          <dd>{release.version}</dd>
        </div>
        <div>
          <dt>大小</dt>
          <dd>{item.size}</dd>
        </div>
      </dl>
      <div className="hash-block">
        <span>SHA-256</span>
        <code>{item.sha256}</code>
      </div>
      {disabled ? (
        <button className={primary ? "button button-primary" : "button button-quiet"} type="button" disabled>
          <Boxes size={18} aria-hidden="true" />
          暂未开放
        </button>
      ) : (
        <a className={primary ? "button button-primary" : "button button-quiet"} href={item.href}>
          <Download size={18} aria-hidden="true" />
          下载文件
        </a>
      )}
    </article>
  );
}

function RunGuide() {
  return (
    <RevealSection className="section run-guide">
      <div className="section-heading">
        <span>运行方式</span>
        <h2>先解压整个文件夹，再运行第一层 exe</h2>
        <p>Windows 电脑版依赖同目录资源。单独复制 exe 会导致资源缺失或校验失败。</p>
      </div>
      <div className="run-list">
        {downloadNotes.map((note) => (
          <div key={note}>
            <BadgeCheck size={20} aria-hidden="true" />
            <span>{note}</span>
          </div>
        ))}
      </div>
    </RevealSection>
  );
}

function FaqSection() {
  return (
    <RevealSection className="section faq-section">
      <div className="section-heading">
        <span>FAQ</span>
        <h2>下载前常见问题</h2>
      </div>
      <div className="faq-list">
        {faqItems.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </RevealSection>
  );
}
