const { serializeProductExperience } = require("./product-experience-serializer");

const WIZARD_STEPS = Object.freeze({
  TEMPLATE: 1,
  QUESTIONS: 2,
  PLAN: 3,
  APPROVAL: 4,
  LAUNCH: 5,
});

const WIZARD_TEMPLATES = Object.freeze([
  { id: "landing-page", label: "Landing Page", icon: "🌐" },
  { id: "web-app", label: "Web Application", icon: "🖥" },
  { id: "mobile-app", label: "Mobile App", icon: "📱" },
  { id: "rest-api", label: "REST API", icon: "⚙" },
  { id: "vscode-extension", label: "VS Code Extension", icon: "🧩" },
  { id: "existing-project", label: "Continue Existing Project", icon: "📂" },
]);

const TEMPLATE_QUESTIONS = Object.freeze({
  "landing-page": [
    field("businessName", "Business Name", "text", { required: true }),
    field("industry", "Industry", "text"),
    field("targetAudience", "Target Audience", "text"),
    field("framework", "Framework", "select", { options: ["Next.js", "React", "Astro", "Vue"] }),
    field("styling", "Styling", "select", { options: ["Tailwind", "CSS", "Bootstrap"] }),
    field("features", "Required Features", "multiselect", { options: ["Contact Form", "Pricing", "Testimonials", "FAQ", "Blog", "Authentication", "Dark Mode", "CMS"] }),
  ],
  "web-app": [
    field("projectName", "Project Name", "text", { required: true }),
    field("framework", "Framework", "select", { options: ["Next.js", "React", "Vue", "SvelteKit"] }),
    field("database", "Database", "select", { options: ["PostgreSQL", "SQLite", "MongoDB", "Supabase", "None"] }),
    field("authentication", "Authentication", "select", { options: ["None", "Email/Password", "OAuth", "Magic Link"] }),
    field("payments", "Payments", "select", { options: ["None", "Stripe", "PayPal"] }),
    field("features", "Features", "multiselect", { options: ["Dashboard", "Admin Panel", "API Required", "File Uploads", "Real-time Updates"] }),
  ],
  "mobile-app": [
    field("appName", "App Name", "text", { required: true }),
    field("platform", "Platform", "select", { options: ["React Native", "Flutter", "Expo"] }),
    field("backendApi", "Backend API", "select", { options: ["REST", "GraphQL", "Firebase", "Supabase", "None"] }),
    field("authentication", "Authentication", "select", { options: ["None", "Email/Password", "OAuth", "Biometric"] }),
    field("features", "Features", "multiselect", { options: ["Push Notifications", "Offline Support", "Camera", "Maps", "In-App Purchases"] }),
  ],
  "rest-api": [
    field("projectName", "Project Name", "text", { required: true }),
    field("language", "Language", "select", { options: ["TypeScript", "JavaScript", "Python", "Go", "Rust"] }),
    field("framework", "Framework", "select", { options: ["Express", "Fastify", "NestJS", "FastAPI", "Gin"] }),
    field("authentication", "Authentication", "select", { options: ["None", "JWT", "OAuth2", "API Keys"] }),
    field("database", "Database", "select", { options: ["PostgreSQL", "SQLite", "MongoDB", "Redis", "None"] }),
    field("features", "Features", "multiselect", { options: ["OpenAPI generation", "Docker", "Testing framework", "Rate limiting", "Webhooks"] }),
  ],
  "vscode-extension": [
    field("extensionName", "Extension Name", "text", { required: true }),
    field("purpose", "Purpose", "text", { required: true }),
    field("capabilities", "Capabilities", "multiselect", { options: ["Commands", "Views", "Tree Views", "Webviews", "Settings"] }),
    field("targetVersion", "Target VS Code version", "select", { options: ["1.85+", "1.90+", "1.95+", "Latest"] }),
  ],
  "existing-project": [
    field("goals", "Project Goals", "text", { required: true }),
    field("areas", "Areas to Improve", "multiselect", { options: ["Architecture", "Testing", "Performance", "Security", "Documentation", "UI/UX", "DevOps"] }),
    field("priorityFeatures", "Priority Features", "text"),
    field("testingRequired", "Testing Required", "select", { options: ["Unit tests", "Integration tests", "E2E tests", "Manual only"] }),
    field("deploymentTarget", "Deployment Target", "select", { options: ["Local", "Cloud", "CI/CD", "Undecided"] }),
  ],
});

