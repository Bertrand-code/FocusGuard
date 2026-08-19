import type { Schedule, WeeklyWindow } from "@focusguard/schemas";

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

interface LocalClock {
  day: number;
  minute: number;
}

function localClock(timestamp: Date, timeZone: string): LocalClock | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(timestamp);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const day = WEEKDAYS[values.weekday ?? ""];
    const hour = Number(values.hour);
    const minute = Number(values.minute);
    if (day === undefined || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
    return { day, minute: hour * 60 + minute };
  } catch {
    return null;
  }
}

function minutes(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function windowContains(window: WeeklyWindow, clock: LocalClock): boolean {
  const start = minutes(window.start);
  const end = minutes(window.end);
  if (start === end) return window.days.includes(clock.day);
  if (start < end) {
    return window.days.includes(clock.day) && clock.minute >= start && clock.minute < end;
  }

  if (window.days.includes(clock.day) && clock.minute >= start) return true;
  const previousDay = (clock.day + 6) % 7;
  return window.days.includes(previousDay) && clock.minute < end;
}

export function isScheduleActive(schedule: Schedule, timestamp: Date): boolean {
  const time = timestamp.getTime();
  if (schedule.validFrom && time < Date.parse(schedule.validFrom)) return false;
  if (schedule.validUntil && time >= Date.parse(schedule.validUntil)) return false;
  const clock = localClock(timestamp, schedule.timeZone);
  return clock !== null && schedule.windows.some((window) => windowContains(window, clock));
}
