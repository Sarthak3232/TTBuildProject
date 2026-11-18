import type { Page } from "@playwright/test";
import { fakeReelMotor } from "./fakeReelMotor";

// Injects streams only into isolated test pages; never requests a real USB port.
export async function installFakeUsb(page: Page, options: Parameters<typeof fakeReelMotor>[0] = {}) {
  await page.addInitScript(({ source, settings }) => {
    const create = new Function(`return (${source})`)();
    const fake = create(settings);
    Object.defineProperty(window, "motorCommands", { value: fake.commands });
    Object.defineProperty(navigator, "serial", { configurable: true, value: { requestPort: async () => fake.port } });
  }, { source: fakeReelMotor.toString(), settings: options });
}
export async function connectMachine(page: Page) {
  await page.getByRole("button", { name: "Connect USB", exact: true }).click();
  await page.getByLabel("I checked the sector order", { exact: false }).check();
  await page.getByRole("button", { name: "Confirm saved calibration & closed drawers" }).click();
  await page.getByRole("status").filter({ hasText: "Machine ready." }).waitFor();
}
export function motorCommands(page: Page) {
  return page.evaluate(() => (window as typeof window & { motorCommands: string[] }).motorCommands.filter(c => c !== "PING"));
}
