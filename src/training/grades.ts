export type Grade = 'A+' | 'A' | 'B' | 'C' | 'D';
export interface GradeAssessment {
  grade: Grade;
  absolute: Grade;
  population: number;
  atOrAbove: number;
  relative: boolean;
}
export type GradeCohort = { score: number; count: number }[];
export function absoluteGrade(score: number): Grade {
  if (!Number.isFinite(score) || score < 60) return 'D';
  if (score >= 95) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  return 'C';
}
/** Whole tie groups must fit strictly below 10%; repeats never create extra people. */
export function assessGrade(score: number, cohort: GradeCohort): GradeAssessment {
  const population = cohort.reduce((sum, group) => sum + group.count, 0);
  const atOrAbove = cohort.filter((group) => group.score >= score).reduce((sum, group) => sum + group.count, 0);
  const absolute = absoluteGrade(score);
  // Relative distinction never bypasses the operational readiness threshold.
  const relative = score >= 80 && population > 0 && atOrAbove > 0 && atOrAbove * 10 < population;
  return { grade: absolute === 'A+' || relative ? 'A+' : absolute, absolute, population, atOrAbove, relative };
}

export function isGradeAssessment(value: unknown): value is GradeAssessment {
  if (!value || typeof value !== 'object') return false;
  const v = value as GradeAssessment;
  const valid = (g: unknown) => ['A+', 'A', 'B', 'C', 'D'].includes(g as string);
  return (
    valid(v.grade) &&
    valid(v.absolute) &&
    Number.isInteger(v.population) &&
    v.population >= 0 &&
    Number.isInteger(v.atOrAbove) &&
    v.atOrAbove >= 0 &&
    v.atOrAbove <= v.population &&
    typeof v.relative === 'boolean'
  );
}
