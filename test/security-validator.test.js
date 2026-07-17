const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SECURITY_RESULTS,
  SECURITY_SEVERITIES,
  SecurityValidator,
  findingKey,
} = require("../src/security-validator");

const BASE_TIME = "2026-07-17T00:00:00.000Z";

test("returns SAFE when no security rules report findings", () => {
  const validator = new SecurityValidator({
    now: () => BASE_TIME,
  });

  assert.deepEqual(validator.validateAction({ action: "safe" }, {}), {
    status: SECURITY_RESULTS.SAFE,
    findings: [],
  });
});

test("normalizes warning findings from action validators", () => {
  const validator = new SecurityValidator({
    now: () => BASE_TIME,
    actionValidators: [() => ({
      ruleId: "unsafe-command",
      title: "Unsafe command",
      description: "Command may be unsafe.",
      severity: SECURITY_SEVERITIES.MEDIUM,
      status: SECURITY_RESULTS.WARNING,
      evidence: {
        command: "npm install",
      },
      remediation: "Review command before execution.",
      metadata: {
        source: "test",
      },
    })],
  });

  const result = validator.validateAction({ action: "execute_shell_command" }, {});

  assert.equal(result.status, SECURITY_RESULTS.WARNING);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id.startsWith("security-"), true);
  assert.equal(result.findings[0].timestamp, BASE_TIME);
  assert.equal(findingKey(result.findings[0]), 'unsafe-command:{"command":"npm install"}');
});

test("uses highest severity status across findings", () => {
  const validator = new SecurityValidator({
    now: () => BASE_TIME,
    resultValidators: [() => [{
      ruleId: "xss",
      title: "Possible XSS",
      description: "Output includes unsafe HTML.",
      severity: SECURITY_SEVERITIES.HIGH,
      status: SECURITY_RESULTS.REQUIRES_REVIEW,
      evidence: {
        file: "index.html",
      },
      remediation: "Sanitize untrusted HTML.",
    }, {
      ruleId: "secret",
      title: "Secret exposed",
      description: "A secret appears in output.",
      severity: SECURITY_SEVERITIES.CRITICAL,
      status: SECURITY_RESULTS.BLOCKED,
      evidence: {
        key: "token",
      },
      remediation: "Remove the secret.",
    }]],
  });

  const result = validator.validateResult({ changed: true }, {});

  assert.equal(result.status, SECURITY_RESULTS.BLOCKED);
  assert.equal(result.findings.length, 2);
});
