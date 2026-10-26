import { absoluteGrade, type Grade, type GradeAssessment, isGradeAssessment } from './grades';
export function GradeMark({ grade, title }: { grade: Grade; title?: string }) {
  return (
    <span className="training-grade" data-grade={grade} title={title} aria-label={`評定 ${grade}`}>
      {grade}
    </span>
  );
}
export function GradeBadge({ score, assessment }: { score: number; assessment?: GradeAssessment | null }) {
  const current = isGradeAssessment(assessment) ? assessment : null;
  return (
    <GradeMark
      grade={current?.grade ?? absoluteGrade(score)}
      title={
        current?.relative ? '95点以上、かつ同点者を含めて上位10％未満' : '点数評定。A+は95点以上かつ共有順位で判定'
      }
    />
  );
}
