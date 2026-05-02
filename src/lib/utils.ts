import { pinyin } from 'pinyin-pro';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getFirstLetter(name: string): string {
  if (!name) return '#';
  const firstChar = name.trim()[0];
  const py = pinyin(firstChar, { pattern: 'initial', toneType: 'none' });
  const letter = py ? py[0].toUpperCase() : firstChar.toUpperCase();
  return /^[A-Z]$/.test(letter) ? letter : '#';
}

export function formatTime800m(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
}

export function parseTime800m(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[:：]/);
  if (parts.length === 2) {
    const min = parseFloat(parts[0]);
    const sec = parseFloat(parts[1]);
    if (!isNaN(min) && !isNaN(sec) && min >= 0 && sec >= 0 && sec < 60) return min * 60 + sec;
    return null;
  }
  const val = parseFloat(trimmed);
  return isNaN(val) || val < 0 ? null : val;
}
