import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getRecommendationsFromProfile } from "../api/recommendation.api";
import { explainScheme, analyzeEligibilityGap } from "../api/ai.api";
import { AuthStatusButton } from "../components/AuthGate";
import { unlockSharedAudioContext } from "../utils/audioUnlock";
import { prefetchGreetingAudio } from "../utils/greetingPrefetch";

import civicHeroImg from "../assets/images/civic_compass_hero.jpg";

const QUICK_TOPICS = [
  {
    title: "Startup Grants",
    subtitle: "Seed funds & DPIIT support",
    query: "startup",
  },
  {
    title: "Farmer Welfare",
    subtitle: "Income & crop protection",
    query: "farmer",
  },
  {
    title: "Scholarships",
    subtitle: "Central & state education aid",
    query: "scholarship",
  },
  {
    title: "Women & MSME",
    subtitle: "Business credit & subsidies",
    query: "women",
  },
];

function HeroShowcase({ onStartVoice, onExploreTopic, onBrowseAll }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="bg-[var(--surface)] border border-black/10 rounded-2xl overflow-hidden shadow-[0_20px_50px_-24px_rgba(0,0,0,0.2)]">
      {/* Architectural Editorial Image */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[var(--bg-dark)]">
        {!imgFailed ? (
          <img
            src={civicHeroImg}
            alt="Sunlit Indian civic courtyard blending sandstone arches with modern glass architecture"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover object-center transition-transform duration-700 ease-out hover:scale-[1.03]"
          />
        ) : (
          <div
            className="w-full h-full flex items-end p-6"
            style={{
              background:
                "linear-gradient(135deg, #171717 0%, #262626 52%, #3f3622 100%)",
            }}
          />
        )}

        {/* Measured Contrast Scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

        {/* Unboxed Editorial Caption */}
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 text-white">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-white/80 tracking-wide">
            <span>Central &amp; State Schemes</span>
            <span aria-hidden="true">·</span>
            <span className="text-[var(--gold)]">English &amp; हिंदी Voice AI</span>
          </div>
          <p className="mt-1.5 text-lg sm:text-xl font-display font-bold leading-snug tracking-tight">
            Clarity on every scheme before you apply.
          </p>
        </div>
      </div>

      {/* Category Quick-Explore Header */}
      <div className="px-5 py-3 border-b border-black/[0.06] flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-muted)]">
          Quick Scheme Directory
        </span>
        <button
          type="button"
          onClick={onBrowseAll}
          className="text-xs font-semibold text-[var(--text)] hover:text-[var(--gold)] transition-colors whitespace-nowrap"
        >
          Browse all →
        </button>
      </div>

      {/* Hairline-Separated 2x2 Interactive Category Grid */}
      <div className="grid grid-cols-2 divide-x divide-y divide-black/[0.06]">
        {QUICK_TOPICS.map((topic) => (
          <button
            key={topic.query}
            type="button"
            onClick={() => onExploreTopic(topic.query)}
            className="group text-left px-5 py-4 hover:bg-[var(--surface-2)]/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--gold)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-display font-bold text-[var(--text)] group-hover:text-black transition-colors truncate">
                {topic.title}
              </span>
              <span
                aria-hidden="true"
                className="text-xs text-[var(--text-muted)] group-hover:translate-x-0.5 group-hover:text-[var(--text)] transition-transform shrink-0"
              >
                →
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate">
              {topic.subtitle}
            </p>
          </button>
        ))}
      </div>

      {/* Direct Bilingual Voice Advisor Bar */}
      <button
        type="button"
        onClick={onStartVoice}
        className="w-full bg-[var(--bg-dark)] text-[var(--text-on-dark)] px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-neutral-900 transition-colors group"
      >
        <div className="min-w-0">
          <div className="text-sm font-display font-bold tracking-tight text-white">
            Ask the Voice Advisor
          </div>
          <div className="text-xs text-[var(--text-muted-on-dark)] truncate">
            Speak in English or हिंदी for instant eligibility checks
          </div>
        </div>
        <span className="shrink-0 text-xs font-mono font-bold text-[var(--gold)] tracking-wide group-hover:translate-x-0.5 transition-transform whitespace-nowrap">
          Start Voice →
        </span>
      </button>
    </div>
  );
}

