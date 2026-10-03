import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useRelativeTime } from "./relative-time";

afterEach(cleanup);

function Probe({ at }: { at: string }) {
  const relativeTime = useRelativeTime();
  return <span>{relativeTime(at)}</span>;
}

describe("useRelativeTime", () => {
  it("measures from the real time, not the provider's page-load `now` (no 'in 3 minutes' for a past event)", () => {
    const pageLoad = new Date(Date.now() - 5 * 60_000); // provider froze `now` 5 min ago
    const failedAt = new Date(Date.now() - 2 * 60_000).toISOString(); // happened after page load
    render(
      <NextIntlClientProvider locale="en" messages={{}} now={pageLoad} timeZone="UTC">
        <Probe at={failedAt} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("2 minutes ago")).toBeInTheDocument();
  });
});
