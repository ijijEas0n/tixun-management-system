import { SportEventKey } from '../types';

export type ScoreInputParseResult = { value: number | null; error?: never } | { value?: never; error: string };

function parsePlainNumber(input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  if (!/^-?\d+(\.\d+)?$/.test(text)) return Number.NaN;
  return Number(text);
}

function parseTimeScore(input: string): ScoreInputParseResult {
  const text = input.trim();
  if (!text) return { value: null };

  const timeMatch = text.match(/^(-?\d+(?:\.\d+)?)[:：](\d+(?:\.\d+)?)$/);
  if (timeMatch) {
    const minutes = Number(timeMatch[1]);
    const seconds = Number(timeMatch[2]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) {
      return { error: '时间格式无效' };
    }
    const value = minutes * 60 + seconds;
    if (value < 0) return { error: '成绩不能为负数' };
    if (value > 600) return { error: '成绩明显异常，请检查' };
    return { value: Number(value.toFixed(2)) };
  }

  const value = parsePlainNumber(text);
  if (value === null) return { value: null };
  if (!Number.isFinite(value)) return { error: '成绩格式无效' };
  if (value < 0) return { error: '成绩不能为负数' };
  if (value > 600) return { error: '成绩明显异常，请检查' };
  return { value };
}

export function parseScoreInput(event: SportEventKey, input: string): ScoreInputParseResult {
  if (event === 'eightHundred') return parseTimeScore(input);

  const value = parsePlainNumber(input);
  if (value === null) return { value: null };
  if (!Number.isFinite(value)) return { error: '成绩格式无效' };
  if (value < 0) return { error: '成绩不能为负数' };
  if (event === 'hundred' && value > 60) return { error: '成绩明显异常，请检查' };
  if ((event === 'shotPut' || event === 'tripleJump') && value > 30) return { error: '成绩明显异常，请检查' };
  return { value };
}

