import { describe, it, expect } from 'vitest';
import { LESSONS, lessonDone } from '../src/shared/lessons';
import { EXAMPLES } from '../src/shared/examples';

describe('guided course', () => {
  it('has 16 basics lessons, unique ids, each opening an existing example', () => {
    expect(LESSONS.filter((l) => l.track === 'basics')).toHaveLength(16);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const l of LESSONS) expect(EXAMPLES.some((e) => e.id === l.example), l.id).toBe(true);
  });
  it('every lesson is bilingual and its quiz answers are valid', () => {
    for (const l of LESSONS) {
      for (const x of [l.title, l.summary, l.tryIt, ...l.goals, ...l.steps, ...l.explain, ...l.parts]) { expect(x.ar.length, l.id).toBeGreaterThan(0); expect(x.en.length, l.id).toBeGreaterThan(0); }
      expect(l.quiz.length, l.id).toBeGreaterThan(0);
      for (const q of l.quiz) { expect(q.answer).toBeGreaterThanOrEqual(0); expect(q.answer).toBeLessThan(q.options.length); }
    }
  });
  it('key code lines quoted by a lesson really appear in its example sketch', () => {
    const norm = (s: string) => s.replace(/\s+/g, ' ');
    const checked = LESSONS.map((l) => l.id);
    for (const id of checked) {
      const l = LESSONS.find((x) => x.id === id)!; const code = norm(EXAMPLES.find((e) => e.id === l.example)!.project().code);
      for (const c of l.code) if (!c.line.includes('...')) expect(code, `${id}: ${c.line}`).toContain(norm(c.line));
    }
  });
  it('a lesson is done only after both running and the quiz', () => {
    expect(lessonDone({ ran: true })).toBe(false); expect(lessonDone({ quiz: true })).toBe(false); expect(lessonDone({ ran: true, quiz: true })).toBe(true);
  });
});