function HeroText() {
  const [textIndex, setTextIndex] = useState(0);
  const text1 = "Government schemes, matched like a ";
  const text2 = "case file";
  const text3 = ".";

  useEffect(() => {
    if (textIndex < text1.length) {
      const t = setTimeout(() => setTextIndex(textIndex + 1), 65);
      return () => clearTimeout(t);
    }
  }, [textIndex, text1.length]);

  const isTypingDone = textIndex === text1.length;

  return (
    <h1 className="text-4xl md:text-5xl font-bold leading-tight font-display tracking-tight text-[var(--text)] min-h-[100px]">
      {text1.substring(0, textIndex)}
      {isTypingDone && (
        <>
          <span className="animate-draw-underline">{text2}</span>
          {text3}
        </>
      )}
      {!isTypingDone && <span className="inline-block w-[3px] h-[0.9em] bg-[var(--gold)] animate-pulse ml-1 translate-y-1"></span>}
    </h1>
  );
}

function ScrollReveal({ children, delay = 0 }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transform transition-all duration-700 ease-out h-full ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
      }`}
    >
      {children}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();


  // Search results state
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // AI explanations & gap analysis cache states
  const [explanations, setExplanations] = useState({});
  const [loadingExplanations, setLoadingExplanations] = useState({});
  const [advices, setAdvices] = useState({});
  const [loadingAdvices, setLoadingAdvices] = useState({});

  // Refs for navigation scrolling
  const finderRef = useRef(null);
  const infoRef = useRef(null);
  const resultsRef = useRef(null);
  const privacyRef = useRef(null);

  // Handle Input Changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle Tag Selection Toggle
  const handleTagToggle = (tag) => {
    setFormData((prev) => {
      const alreadySelected = prev.tags.includes(tag);
      return {
        ...prev,
        tags: alreadySelected
          ? prev.tags.filter((t) => t !== tag)
          : [...prev.tags, tag]
      };
    });
  };

  // Submit Search payload
  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);

    // Clean payload: strip empty/falsy keys
    const payload = {};
    if (formData.state) payload.state = formData.state;
    if (formData.category) payload.category = formData.category;
    if (formData.subCategory) payload.subCategory = formData.subCategory.trim();
    if (formData.beneficiaryType) payload.beneficiaryType = formData.beneficiaryType;
    if (formData.tags && formData.tags.length > 0) payload.tags = formData.tags;

    try {
      const data = await getRecommendationsFromProfile(payload);
      setResults(data);
      // Wait for DOM update, then scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      console.error(err);
      setError(
        err?.response?.data?.message ||
        err?.message ||
        "Could not load recommendations. Please verify the backend is running."
      );
    } finally {
      setLoading(false);
    }
  };

  // Reset form inputs
  const handleReset = () => {
    setFormData({
      state: "",
      category: "",
      subCategory: "",
      beneficiaryType: "",
      tags: []
    });
    setResults(null);
    setError(null);
  };

 

  // Lazy-load AI Eligibility Gap Analysis
  const fetchGapAnalysis = async (schemeId, failedCriteria) => {
    if (advices[schemeId] || loadingAdvices[schemeId]) return;

    setLoadingAdvices((prev) => ({ ...prev, [schemeId]: true }));
    try {
      const res = await analyzeEligibilityGap(schemeId, failedCriteria, formData);
      if (res?.success && res?.advice) {
        setAdvices((prev) => ({ ...prev, [schemeId]: res.advice }));
      } else {
        setAdvices((prev) => ({ ...prev, [schemeId]: "No AI gap advice available." }));
      }
    } catch (err) {
      console.error(err);
      setAdvices((prev) => ({ ...prev, [schemeId]: "Could not generate eligibility advice at this time." }));
    } finally {
      setLoadingAdvices((prev) => ({ ...prev, [schemeId]: false }));
    }
  };

  const handleScroll = (ref) => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleMouse = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();

    e.currentTarget.style.setProperty(
      "--x",
      `${e.clientX - rect.left}px`
    );

    e.currentTarget.style.setProperty(
      "--y",
      `${e.clientY - rect.top}px`
    );
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans flex flex-col">
      {/* 1. STICKY NAV BAND */}
      <header className="sticky top-0 z-50 bg-[var(--bg)] text-[var(--text)] border-b border-black/5 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4 lg:gap-6">
          <div className="flex items-center gap-2.5 select-none shrink-0">
            <span className="text-xl sm:text-2xl font-bold tracking-tight font-display leading-none whitespace-nowrap">
              Govt Compass
            </span>
            <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono bg-[var(--gold)] text-black rounded font-bold uppercase tracking-widest">
              BETA
            </span>
          </div>

          {/* Centered Desktop Navigation (normal flex flow — never overlaps siblings) */}
          <nav className="hidden lg:flex items-center gap-6 text-sm font-semibold text-[var(--text-muted)] shrink-0">
            <button
              onClick={() => handleScroll(infoRef)}
              className="whitespace-nowrap hover:text-[var(--text)] transition-colors duration-200"
            >
              Methodology
            </button>
            <button
              onClick={() => handleScroll(privacyRef)}
              className="whitespace-nowrap hover:text-[var(--text)] transition-colors duration-200"
            >
              Privacy
            </button>
            <a
              href="https://github.com/sunilkumarrana/Arceus-"
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap hover:text-[var(--text)] transition-colors duration-200"
            >
              GitHub
            </a>
          </nav>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <button
              onClick={() => navigate('/schemes')}
              className="hidden md:inline-block whitespace-nowrap text-sm font-bold text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              Explore Schemes
            </button>
            <button
              onClick={() => {
                unlockSharedAudioContext();
                prefetchGreetingAudio();
                navigate('/agent', { state: { autoGreet: true } });
              }}
              className="whitespace-nowrap bg-[var(--text)] text-[var(--bg)] px-4 sm:px-5 py-1.5 rounded-lg text-xs font-bold font-mono tracking-wider hover:opacity-80 hover:-translate-y-[1px] active:translate-y-[1px] transition-all duration-150"
            >
              Find Schemes
            </button>
            <AuthStatusButton />
          </div>
        </div>
      </header>

      {/* 2. HERO SECTION */}
      <section className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-12 items-center flex-grow">
        <div className="space-y-6">
          
          <HeroText />

          <p className="text-base text-[var(--text-muted)] font-medium max-w-lg leading-relaxed">
            Discover scheme recommendations backed by direct rules and custom match scores. 
            No sign-ups, no tracking. Only actionable criteria comparisons.
          </p>

          <div className="pt-2 flex flex-wrap gap-4">
              <button
                onClick={() => {
                  unlockSharedAudioContext();
                  prefetchGreetingAudio();
                  navigate('/agent', { state: { autoGreet: true } });
                }}
                onMouseEnter={handleMouse}
                onMouseLeave={handleMouse}
                className="
                  group relative overflow-hidden
                  bg-[var(--text)] text-[var(--bg)]
                  px-8 py-3.5 rounded-xl
                  font-bold font-mono tracking-wider
                  transition-all duration-300
                  hover:-translate-y-1
                "
              >
                <span
                  className="
                    absolute
                    w-0 h-0
                    rounded-full
                    bg-[var(--gold)]
                    left-[var(--x)]
                    top-[var(--y)]
                    -translate-x-1/2
                    -translate-y-1/2
                    transition-all
                    duration-500
                    ease-out
                    group-hover:w-[500px]
                    group-hover:h-[500px]
                  "
                />

                <span className="relative z-10 transition-colors duration-300 group-hover:text-[var(--bg-dark)]">
                  Find Schemes →
                </span>
              </button>
            <button
              onClick={() => handleScroll(infoRef)}
              className="border border-black/10 bg-[var(--surface)] text-[var(--text)] px-6 py-3 rounded-xl font-bold font-mono text-sm tracking-wide hover:bg-black/5 transition duration-200"
            >
              How it works
            </button>
          </div>
        </div>

        <div>
          <HeroShowcase
            onStartVoice={() => {
              unlockSharedAudioContext();
              prefetchGreetingAudio();
              navigate('/agent', { state: { autoGreet: true } });
            }}
            onExploreTopic={(query) => {
              navigate('/schemes', { state: { initialQuery: query } });
            }}
            onBrowseAll={() => navigate('/schemes')}
          />
        </div>
      </section>

      {/* 3. FILE 01: HOW IT WORKS BAND */}
      <section ref={infoRef} className="bg-[var(--bg-dark)] text-[var(--text-on-dark)] border-t border-b border-black/10 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center space-x-3 border-b border-[var(--text-muted-on-dark)]/20 pb-4 mb-8">
            <span className="font-mono text-xs font-bold text-[var(--gold)] bg-white/10 border border-white/10 px-2.5 py-1.5 rounded">
              FILE 01
            </span>
            <h2 className="text-2xl font-bold font-display tracking-tight leading-none">
              How Compass Scores You
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <ScrollReveal delay={100}>
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl relative overflow-hidden transition-all hover:bg-white/10 duration-200 group h-full">
                <span className="absolute right-4 top-2 text-6xl font-extrabold text-white/5 font-mono select-none group-hover:scale-110 transition-transform">1</span>
                <div className="font-mono text-[var(--gold)] text-xs font-bold tracking-widest uppercase">STEP 01</div>
                <h3 className="font-bold text-lg mt-2 font-display">Dynamic Questionnaire</h3>
                <p className="text-xs text-[var(--text-muted-on-dark)] mt-2 leading-relaxed font-medium">
                  Answer an intuitive, step-by-step Q&A. Your profile is generated securely and sent to our backend engine without ever being stored in a database.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl relative overflow-hidden transition-all hover:bg-white/10 duration-200 group h-full">
                <span className="absolute right-4 top-2 text-6xl font-extrabold text-white/5 font-mono select-none group-hover:scale-110 transition-transform">2</span>
                <div className="font-mono text-[var(--gold)] text-xs font-bold tracking-widest uppercase">STEP 02</div>
                <h3 className="font-bold text-lg mt-2 font-display">Algorithmic Scoring</h3>
                <p className="text-xs text-[var(--text-muted-on-dark)] mt-2 leading-relaxed font-medium">
                  Our custom backend engine filters thousands of schemes by state, then calculates precise match percentages using weighted demographic and category logic.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={500}>
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl relative overflow-hidden transition-all hover:bg-white/10 duration-200 group h-full">
                <span className="absolute right-4 top-2 text-6xl font-extrabold text-white/5 font-mono select-none group-hover:scale-110 transition-transform">3</span>
                <div className="font-mono text-[var(--gold)] text-xs font-bold tracking-widest uppercase">STEP 03</div>
                <h3 className="font-bold text-lg mt-2 font-display">AI Gap Analysis</h3>
                <p className="text-xs text-[var(--text-muted-on-dark)] mt-2 leading-relaxed font-medium">
                  View exactly which criteria you passed or failed. Our integrated AI analyzes your failures and provides actionable advice on how to bridge eligibility gaps.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

    {/* 4. FILE 02: WHY NO LOGIN */}
      <section ref={privacyRef} className="py-16">
        <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center space-x-3 border-b border-black/5 pb-4 mb-6">
          <span className="font-mono text-xs font-bold text-black/50 bg-[var(--surface-2)] border border-black/10 px-2.5 py-1.5 rounded">
            FILE 02
          </span>
          <h2 className="text-2xl font-bold font-display tracking-tight text-[var(--text)] leading-none">
            Why There is No Login
          </h2>
        </div>
        
        <div className="bg-[var(--surface)] border border-black/10 rounded-2xl p-7 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
          <div className="max-w-2xl space-y-3">
            <h3 className="text-lg font-bold font-display">Uncompromised Privacy, Zero Friction</h3>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed font-medium">
              We skip accounts and logins entirely. Your details are never saved in databases, tracked, or profile-mined. 
              Search queries generate recommendations inside temporary backend payloads and persist only within your active browser window.
            </p>
          </div>
          <div className="font-mono text-xs text-[var(--gold)] bg-[var(--bg-dark)] px-4 py-2 rounded-xl font-bold select-none border border-[var(--gold)]/20 shadow-md flex items-center">
            <svg className="w-3.5 h-3.5 mr-2 opacity-80" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            SECURE CLIENT ROUTING
          </div>
        </div>
        </div>
      </section>

      

      
      {/* 7. FOOTER */}
      <footer className="bg-[var(--bg-dark)] text-[var(--text-on-dark)] border-t border-black/15 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between gap-8">
            <div className="space-y-3">
              <div className="text-lg font-bold font-display tracking-tight text-[var(--text-on-dark)]">Govt Compass</div>
              <p className="text-xs text-[var(--text-muted-on-dark)] max-w-sm leading-relaxed font-medium">
                Transparent, secure, and eligibility-driven portal matching Indian government schemes without tracking.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 md:gap-16">
              <div>
                <h4 className="text-xs font-mono text-[var(--gold)] uppercase font-bold tracking-widest mb-3">Links</h4>
                <ul className="space-y-2 text-xs text-[var(--text-muted-on-dark)] font-medium">
                  <li>
                    <button
                      onClick={() => {
                        unlockSharedAudioContext();
                        navigate('/agent', { state: { autoGreet: true } });
                      }}
                      className="hover:text-[var(--gold)] transition"
                    >
                      AI Scheme Agent
                    </button>
                  </li>
                  <li>
                    <button onClick={() => navigate('/questionnaire')} className="hover:text-[var(--gold)] transition">
                      Guided Questionnaire
                    </button>
                  </li>
                  <li>
                    <button onClick={() => handleScroll(infoRef)} className="hover:text-[var(--gold)] transition">
                      How it works
                    </button>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-mono text-[var(--gold)] uppercase font-bold tracking-widest mb-3">Project</h4>
                <ul className="space-y-2 text-xs text-[var(--text-muted-on-dark)] font-medium">
                  <li>
                    <a href="https://github.com/sunilkumarrana/Arceus-" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--gold)] transition">
                      GitHub Repo
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="pt-8 mt-8 border-t border-white/5 text-center md:text-left text-xs text-[var(--text-muted-on-dark)] font-medium">
            © {new Date().getFullYear()} Govt Compass. 
          </div>
        </div>
      </footer>
    </div>
  );
}