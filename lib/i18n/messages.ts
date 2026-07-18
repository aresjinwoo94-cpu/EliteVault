import type { Locale } from "./config";

/**
 * Translation dictionary.
 *
 * English is the source of truth and the fallback: `translator()` looks up a
 * dotted key in the active locale, then in English, then returns the key
 * itself. So a missing Spanish string degrades to English — never to a blank
 * or a crash. Add namespaces freely; only translate what you ship.
 */
type Dict = { [key: string]: string | Dict };

const en: Dict = {
  nav: {
    analyzer: "Analyzer",
    library: "Library",
    pricing: "Pricing",
    guides: "Guides",
    faq: "FAQ",
    about: "About",
    signIn: "Sign in",
    startFree: "Start free",
  },
  hero: {
    badge1: "AI CONVERSION AUDIT",
    badge2: "BUILT FOR ECOMMERCE FOUNDERS",
    line1: "Copy what's",
    line2: "actually",
    line3: "converting.",
    subPre: "EliteVault hunts down stores that are ",
    subHighlight: "already selling",
    subPost:
      ", breaks down exactly why they convert, and gives your store the same brutal audit a senior media buyer would — annotated screenshots, buyer-persona simulations and a 7-day Meta Ads scenario modeler.",
    ctaPrimary: "Audit my store free",
    ctaSecondary: "or see it in action first",
    trust: "No credit card · 1 free analysis · Cancel anytime.",
    stripeBadge: "Payments secured by Stripe",
    sslBadge: "256-bit SSL",
  },
  twoPaths: {
    pill1: "TWO WAYS TO WIN",
    pill2: "ANALYZER + LIBRARY",
    heading: "One product, two ways to grow.",
    subheading:
      "EliteVault stands on two pillars that feed each other: brutally audit your own store, or reverse-engineer the ones already converting. Most founders do both.",
    analyzeLabel: "Path 1 — Diagnose",
    analyzeTitle: "Analyze your store",
    analyzeBody:
      "Paste your URL and get a CRO score, an annotated screenshot, a buyer-persona reaction and a ranked punch-list of fixes — in about a minute.",
    analyzeCta: "Audit my store free",
    studyLabel: "Path 2 — Model",
    studyTitle: "Or study the ones already converting",
    studyBody:
      "Browse a live library of winning Shopify & DTC stores validated by real revenue signals. Filter by niche and find the winners structurally closest to yours.",
    studyCta: "Browse winning stores",
  },
  footer: {
    tagline:
      "EliteVault — AI-powered audit & winning-site library for ecommerce founders.",
    pricing: "Pricing",
    faq: "FAQ",
    freeAudit: "Free audit",
    persona: "Persona simulator",
    metaAds: "Meta Ads forecast",
    winners: "Winning stores",
    blog: "Blog",
    about: "About",
    support: "Support",
    api: "API",
    signIn: "Sign in",
    privacy: "Privacy",
    terms: "Terms",
    refunds: "Refunds",
  },
  pricing: {
    heading: "Free diagnosis. Pay for the cure.",
    subheading:
      "Audit your store free — score + annotated screenshot. Upgrade to Pro for the prioritized fixes and unlimited audits, Scale for the 7-day campaign modeler and volume.",
    ladderDiagnose: "Diagnose",
    ladderCure: "Cure",
    ladderVolume: "Volume",
    monthly: "Monthly",
    yearly: "Yearly",
    save20: "Save 20%",
    priceFree: "Free",
    perMonth: "mo",
    perYear: "yr",
    billedYearly: "/mo billed yearly · save",
    ctaFree: "Get started",
    ctaStart: "Start",
    stripeNote: "Secure checkout powered by Stripe · Cancel anytime · No hidden fees",
  },
  faq: {
    heading: "Questions, answered.",
  },
  features: {
    pill1: "THE ENGINE",
    pill2: "NOT A CHECKLIST",
    heading: "More than a checklist tool.",
    subheading:
      "EliteVault is the kind of leverage that used to belong to agencies and growth consultants. Now it lives in your dashboard.",
    feature1Title: "A live portfolio of winners",
    feature1Body:
      "An AI agent watches paid-social cohorts and surfaces stores actually generating revenue right now — not a stale Pinterest board.",
    feature2Title: "Image-similarity search",
    feature2Body:
      "Drop a screenshot of your own store. We find the closest converting siblings by visual structure — not by tags.",
    feature3Title: "Niche-aware judgment",
    feature3Body:
      "What works for skincare destroys conversion in supplements. The agent knows the difference.",
    feature4Title: "Campaign Scenario Modeler (Scale)",
    feature4Body:
      "Project a 7-day Meta Ads campaign across 3 honest scenarios — conservative, balanced, aggressive — calibrated to your audit, AOV and budget. Estimates, not guarantees.",
  },
  logoStrip: {
    caption: "Brands modeled in the vault",
  },
  social: {
    heading: "The same lens the best stores already pass",
    subheading:
      "Here's how EliteVault grades a few recognizable winners. Illustrative examples — your own audit runs live on your URL.",
    takeawayGymshark: "Ruthless hierarchy, instant offer clarity, heavy social proof.",
    takeawayAllbirds: "Calm palette, strong sustainability story, fast above-the-fold.",
    takeawayMvmt: "Bold imagery and urgency, but trust badges sit below the fold.",
    disclaimer:
      "Illustrative example audits — demonstrative scores, not an endorsement or a real-time result.",
    founderNote:
      "I built EliteVault because I was tired of guessing why a store wasn't converting and paying $2k for a consultant to tell me what an honest audit could in 60 seconds. So I made the diagnosis free — run it on your own store, see the exact score and the annotated screenshot, and only pay if you want the prioritized cure. No fake numbers, no dark patterns, cancel in two clicks.",
    badgeNoCard: "No credit card for your free audit",
    badgeStripe: "Payments secured by Stripe",
    badgeCancel: "Cancel anytime · no lock-in",
    badgeEstimates: "Estimates, not predictions",
  },
  analyzerDemo: {
    heading: "A senior media buyer in a tab.",
    subheadingPre:
      "Paste a URL. In under a minute, EliteVault returns the kind of audit you'd otherwise pay",
    subheadingPrice: "$1,500 for",
    subheadingPost:
      "— annotated screenshot, conversion-rate scenarios, persona reactions, and a brutal punch-list of fixes ranked by leverage. Watch a full run on the right.",
    stepReadsTitle: "Reads your store like a human",
    stepReadsBody:
      "AI vision parses your hero, product grid, copy, color system, and motion — exactly what a senior CRO consultant would clock in the first 5 seconds.",
    stepScoresTitle: "Scores you against the rubric",
    stepScoresBody:
      "Six categories — color, layout, imagery, technical, niche fit, CRO principles — calibrated against the brands actually scaling on paid social.",
    stepPersonaTitle: "Simulates your buyer persona",
    stepPersonaBody:
      "Pick a persona (or define one) and watch them react to your store in their own voice. 'I'd bounce' beats any heatmap.",
    stepCampaignTitle: "Projects a 7-day campaign before you spend",
    stepCampaignBody:
      "Scale-plan add-on: feed in your AOV + daily budget and the modeler returns 3 honest 7-day scenarios — conservative, balanced, aggressive — with day-by-day spend, ROAS and risks.",
    videoAria:
      "EliteVault analyzer demo: paste a URL and get a score, an annotated screenshot, and ranked fixes",
    videoPlay: "Play the analyzer demo",
  },
  auth: {
    headingSignIn: "Welcome back",
    headingSignUp: "Create your vault",
    subtitleMagic: "Sign in with a one-tap email link",
    subtitlePassword: "Sign in with your password",
    toggleToPasswordPrefix: "Prefer a password?",
    toggleToPasswordLink: "Use email + password",
    toggleToMagicLink: "Back to one-tap email link",
    noAccountPrompt: "Don't have an account?",
    signUpLink: "Sign up",
    haveAccountPrompt: "Already have an account?",
    signInLink: "Sign in",
    checkEmailTitle: "Check your email",
    checkEmailBody:
      "We sent you a one-tap sign-in link. It can take a few seconds to arrive — if your inbox looks empty, give it a moment and refresh.",
    checkEmailHelper: "Didn't get it? Check spam, or wait 60 seconds and try again.",
    openInbox: "Open",
    emailLabel: "Email",
    emailPlaceholder: "you@yourstore.com",
    sendMagicLink: "Email me a sign-in link",
    sendingLink: "Sending link…",
    magicHelper: "No password to remember. Same link works for sign-up and sign-in.",
    passwordLabel: "Password",
    passwordPlaceholderSignUp: "At least 8 characters",
    passwordPlaceholderSignIn: "Your password",
    createAccount: "Create account",
    creatingAccount: "Creating account…",
    signIn: "Sign in",
    signingIn: "Signing in…",
  },
  sidebar: {
    navOverview: "Overview",
    navAnalyzer: "Analyzer",
    navTrends: "Trends",
    navLibrary: "Library",
    navCommunity: "Community",
    navApiKeys: "API keys",
    navBilling: "Billing",
    navSettings: "Settings",
    planLabel: "Plan",
    creditsLeft: "credits left",
    upgradeCta: "Upgrade to Pro",
  },
  topbar: {
    quickSearch: "Quick search",
    settings: "Settings",
    billing: "Billing",
    helpSupport: "Help & support",
    signOut: "Sign out",
  },
  winnersPage: {
    badge1: "WINNING STORES LIBRARY",
    badge2: "REVENUE-VALIDATED, NOT A MOODBOARD",
    heroH1: "A live library of winning ecommerce stores",
    heroBody:
      "Browse Shopify and DTC stores that are actually generating revenue right now — filter by niche, see full metrics, and find the winners structurally closest to yours with image-similarity search. Then audit your own store free.",
    heroCta: "Browse winning stores",
    heroCaption: "9 winners free · no credit card",
    whatH2: "What's inside the library",
    whatSub:
      "Not a Pinterest board of pretty stores — winners validated by real revenue signals.",
    card1Label: "Stores actually selling",
    card1Body:
      "An AI agent surfaces stores generating revenue now from paid-social cohorts — not a stale 'top 10' list recycled since 2023.",
    card2Label: "Filter by your niche",
    card2Body:
      "What converts in skincare destroys conversion in supplements. Filter to the winners that match your category.",
    card3Label: "Image-similarity search",
    card3Body:
      "Drop a screenshot of your store and find the closest converting siblings by visual structure — not by tags.",
    howH2: "How to use it",
    step1Title: "Find revenue-validated winners",
    step1Body:
      "Start from stores proven to convert cold traffic, filtered to your niche — your library of solved problems.",
    step2Title: "Study the full metrics",
    step2Body:
      "See how each winner is built — offer, hero, trust stack and more — with the numbers behind it.",
    step3Title: "Copy the principles, audit yours",
    step3Body:
      "Extract what works, then run a free audit of your own store to see where you stand against them.",
    valueH2: "Don't copy the paint — copy the blueprint",
    valueBody:
      "Reverse-engineering winners isn't theft. You extract principles — hierarchy, offer structure, trust placement — that transfer to your store. The library just makes finding the right winners fast.",
    valueLink: "How to reverse-engineer any winning store",
    finalH2: "Find your winning stores",
    finalBody:
      "Browse 9 hand-picked winners free, then unlock the full library and image-similarity search on Pro.",
    finalCta: "Start free",
  },
  reviews: {
    heading: "What founders say",
    subheading: "Real words from people who put their store through EliteVault.",
    outOf5: "out of 5",
    reviewsCount: "reviews",
    writeHeading: "Leave a review",
    writeSubheading: "Used EliteVault? Tell other founders what it showed you.",
    name: "Your name",
    namePlaceholder: "Jane from Acme",
    email: "Email (optional, private)",
    emailPlaceholder: "you@yourstore.com",
    title: "Headline (optional)",
    titlePlaceholder: "Found 3 fixes in 60 seconds",
    body: "Your review",
    bodyPlaceholder: "What did EliteVault help you see about your store?",
    rating: "Your rating",
    submit: "Submit review",
    submitting: "Sending…",
    successPending: "Thanks! Your review will appear once it's approved.",
    successLive: "Thanks — your review is now live.",
    error: "Something went wrong. Please try again.",
  },
  lang: {
    label: "Language",
    en: "English",
    es: "Español",
  },
  freeAudit: {
    badge1: "FREE WEBSITE AUDIT",
    badge2: "NO CREDIT CARD",
    heroH1: "Free website audit — your store's conversion score in 60 seconds",
    heroBody:
      "EliteVault is an AI website analyzer built for ecommerce. Paste your URL and get an honest conversion score, an annotated screenshot of exactly what's costing you sales, and a punch-list of fixes ranked by impact — free, no card, in under a minute.",
    heroCta: "Audit my store free",
    heroCaption: "1 free analysis · cancel anytime",
    checksH2: "What the website analyzer checks",
    checksSub:
      "Six categories, scored the way a buyer — and a senior media buyer — actually experience your store.",
    check1Label: "First impression",
    check1Body: "Is the offer clear in 2 seconds? The exact read a cold visitor gets.",
    check2Label: "Layout & hierarchy",
    check2Body: "Above-the-fold, CTA placement, visual flow and proportion.",
    check3Label: "Trust & proof",
    check3Body: "Reviews, badges and guarantees — and whether they're where buyers look.",
    check4Label: "Imagery & niche fit",
    check4Body: "Whether your visuals match what converts in your category.",
    check5Label: "CRO principles",
    check5Body: "Friction, objection handling and the levers that move conversion.",
    check6Label: "Technical signals",
    check6Body: "Speed and on-page issues that quietly leak paid and organic traffic.",
    stepsH2: "How the free audit works",
    step1Title: "Paste your URL",
    step1Body: "No install, no code on your site. The analyzer captures your page automatically.",
    step2Title: "AI reviews it cold",
    step2Body: "A vision model reads your store like a first-time visitor and scores six categories.",
    step3Title: "Get your score + fixes",
    step3Body: "An annotated screenshot and a punch-list ranked by leverage — in under a minute.",
    valueH2: "A real diagnosis, not a vanity number",
    valueBody:
      "Most “free website audit” tools spit out a generic score. EliteVault gives you an overall conversion score, the six category breakdowns, an annotated screenshot marking each issue, a buyer-persona reaction, and the fixes ranked by impact — the same diagnosis consultants charge $2,000 for.",
    valueLink: "Why the $2,000 audit is dead",
    finalH2: "Audit your store free",
    finalBody:
      "Your conversion score, an annotated screenshot, and a ranked punch-list — in under a minute. No credit card.",
    finalCta: "Run my free website audit",
  },
  personaPage: {
    badge1: "AI BUYER PERSONA SIMULATOR",
    badge2: "REACTS LIKE A REAL SHOPPER",
    heroH1: "See your store through your buyer's eyes — before they bounce",
    heroBody:
      "EliteVault's AI buyer-persona simulator lands on your store as your target customer and reacts in their own voice — what grabs them, what confuses them, and the exact moment they'd leave. Stop guessing how shoppers feel about your page and watch one react.",
    heroCta: "Simulate a buyer on my store",
    heroCaption: "free to start · no credit card",
    stepsH2: "How the buyer-persona simulation works",
    stepsSub:
      "Three steps from “I think my store is fine” to “oh, that's where I'm losing them.”",
    step1Label: "Choose your buyer",
    step1Body:
      "Pick a persona — age, gender, country and interests — or describe a custom one in a sentence. The exact customer your ads are sending.",
    step2Label: "AI reads your store as them",
    step2Body:
      "A vision model lands on your page with that persona's priorities, patience and skepticism — and reacts the way a first-time visitor actually would.",
    step3Label: "Hear them think out loud",
    step3Body:
      "You get their reaction in their own voice — what grabs them, what confuses them, and the moment they'd reach for the back button.",
    valueH2: "A reaction, not a report",
    valueBodyPre: "Analytics tell you",
    valueBodyEm1: "that",
    valueBodyMid: "people left. A buyer persona tells you",
    valueBodyEm2: "why",
    valueBodyPost:
      ". Pair the simulation with your annotated conversion score and you stop optimizing in the dark.",
    valueLink: "Why your store isn't converting",
    quoteText:
      "“I'd bounce — the offer isn't obvious in the first 2 seconds, and I don't see a single review.”",
    quoteAttribution: "— buyer persona · F 28-34 · US",
    whyH2: "Why founders run a persona before scaling ads",
    why1Label: "Find the bounce moment",
    why1Body:
      "\"I'd bounce — the offer isn't obvious in the first 2 seconds\" tells you more than any heatmap. You learn exactly where desire dies.",
    why2Label: "Test multiple personas",
    why2Body:
      "Your store reads differently to a 24-year-old on TikTok than to a 38-year-old parent. Simulate each and see which one your page is built for.",
    why3Label: "Objective, every time",
    why3Body:
      "You've seen your store 300 times — you can't react like a stranger anymore. To the model, every visit is the first.",
    finalH2: "Watch a buyer react to your store",
    finalBody:
      "Start with a free audit — score and annotated screenshot — then unlock the full buyer-persona simulation on Pro.",
    finalCta: "Start free",
  },
  metaAdsPage: {
    badge1: "META ADS FORECAST",
    badge2: "BEFORE YOU SPEND A DOLLAR",
    heroH1: "Forecast your Meta Ads campaign before you fund it",
    heroBody:
      "EliteVault projects a 7-day Meta campaign across three scenarios — conservative, balanced and aggressive — using your budget, average order value and current niche benchmarks. See the likely spend, CPC, ROAS and revenue range before you commit, so you know whether the math even works.",
    heroCta: "Model my campaign",
    heroCaption: "estimate, not prediction",
    scenariosH2: "Three scenarios, modeled side by side",
    scenariosSub:
      "One projection hides the risk. The modeler shows the floor, the realistic middle and the upside together.",
    scenario1Label: "Conservative",
    scenario1Body:
      "The cautious case — softer CTR and ROAS. The floor you should be able to live with if the creative underperforms.",
    scenario2Label: "Balanced",
    scenario2Body:
      "The realistic mid-case built from current niche benchmarks for your AOV and budget. Your planning number.",
    scenario3Label: "Aggressive",
    scenario3Body:
      "The upside if the angle hits — stronger CTR and efficiency. What &ldquo;working&rdquo; could look like.",
    inputsH2: "What the forecast is built from",
    input1Label: "Your budget & AOV",
    input1Body:
      "Daily spend and average order value anchor the math to your store, not a generic template.",
    input2Label: "Real niche benchmarks",
    input2Body:
      "CPC, CPM, CTR and ROAS ranges drawn from current ecommerce benchmarks for your category.",
    input3Label: "Three parallel scenarios",
    input3Body:
      "Conservative, balanced and aggressive — modeled together so you see the full range before funding.",
    honestyH2: "A planning tool, not a crystal ball",
    honestyBody1Pre: "We keep this honest: the forecast is an",
    honestyBody1Em: "estimate",
    honestyBody1Post:
      "based on real benchmarks and your numbers — not a prediction of what will happen. The biggest variable isn't the model, it's your store. A great forecast on a page that doesn't convert cold traffic is just an expensive lesson waiting to happen.",
    honestyBody2:
      "So forecast the campaign — then make sure the destination can take the traffic.",
    honestyLink: "Why your Meta ads aren't converting",
    finalH2: "Know the math before you spend",
    finalBody:
      "Start free with a store audit. The 7-day Meta Ads Campaign Scenario Modeler lives on the Scale plan.",
    finalCta: "Start free",
  },
};