function field(id, label, type, options = {}) {
  return { id, label, type, required: options.required === true, options: options.options || [] };
}

function createWizardSession(options = {}) {
  return { step: WIZARD_STEPS.TEMPLATE, templateId: null, goal: String(options.goal || "").slice(0, 1000), answers: {}, plan: null, approved: false };
}

function presentWizardState(session = {}, options = {}) {
  const step = normalizeStep(session.step);
  const templateId = session.templateId || null;
  const templates = WIZARD_TEMPLATES.map((entry) => ({ ...entry, selected: entry.id === templateId }));
  const questions = templateId ? (TEMPLATE_QUESTIONS[templateId] || []) : [];
  const plan = session.plan || null;
  return serializeProductExperience({
    title: "Build Wizard",
    step,
    totalSteps: 5,
    progressLabel: `Step ${step} of 5`,
    stepTitle: stepTitle(step),
    templates,
    templateId,
    goal: session.goal || "",
    questions,
    answers: sanitizeAnswers(session.answers || {}, questions),
    plan,
    planText: plan ? formatPlanForComposer(plan) : null,
    approved: session.approved === true,
    blockedReason: options.blockedReason || null,
    canProceed: canProceed(step, templateId, session.answers, questions, plan, session.approved),
    actions: stepActions(step, session.approved),
  });
}

function normalizeStep(step) {
  const numeric = Number(step);
  if (!Number.isFinite(numeric) || numeric < 1) return WIZARD_STEPS.TEMPLATE;
  if (numeric > 5) return WIZARD_STEPS.LAUNCH;
  return Math.floor(numeric);
}

function stepTitle(step) {
  const titles = {
    1: "What do you want to build?",
    2: "Project details",
    3: "Implementation plan",
    4: "Review and approve",
    5: "Launch Levi Composer",
  };
  return titles[step] || "Build Wizard";
}

function stepActions(step, approved) {
  if (step === WIZARD_STEPS.TEMPLATE) return { primary: "Next", secondary: "Cancel", showBack: false };
  if (step === WIZARD_STEPS.QUESTIONS) return { primary: "Generate Plan", secondary: "Cancel", showBack: true };
  if (step === WIZARD_STEPS.PLAN) return { primary: "Continue", secondary: "Cancel", showBack: true };
  if (step === WIZARD_STEPS.APPROVAL) return { primary: "Approve", secondary: "Cancel", showBack: false, tertiary: "Edit Plan" };
  if (step === WIZARD_STEPS.LAUNCH) return { primary: "Open Levi Composer", secondary: "Cancel", showBack: false };
  return { primary: "Next", secondary: "Cancel", showBack: false };
}

function canProceed(step, templateId, answers, questions, plan, approved) {
  if (step === WIZARD_STEPS.TEMPLATE) return Boolean(templateId);
  if (step === WIZARD_STEPS.QUESTIONS) return validateAnswers(answers, questions).valid;
  if (step === WIZARD_STEPS.PLAN) return Boolean(plan);
  if (step === WIZARD_STEPS.APPROVAL) return Boolean(plan);
  if (step === WIZARD_STEPS.LAUNCH) return approved === true && Boolean(plan);
  return false;
}

function validateAnswers(answers = {}, questions = []) {
  for (const question of questions) {
    if (!question.required) continue;
    const value = answers[question.id];
    if (value === undefined || value === null || String(value).trim() === "") {
      return { valid: false, reason: `${question.label} is required.` };
    }
    if (question.type === "multiselect" && (!Array.isArray(value) || !value.length)) {
      return { valid: false, reason: `Select at least one option for ${question.label}.` };
    }
  }
  return { valid: true };
}

function sanitizeAnswers(answers, questions) {
  const allowed = new Set((questions || []).map((question) => question.id));
  const output = {};
  for (const key of Object.keys(answers || {})) {
    if (!allowed.has(key)) continue;
    const question = questions.find((entry) => entry.id === key);
    const value = answers[key];
    if (question && question.type === "multiselect") output[key] = Array.isArray(value) ? value.slice(0, 20).map(String) : [];
    else output[key] = String(value === undefined || value === null ? "" : value).slice(0, 500);
  }
  return output;
}

