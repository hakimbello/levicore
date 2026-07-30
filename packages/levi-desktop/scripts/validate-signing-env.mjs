const required = process.argv.includes("--required");

const credentialPairs = [
  ["WIN_CSC_LINK", "CSC_LINK"],
  ["WIN_CSC_KEY_PASSWORD", "CSC_KEY_PASSWORD"]
];

function hasValue(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

function hasAny(names) {
  return names.some((name) => hasValue(name));
}

if (!required) {
  process.exit(0);
}

const missing = credentialPairs.filter((names) => !hasAny(names)).map((names) => names.join(" or "));

if (missing.length) {
  console.error("Windows code signing was explicitly requested, but required credential environment variables are missing.");
  for (const name of missing) {
    console.error(`Missing: ${name}`);
  }
  console.error("Provide a certificate through WIN_CSC_LINK or CSC_LINK and its password through WIN_CSC_KEY_PASSWORD or CSC_KEY_PASSWORD.");
  console.error("Do not commit certificates, passwords, or signing tokens to the repository.");
  process.exit(1);
}