const es: Dict = {
  nav: {
    analyzer: "Analizador",
    library: "Librería",
    pricing: "Precios",
    guides: "Guías",
    faq: "FAQ",
    about: "Nosotros",
    signIn: "Iniciar sesión",
    startFree: "Empezar gratis",
  },
  hero: {
    badge1: "AUDITORÍA DE CONVERSIÓN CON IA",
    badge2: "HECHO PARA FUNDADORES DE ECOMMERCE",
    line1: "Copia lo que",
    line2: "de verdad",
    line3: "convierte.",
    subPre: "EliteVault rastrea tiendas que ",
    subHighlight: "ya están vendiendo",
    subPost:
      ", desglosa exactamente por qué convierten y le da a tu tienda la misma auditoría brutal que haría un media buyer senior — capturas anotadas, simulaciones de buyer-persona y un modelador de campañas de Meta Ads a 7 días.",
    ctaPrimary: "Audita mi tienda gratis",
    ctaSecondary: "o míralo en acción primero",
    trust: "Sin tarjeta · 1 análisis gratis · Cancela cuando quieras.",
    stripeBadge: "Pagos protegidos con Stripe",
    sslBadge: "SSL de 256 bits",
  },
  twoPaths: {
    pill1: "DOS FORMAS DE GANAR",
    pill2: "ANALYZER + BIBLIOTECA",
    heading: "Un producto, dos formas de crecer.",
    subheading:
      "EliteVault se apoya en dos pilares que se retroalimentan: audita tu propia tienda sin filtros, o haz ingeniería inversa de las que ya están convirtiendo. La mayoría hace ambas.",
    analyzeLabel: "Camino 1 — Diagnostica",
    analyzeTitle: "Analiza tu tienda",
    analyzeBody:
      "Pega tu URL y obtén un score de conversión, un screenshot anotado, la reacción de un buyer persona y una lista priorizada de mejoras — en cerca de un minuto.",
    analyzeCta: "Audita mi tienda gratis",
    studyLabel: "Camino 2 — Modela",
    studyTitle: "O estudia las que ya están convirtiendo",
    studyBody:
      "Explora una biblioteca viva de tiendas Shopify y DTC ganadoras validadas por señales reales de ingresos. Filtra por nicho y encuentra las más parecidas a la tuya.",
    studyCta: "Ver tiendas ganadoras",
  },
  footer: {
    tagline:
      "EliteVault — auditoría con IA y librería de tiendas ganadoras para fundadores de ecommerce.",
    pricing: "Precios",
    faq: "FAQ",
    freeAudit: "Auditoría gratis",
    persona: "Simulador de persona",
    metaAds: "Forecast de Meta Ads",
    winners: "Tiendas ganadoras",
    blog: "Blog",
    about: "Nosotros",
    support: "Soporte",
    api: "API",
    signIn: "Iniciar sesión",
    privacy: "Privacidad",
    terms: "Términos",
    refunds: "Reembolsos",
  },
  pricing: {
    heading: "Diagnóstico gratis. Paga por la cura.",
    subheading:
      "Audita tu tienda gratis — puntuación + captura anotada. Pasa a Pro para los arreglos priorizados y auditorías ilimitadas, o a Scale para el modelador de campañas de 7 días y volumen.",
    ladderDiagnose: "Diagnostica",
    ladderCure: "Cura",
    ladderVolume: "Volumen",
    monthly: "Mensual",
    yearly: "Anual",
    save20: "Ahorra 20%",
    priceFree: "Gratis",
    perMonth: "mes",
    perYear: "año",
    billedYearly: "/mes facturado anual · ahorra",
    ctaFree: "Empezar gratis",
    ctaStart: "Empieza con",
    stripeNote: "Pago seguro con Stripe · Cancela cuando quieras · Sin cargos ocultos",
  },
  faq: {
    heading: "Preguntas, resueltas.",
  },
  features: {
    pill1: "EL MOTOR",
    pill2: "NO UN CHECKLIST",
    heading: "Mucho más que una herramienta de checklist.",
    subheading:
      "EliteVault es el tipo de ventaja que antes solo tenían las agencias y los consultores de growth. Ahora vive en tu dashboard.",
    feature1Title: "Un portafolio de ganadores en vivo",
    feature1Body:
      "Un agente de IA vigila los cohortes de paid social y te muestra tiendas que de verdad están generando ingresos ahora mismo — no un tablero de Pinterest desactualizado.",
    feature2Title: "Búsqueda por similitud de imagen",
    feature2Body:
      "Sube una captura de tu propia tienda. Encontramos las tiendas que más convierten parecidas a la tuya por estructura visual — no por etiquetas.",
    feature3Title: "Criterio según tu nicho",
    feature3Body:
      "Lo que funciona en skincare destruye la conversión en suplementos. El agente sabe la diferencia.",
    feature4Title: "Modelador de Escenarios de Campaña (Scale)",
    feature4Body:
      "Proyecta una campaña de Meta Ads de 7 días en 3 escenarios honestos — conservador, equilibrado, agresivo — calibrados a tu auditoría, tu AOV y tu presupuesto. Estimaciones, no garantías.",
  },
  logoStrip: {
    caption: "Marcas modeladas en el vault",
  },
  social: {
    heading: "La misma mirada que las mejores tiendas ya superan",
    subheading:
      "Así califica EliteVault a algunos ganadores que reconocerás. Son ejemplos ilustrativos — tu propia auditoría corre en vivo sobre tu URL.",
    takeawayGymshark: "Jerarquía implacable, oferta clara al instante y mucha prueba social.",
    takeawayAllbirds: "Paleta serena, historia de sostenibilidad sólida y carga rápida en lo primero que se ve.",
    takeawayMvmt: "Imágenes potentes y urgencia, pero los sellos de confianza quedan más abajo.",
    disclaimer:
      "Auditorías de ejemplo ilustrativas — puntajes demostrativos, no un respaldo ni un resultado en tiempo real.",
    founderNote:
      "Creé EliteVault porque estaba cansado de adivinar por qué una tienda no convertía y de pagar $2k a un consultor para que me dijera lo que una auditoría honesta resolvía en 60 segundos. Así que hice el diagnóstico gratis: córrelo en tu propia tienda, mira el puntaje exacto y la captura anotada, y paga solo si quieres la solución priorizada. Sin números falsos, sin trucos sucios, cancela en dos clics.",
    badgeNoCard: "Sin tarjeta para tu auditoría gratis",
    badgeStripe: "Pagos protegidos por Stripe",
    badgeCancel: "Cancela cuando quieras · sin ataduras",
    badgeEstimates: "Estimaciones, no predicciones",
  },
  analyzerDemo: {
    heading: "Un media buyer senior en una pestaña.",
    subheadingPre:
      "Pega una URL. En menos de un minuto, EliteVault te devuelve el tipo de auditoría por la que de otro modo pagarías",
    subheadingPrice: "$1,500",
    subheadingPost:
      "— captura anotada, escenarios de tasa de conversión, reacciones de personas y una lista brutal de arreglos ordenados por impacto. Mira una corrida completa a la derecha.",
    stepReadsTitle: "Lee tu tienda como un humano",
    stepReadsBody:
      "La visión por IA analiza tu hero, la grilla de productos, los textos, el sistema de color y el movimiento — justo lo que un consultor CRO senior detectaría en los primeros 5 segundos.",
    stepScoresTitle: "Te puntúa contra la rúbrica",
    stepScoresBody:
      "Seis categorías — color, layout, imágenes, técnica, encaje con el nicho y principios de CRO — calibradas contra las marcas que de verdad escalan en paid social.",
    stepPersonaTitle: "Simula a tu buyer persona",
    stepPersonaBody:
      "Elige una persona (o define una) y mira cómo reacciona a tu tienda con su propia voz. Un 'me iría' vale más que cualquier mapa de calor.",
    stepCampaignTitle: "Proyecta una campaña de 7 días antes de que gastes",
    stepCampaignBody:
      "Complemento de plan de escala: ingresa tu AOV + presupuesto diario y el modelador devuelve 3 escenarios honestos de 7 días — conservador, equilibrado, agresivo — con gasto día a día, ROAS y riesgos.",
    videoAria:
      "Demostración del analizador de EliteVault: pega una URL y obtén score, captura anotada y arreglos priorizados",
    videoPlay: "Reproducir la demo del analizador",
  },
  auth: {
    headingSignIn: "Bienvenido de nuevo",
    headingSignUp: "Crea tu bóveda",
    subtitleMagic: "Inicia sesión con un enlace por correo de un toque",
    subtitlePassword: "Inicia sesión con tu contraseña",
    toggleToPasswordPrefix: "¿Prefieres una contraseña?",
    toggleToPasswordLink: "Usa correo + contraseña",
    toggleToMagicLink: "Volver al enlace por correo de un toque",
    noAccountPrompt: "¿No tienes una cuenta?",
    signUpLink: "Regístrate",
    haveAccountPrompt: "¿Ya tienes una cuenta?",
    signInLink: "Inicia sesión",
    checkEmailTitle: "Revisa tu correo",
    checkEmailBody:
      "Te enviamos un enlace de inicio de sesión de un toque. Puede tardar unos segundos en llegar; si tu bandeja parece vacía, espera un momento y actualiza.",
    checkEmailHelper: "¿No te llegó? Revisa el spam, o espera 60 segundos e inténtalo de nuevo.",
    openInbox: "Abrir",
    emailLabel: "Correo",
    emailPlaceholder: "tu@tutienda.com",
    sendMagicLink: "Envíame un enlace de inicio de sesión",
    sendingLink: "Enviando enlace…",
    magicHelper: "Sin contraseñas que recordar. El mismo enlace sirve para registrarte e iniciar sesión.",
    passwordLabel: "Contraseña",
    passwordPlaceholderSignUp: "Al menos 8 caracteres",
    passwordPlaceholderSignIn: "Tu contraseña",
    createAccount: "Crear cuenta",
    creatingAccount: "Creando cuenta…",
    signIn: "Iniciar sesión",
    signingIn: "Iniciando sesión…",
  },
  sidebar: {
    navOverview: "Resumen",
    navAnalyzer: "Analizador",
    navTrends: "Tendencias",
    navLibrary: "Biblioteca",
    navCommunity: "Comunidad",
    navApiKeys: "Claves API",
    navBilling: "Facturación",
    navSettings: "Configuración",
    planLabel: "Plan",
    creditsLeft: "créditos restantes",
    upgradeCta: "Mejora a Pro",
  },
  topbar: {
    quickSearch: "Búsqueda rápida",
    settings: "Configuración",
    billing: "Facturación",
    helpSupport: "Ayuda y soporte",
    signOut: "Cerrar sesión",
  },
  winnersPage: {
    badge1: "LIBRERÍA DE TIENDAS GANADORAS",
    badge2: "VALIDADAS POR INGRESOS, NO UN MOODBOARD",
    heroH1: "Una librería en vivo de tiendas ecommerce ganadoras",
    heroBody:
      "Explora tiendas de Shopify y DTC que de verdad están generando ingresos ahora mismo — filtra por nicho, mira métricas completas y encuentra las ganadoras más parecidas a la tuya con búsqueda por similitud de imagen. Luego audita tu propia tienda gratis.",
    heroCta: "Explorar tiendas ganadoras",
    heroCaption: "9 ganadoras gratis · sin tarjeta",
    whatH2: "Qué hay dentro de la librería",
    whatSub:
      "No un tablero de Pinterest de tiendas bonitas — ganadoras validadas por señales reales de ingresos.",
    card1Label: "Tiendas que de verdad venden",
    card1Body:
      "Un agente de IA muestra tiendas que generan ingresos ahora a partir de cohortes de paid social — no una lista 'top 10' reciclada desde 2023.",
    card2Label: "Filtra por tu nicho",
    card2Body:
      "Lo que convierte en skincare destruye la conversión en suplementos. Filtra a las ganadoras que encajan con tu categoría.",
    card3Label: "Búsqueda por similitud de imagen",
    card3Body:
      "Sube una captura de tu tienda y encuentra las ganadoras más parecidas por estructura visual — no por etiquetas.",
    howH2: "Cómo usarla",
    step1Title: "Encuentra ganadoras validadas por ingresos",
    step1Body:
      "Parte de tiendas que ya convierten tráfico frío, filtradas a tu nicho — tu librería de problemas resueltos.",
    step2Title: "Estudia las métricas completas",
    step2Body:
      "Mira cómo está construida cada ganadora — oferta, hero, stack de confianza y más — con los números detrás.",
    step3Title: "Copia los principios, audita la tuya",
    step3Body:
      "Extrae lo que funciona y luego corre una auditoría gratis de tu tienda para ver dónde estás frente a ellas.",
    valueH2: "No copies la pintura — copia el plano",
    valueBody:
      "Hacer ingeniería inversa de las ganadoras no es robar. Extraes principios — jerarquía, estructura de oferta, ubicación de la confianza — que se transfieren a tu tienda. La librería solo hace que encontrar las ganadoras correctas sea rápido.",
    valueLink: "Cómo hacer ingeniería inversa de cualquier tienda ganadora",
    finalH2: "Encuentra tus tiendas ganadoras",
    finalBody:
      "Explora 9 ganadoras seleccionadas gratis, y desbloquea la librería completa y la búsqueda por imagen en Pro.",
    finalCta: "Empezar gratis",
  },
  reviews: {
    heading: "Lo que dicen los fundadores",
    subheading: "Palabras reales de quienes pasaron su tienda por EliteVault.",
    outOf5: "de 5",
    reviewsCount: "reseñas",
    writeHeading: "Deja una reseña",
    writeSubheading: "¿Usaste EliteVault? Cuéntale a otros fundadores qué te mostró.",
    name: "Tu nombre",
    namePlaceholder: "Ana de Acme",
    email: "Email (opcional, privado)",
    emailPlaceholder: "tu@tutienda.com",
    title: "Título (opcional)",
    titlePlaceholder: "Encontré 3 arreglos en 60 segundos",
    body: "Tu reseña",
    bodyPlaceholder: "¿Qué te ayudó a ver EliteVault sobre tu tienda?",
    rating: "Tu puntuación",
    submit: "Enviar reseña",
    submitting: "Enviando…",
    successPending: "¡Gracias! Tu reseña aparecerá una vez aprobada.",
    successLive: "¡Gracias! Tu reseña ya está publicada.",
    error: "Algo salió mal. Inténtalo de nuevo.",
  },
  lang: {
    label: "Idioma",
    en: "English",
    es: "Español",
  },
  freeAudit: {
    badge1: "AUDITORÍA WEB GRATIS",
    badge2: "SIN TARJETA",
    heroH1: "Auditoría web gratis — el score de conversión de tu tienda en 60 segundos",
    heroBody:
      "EliteVault es un analizador web con IA hecho para ecommerce. Pega tu URL y recibe un score de conversión honesto, una captura anotada de exactamente qué te está costando ventas y una lista de arreglos ordenados por impacto — gratis, sin tarjeta, en menos de un minuto.",
    heroCta: "Audita mi tienda gratis",
    heroCaption: "1 análisis gratis · cancela cuando quieras",
    checksH2: "Qué revisa el analizador web",
    checksSub:
      "Seis categorías, evaluadas como las vive de verdad un comprador — y un media buyer senior — en tu tienda.",
    check1Label: "Primera impresión",
    check1Body: "¿Se entiende la oferta en 2 segundos? La lectura exacta que hace un visitante frío.",
    check2Label: "Layout y jerarquía",
    check2Body: "Lo que se ve sin hacer scroll, dónde va el CTA, el flujo visual y las proporciones.",
    check3Label: "Confianza y prueba",
    check3Body: "Reseñas, sellos y garantías — y si están donde el comprador realmente mira.",
    check4Label: "Imágenes y encaje con el nicho",
    check4Body: "Si tus visuales coinciden con lo que convierte en tu categoría.",
    check5Label: "Principios de CRO",
    check5Body: "Fricción, manejo de objeciones y las palancas que mueven la conversión.",
    check6Label: "Señales técnicas",
    check6Body: "Velocidad y problemas en página que fugan tráfico pagado y orgánico sin que te enteres.",
    stepsH2: "Cómo funciona la auditoría gratis",
    step1Title: "Pega tu URL",
    step1Body: "Sin instalar nada, sin código en tu sitio. El analizador captura tu página automáticamente.",
    step2Title: "La IA la revisa en frío",
    step2Body: "Un modelo de visión lee tu tienda como un visitante que llega por primera vez y puntúa seis categorías.",
    step3Title: "Recibe tu score + arreglos",
    step3Body: "Una captura anotada y una lista de arreglos ordenada por impacto — en menos de un minuto.",
    valueH2: "Un diagnóstico real, no un número de vanidad",
    valueBody:
      "La mayoría de las herramientas de “auditoría web gratis” escupen un score genérico. EliteVault te da un score de conversión general, el desglose de las seis categorías, una captura anotada que marca cada problema, una reacción de buyer-persona y los arreglos ordenados por impacto — el mismo diagnóstico que un consultor te cobraría a $2,000.",
    valueLink: "Por qué la auditoría de $2,000 está muerta",
    finalH2: "Audita tu tienda gratis",
    finalBody:
      "Tu score de conversión, una captura anotada y una lista de arreglos priorizada — en menos de un minuto. Sin tarjeta.",
    finalCta: "Correr mi auditoría web gratis",
  },
  personaPage: {
    badge1: "SIMULADOR DE BUYER PERSONA CON IA",
    badge2: "REACCIONA COMO UN COMPRADOR REAL",
    heroH1: "Ve tu tienda con los ojos de tu comprador — antes de que se vaya",
    heroBody:
      "El simulador de buyer-persona con IA de EliteVault entra a tu tienda como tu cliente objetivo y reacciona con su propia voz — qué le engancha, qué le confunde y el momento exacto en que se iría. Deja de adivinar cómo se sienten los compradores con tu página y mira a uno reaccionar.",
    heroCta: "Simular un comprador en mi tienda",
    heroCaption: "gratis para empezar · sin tarjeta",
    stepsH2: "Cómo funciona la simulación de buyer-persona",
    stepsSub:
      "Tres pasos para pasar de “creo que mi tienda está bien” a “ah, ahí es donde los pierdo.”",
    step1Label: "Elige a tu comprador",
    step1Body:
      "Elige una persona — edad, género, país e intereses — o describe una a medida en una frase. El cliente exacto al que tus ads le mandan tráfico.",
    step2Label: "La IA lee tu tienda como él",
    step2Body:
      "Un modelo de visión entra a tu página con las prioridades, la paciencia y el escepticismo de esa persona — y reacciona como lo haría de verdad un visitante que llega por primera vez.",
    step3Label: "Escúchalo pensar en voz alta",
    step3Body:
      "Recibes su reacción con su propia voz — qué le engancha, qué le confunde y el momento en que iría a darle al botón de atrás.",
    valueH2: "Una reacción, no un reporte",
    valueBodyPre: "La analítica te dice",
    valueBodyEm1: "que",
    valueBodyMid: "la gente se fue. Una buyer-persona te dice",
    valueBodyEm2: "por qué",
    valueBodyPost:
      ". Combina la simulación con tu score de conversión anotado y dejas de optimizar a ciegas.",
    valueLink: "Por qué tu tienda no convierte",
    quoteText:
      "“Me iría — la oferta no se entiende en los primeros 2 segundos, y no veo ni una sola reseña.”",
    quoteAttribution: "— buyer persona · F 28-34 · US",
    whyH2: "Por qué los fundadores corren una persona antes de escalar ads",
    why1Label: "Encuentra el momento del rebote",
    why1Body:
      "\"Me iría — la oferta no se entiende en los primeros 2 segundos\" te dice más que cualquier mapa de calor. Aprendes exactamente dónde muere el deseo.",
    why2Label: "Prueba varias personas",
    why2Body:
      "Tu tienda se lee distinto para alguien de 24 en TikTok que para un padre de 38. Simula cada uno y ve para cuál está construida tu página.",
    why3Label: "Objetivo, siempre",
    why3Body:
      "Has visto tu tienda 300 veces — ya no puedes reaccionar como un desconocido. Para el modelo, cada visita es la primera.",
    finalH2: "Mira a un comprador reaccionar a tu tienda",
    finalBody:
      "Empieza con una auditoría gratis — score y captura anotada — y luego desbloquea la simulación completa de buyer-persona en Pro.",
    finalCta: "Empezar gratis",
  },
  metaAdsPage: {
    badge1: "FORECAST DE META ADS",
    badge2: "ANTES DE GASTAR UN DÓLAR",
    heroH1: "Proyecta tu campaña de Meta Ads antes de financiarla",
    heroBody:
      "EliteVault proyecta una campaña de Meta a 7 días en tres escenarios — conservador, balanceado y agresivo — usando tu presupuesto, tu ticket promedio y benchmarks actuales de tu nicho. Mira el rango probable de gasto, CPC, ROAS e ingresos antes de comprometerte, para que sepas si las cuentas siquiera cuadran.",
    heroCta: "Modelar mi campaña",
    heroCaption: "estimación, no predicción",
    scenariosH2: "Tres escenarios, modelados lado a lado",
    scenariosSub:
      "Una sola proyección esconde el riesgo. El modelador te muestra el piso, el punto medio realista y el techo, juntos.",
    scenario1Label: "Conservador",
    scenario1Body:
      "El caso cauteloso — CTR y ROAS más flojos. El piso con el que deberías poder vivir si el creativo no rinde.",
    scenario2Label: "Balanceado",
    scenario2Body:
      "El caso medio realista, armado con benchmarks actuales de tu nicho para tu AOV y presupuesto. Tu número para planificar.",
    scenario3Label: "Agresivo",
    scenario3Body:
      "El techo si el ángulo pega — mejor CTR y eficiencia. Cómo se vería que esto &ldquo;funcione&rdquo;.",
    inputsH2: "Con qué se construye el forecast",
    input1Label: "Tu presupuesto y AOV",
    input1Body:
      "El gasto diario y el ticket promedio anclan las cuentas a tu tienda, no a una plantilla genérica.",
    input2Label: "Benchmarks reales del nicho",
    input2Body:
      "Rangos de CPC, CPM, CTR y ROAS tomados de benchmarks actuales de ecommerce para tu categoría.",
    input3Label: "Tres escenarios en paralelo",
    input3Body:
      "Conservador, balanceado y agresivo — modelados juntos para que veas el rango completo antes de financiar.",
    honestyH2: "Una herramienta de planificación, no una bola de cristal",
    honestyBody1Pre: "Lo decimos claro: el forecast es una",
    honestyBody1Em: "estimación",
    honestyBody1Post:
      "basada en benchmarks reales y tus números — no una predicción de lo que va a pasar. La variable más grande no es el modelo, es tu tienda. Un gran forecast sobre una página que no convierte tráfico frío es solo una lección cara esperando a pasar.",
    honestyBody2:
      "Así que proyecta la campaña — y luego asegúrate de que el destino aguante el tráfico.",
    honestyLink: "Por qué tus Meta ads no convierten",
    finalH2: "Conoce las cuentas antes de gastar",
    finalBody:
      "Empieza gratis con una auditoría de tienda. El Modelador de Escenarios de Campaña de Meta Ads a 7 días vive en el plan Scale.",
    finalCta: "Empezar gratis",
  },
};

export const messages: Record<Locale, Dict> = { en, es };

/** Returns a `t(path)` lookup bound to a locale, with English fallback. */
export function translator(locale: Locale): (path: string) => string {
  const lookup = (dict: Dict, path: string): string | undefined => {
    let cur: string | Dict | undefined = dict;
    for (const key of path.split(".")) {
      if (typeof cur !== "object" || cur === null) return undefined;
      cur = cur[key];
      if (cur === undefined) return undefined;
    }
    return typeof cur === "string" ? cur : undefined;
  };
  return (path: string): string =>
    lookup(messages[locale], path) ?? lookup(messages.en, path) ?? path;
}