function mergeAnswers(session, incoming = {}, questions = []) {
  const next = { ...(session.answers || {}) };
  const allowed = new Set((questions || []).map((question) => question.id));
  for (const key of Object.keys(incoming)) {
    if (!allowed.has(key)) continue;
    const question = questions.find((entry) => entry.id === key);
    const value = incoming[key];
    if (question && question.type === "multiselect") next[key] = Array.isArray(value) ? value.map(String).slice(0, 20) : [];
    else next[key] = String(value === undefined || value === null ? "" : value).slice(0, 500);
  }
  return next;
}

function generateImplementationPlan(templateId, answers = {}) {
  const template = WIZARD_TEMPLATES.find((entry) => entry.id === templateId);
  const label = template ? template.label : "Software project";
  const generators = {
    "landing-page": planLandingPage,
    "web-app": planWebApp,
    "mobile-app": planMobileApp,
    "rest-api": planRestApi,
    "vscode-extension": planVscodeExtension,
    "existing-project": planExistingProject,
  };
  const generator = generators[templateId] || planGeneric;
  const plan = generator(label, answers);
  if (answers.projectGoal) plan.summary = `${plan.summary || ""} Goal: ${String(answers.projectGoal).slice(0, 1000)}`.trim();
  return serializeProductExperience(plan);
}

function planLandingPage(label, answers) {
  const framework = answers.framework || "Next.js";
  const styling = answers.styling || "Tailwind";
  const features = list(answers.features);
  return basePlan({
    template: label,
    name: answers.businessName || "Landing Page",
    architecture: `${framework} marketing site with ${styling} styling and static content sections.`,
    folderStructure: ["src/", "src/components/", "src/pages/ or app/", "public/", "tests/"],
    packages: [frameworkPackage(framework), stylingPackage(styling), "eslint", "prettier"],
    dependencies: [framework, styling, ...features.filter((f) => ["Authentication", "CMS"].includes(f)).map((f) => featureDependency(f))].filter(Boolean),
    estimatedFiles: 12 + features.length * 2,
    security: ["Validate contact form inputs", "Use environment variables for API keys", "Enable HTTPS in production", answers.features && answers.features.includes("Authentication") ? "Use secure session handling" : null].filter(Boolean),
    testing: ["Component tests for hero, pricing, and contact form", "Accessibility checks for navigation and forms"],
    risks: ["Scope creep from optional CMS/auth features", "Content migration if CMS added later"],
    summary: `Landing page for ${answers.businessName || "the business"} targeting ${answers.targetAudience || "customers"} in ${answers.industry || "the industry"}.`,
  });
}

function planWebApp(label, answers) {
  const framework = answers.framework || "Next.js";
  const features = list(answers.features);
  return basePlan({
    template: label,
    name: answers.projectName || "Web Application",
    architecture: `${framework} full-stack web app with ${answers.database || "SQLite"} persistence${answers.authentication && answers.authentication !== "None" ? ` and ${answers.authentication} auth` : ""}.`,
    folderStructure: ["src/", "src/app/ or pages/", "src/components/", "src/lib/", "src/server/ or api/", "tests/"],
    packages: [frameworkPackage(framework), answers.database === "Supabase" ? "@supabase/supabase-js" : null, answers.payments === "Stripe" ? "stripe" : null, "eslint"].filter(Boolean),
    dependencies: [framework, answers.database, ...features.map((f) => featureDependency(f))].filter(Boolean),
    estimatedFiles: 25 + features.length * 4,
    security: ["Enforce authentication on protected routes", "Validate all API inputs", "Store secrets outside source control", answers.payments !== "None" ? "Use Stripe webhooks with signature verification" : null].filter(Boolean),
    testing: ["Unit tests for core business logic", "Integration tests for API routes", features.includes("Admin Panel") ? "Role-based access tests" : null].filter(Boolean),
    risks: ["Payment integration complexity", "Database schema changes during early iterations", features.includes("Real-time Updates") ? "WebSocket scaling considerations" : null].filter(Boolean),
    summary: `Web application ${answers.projectName || ""} using ${framework}.`,
  });
}

