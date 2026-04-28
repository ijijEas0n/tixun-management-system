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
  if (seconds === null) return '--';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
}

export function parseTime800m(input: string): number | null {
  const parts = input.split(/[:：]/);
  if (parts.length === 2) {
    const min = parseFloat(parts[0]);
    const sec = parseFloat(parts[1]);
    if (!isNaN(min) && !isNaN(sec)) return min * 60 + sec;
  }
  const val = parseFloat(input);
  return isNaN(val) ? null : val;
}
