import { absoluteGrade, type GradeAssessment } from './grades';
export function GradeBadge({ score, assessment }: { score: number; assessment?: GradeAssessment | null }) {
  const grade = assessment?.grade ?? absoluteGrade(score);
  return (
    <span
      className="training-grade"
      data-grade={grade}
      title={assessment?.relative ? '同点者を含め、同じモードの上位10％未満' : 'マスター得点による評定'}
      aria-label={`評定 ${grade}`}
    >
      {grade}
    </span>
  );
}