function planMobileApp(label, answers) {
  const platform = answers.platform || "Expo";
  const features = list(answers.features);
  return basePlan({
    template: label,
    name: answers.appName || "Mobile App",
    architecture: `${platform} client with ${answers.backendApi || "REST"} backend integration.`,
    folderStructure: ["src/", "src/screens/", "src/components/", "src/services/", "assets/", "__tests__/"],
    packages: [platform === "Flutter" ? "flutter" : "expo", "eslint"],
    dependencies: [platform, answers.backendApi, ...features.map((f) => featureDependency(f))].filter(Boolean),
    estimatedFiles: 20 + features.length * 3,
    security: ["Secure token storage on device", "Certificate pinning for production APIs", answers.authentication !== "None" ? "Protect auth flows from interception" : null].filter(Boolean),
    testing: ["Component/screen tests", "API service mocks", features.includes("Offline Support") ? "Offline sync tests" : null].filter(Boolean),
    risks: ["App store review delays", "Cross-platform UI inconsistencies", features.includes("In-App Purchases") ? "Store billing edge cases" : null].filter(Boolean),
    summary: `Mobile app ${answers.appName || ""} on ${platform}.`,
  });
}

function planRestApi(label, answers) {
  const framework = answers.framework || "Express";
  const language = answers.language || "TypeScript";
  const features = list(answers.features);
  return basePlan({
    template: label,
    name: answers.projectName || "REST API",
    architecture: `${language} ${framework} REST API with ${answers.database || "SQLite"} storage.`,
    folderStructure: ["src/", "src/routes/", "src/controllers/", "src/models/", "src/middleware/", "tests/", features.includes("Docker") ? "Dockerfile" : null].filter(Boolean),
    packages: [framework.toLowerCase(), language === "TypeScript" ? "typescript" : null, features.includes("Testing framework") ? "jest" : null, features.includes("OpenAPI generation") ? "swagger-ui-express" : null].filter(Boolean),
    dependencies: [language, framework, answers.database, answers.authentication !== "None" ? answers.authentication : null].filter(Boolean),
    estimatedFiles: 18 + features.length * 2,
    security: ["Authentication on protected endpoints", "Input validation middleware", "Rate limiting", "No secrets in repository"],
    testing: [features.includes("Testing framework") ? "Route integration tests with supertest" : "Manual endpoint verification", "Contract tests for OpenAPI spec"],
    risks: ["Breaking API changes without versioning", "Database migration mistakes", features.includes("Docker") ? "Container misconfiguration" : null].filter(Boolean),
    summary: `REST API ${answers.projectName || ""} in ${language}.`,
  });
}

function planVscodeExtension(label, answers) {
  const capabilities = list(answers.capabilities);
  return basePlan({
    template: label,
    name: answers.extensionName || "VS Code Extension",
    architecture: `VS Code extension (${answers.targetVersion || "Latest"}) providing ${answers.purpose || "workspace tooling"}.`,
    folderStructure: ["src/", "src/commands/", capabilities.includes("Webviews") ? "src/webviews/" : null, capabilities.includes("Tree Views") ? "src/views/" : null, "package.json", "tests/"].filter(Boolean),
    packages: ["@types/vscode", "eslint", "@vscode/test-electron"],
    dependencies: ["vscode", ...capabilities.map((c) => capabilityDependency(c))].filter(Boolean),
    estimatedFiles: 10 + capabilities.length * 3,
    security: ["Content Security Policy for webviews", "Allowlist webview messages", "No automatic command execution without approval"],
    testing: ["Extension activation tests", "Command registration tests", capabilities.includes("Webviews") ? "Webview message validation tests" : null].filter(Boolean),
    risks: ["API compatibility across VS Code versions", "Webview CSP regressions", "Activation performance on large workspaces"],
    summary: `Extension ${answers.extensionName || ""}: ${answers.purpose || ""}.`,
  });
}

