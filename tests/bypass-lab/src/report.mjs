import { writeFile } from "node:fs/promises";

const report = {
  generatedAt: new Date().toISOString(),
  scope: "Defensive testing of FocusGuard's own Chrome-profile enforcement boundary",
  automated: {
    covered: [
      "direct navigation",
      "redirect destinations visible to webNavigation",
      "encoded-host rejection",
      "subdomains and DNS label boundaries",
      "alternate ports",
      "IPv4 and IPv6 navigation",
      "userinfo hostname confusion",
    ],
    result: "See the preceding Vitest result; this report is generated only after it passes.",
  },
  manualRequired: [
    "incognito access state and split-profile cache",
    "alternate Chrome profiles",
    "extension disable and uninstall visibility",
    "browser restart with an offline API",
    "service-worker suspension during redirect chains",
    "system-clock rollback health indicator",
  ],
  knownLimits: [
    "An unmanaged extension cannot prevent disablement, uninstall, or use of another profile/browser.",
    "A URL shortener cannot be classified by destination until Chrome reveals the redirect navigation.",
    "Trusted time is unavailable while the device is offline.",
  ],
};

await writeFile(new URL("../bypass-report.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`, {
  mode: 0o600,
});