function planExistingProject(label, answers) {
  const areas = list(answers.areas);
  return basePlan({
    template: label,
    name: "Existing Project",
    architecture: `Incremental improvements focused on ${areas.join(", ") || "selected areas"} without disruptive rewrites.`,
    folderStructure: ["Preserve current layout", "Add tests/ where missing", "Document changes in docs/"],
    packages: ["Use existing stack"],
    dependencies: ["No new dependencies unless required by priority features"],
    estimatedFiles: 5 + areas.length * 3,
    security: ["Review changes touching auth, secrets, or network boundaries", "Keep workspace trust enforcement intact"],
    testing: [answers.testingRequired || "Add tests aligned with existing framework"],
    risks: ["Regression in untouched modules", "Incomplete understanding of legacy behavior", areas.includes("Architecture") ? "Large refactor scope" : null].filter(Boolean),
    summary: answers.goals || "Improve the existing project incrementally.",
  });
}

function planGeneric(label, answers) {
  return basePlan({
    template: label,
    name: "Project",
    architecture: "Standard layered application structure.",
    folderStructure: ["src/", "tests/"],
    packages: [],
    dependencies: [],
    estimatedFiles: 10,
    security: ["Validate inputs", "Keep secrets out of source"],
    testing: ["Add unit tests for core logic"],
    risks: ["Unclear requirements"],
    summary: "Custom software project.",
  });
}

function basePlan(input) {
  return {
    template: input.template,
    name: input.name,
    summary: input.summary,
    architecture: input.architecture,
    folderStructure: input.folderStructure,
    packages: unique(input.packages),
    dependencies: unique(input.dependencies),
    estimatedFiles: input.estimatedFiles,
    securityConsiderations: input.security,
    testingStrategy: input.testing,
    potentialRisks: input.risks,
    generatedAt: new Date().toISOString(),
    codeGenerationStarted: false,
  };
}

function formatPlanForComposer(plan) {
  if (!plan) return "";
  const sections = [
    `[Build Plan] ${plan.template}: ${plan.name}`,
    "",
    plan.summary ? `Summary: ${plan.summary}` : null,
    "",
    "Architecture:",
    plan.architecture,
    "",
    "Folder structure:",
    ...(plan.folderStructure || []).map((entry) => `- ${entry}`),
    "",
    "Packages:",
    ...(plan.packages || []).map((entry) => `- ${entry}`),
    "",
    "Dependencies:",
    ...(plan.dependencies || []).map((entry) => `- ${entry}`),
    "",
    `Estimated files: ${plan.estimatedFiles}`,
    "",
    "Security considerations:",
    ...(plan.securityConsiderations || []).map((entry) => `- ${entry}`),
    "",
    "Testing strategy:",
    ...(plan.testingStrategy || []).map((entry) => `- ${entry}`),
    "",
    "Potential risks:",
    ...(plan.potentialRisks || []).map((entry) => `- ${entry}`),
    "",
    "Review this plan and click Send when ready. Levi will not change files until you approve each step.",
  ];
  return sections.filter((line) => line !== null).join("\n").slice(0, 12000);
}

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function frameworkPackage(framework) {
  if (framework === "Next.js") return "next";
  if (framework === "React") return "react";
  if (framework === "Astro") return "astro";
  if (framework === "Vue") return "vue";
  if (framework === "SvelteKit") return "@sveltejs/kit";
  return framework.toLowerCase();
}

function stylingPackage(styling) {
  if (styling === "Tailwind") return "tailwindcss";
  if (styling === "Bootstrap") return "bootstrap";
  return styling.toLowerCase();
}

function featureDependency(feature) {
  const map = {
    Authentication: "auth library",
    CMS: "headless CMS client",
    Dashboard: "chart library",
    "Admin Panel": "RBAC utilities",
    "API Required": "API client",
    "OpenAPI generation": "openapi-tools",
    Docker: "docker",
    "Testing framework": "jest",
    Commands: "vscode commands API",
    Views: "vscode views API",
    "Tree Views": "vscode tree view API",
    Webviews: "webview toolkit",
    Settings: "configuration contribution",
  };
  return map[feature] || null;
}

function capabilityDependency(capability) {
  return featureDependency(capability);
}

module.exports = {
  WIZARD_STEPS,
  WIZARD_TEMPLATES,
  TEMPLATE_QUESTIONS,
  createWizardSession,
  formatPlanForComposer,
  generateImplementationPlan,
  mergeAnswers,
  presentWizardState,
  validateAnswers,
};
